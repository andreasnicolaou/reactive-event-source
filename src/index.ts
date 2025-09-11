import {
  Observable,
  Subject,
  fromEvent,
  throwError,
  timer,
  merge,
  defer,
  EMPTY,
  ReplaySubject,
  of,
  BehaviorSubject,
} from 'rxjs';
import { retry, catchError, switchMap, takeUntil, finalize, share, raceWith } from 'rxjs/operators';
import { EventSourceError } from './error';

export type EventSourceEventType = 'open' | 'message' | 'error' | (string & Record<never, never>);
export type EventSourceOptions = {
  maxRetries: number;
  initialDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  connectionTimeout?: number; // in milliseconds
  withCredentials?: boolean;
};

// Re-export the error class for convenience
export { EventSourceError } from './error';

export class ReactiveEventSource {
  private readonly destroy$ = new Subject<void>();
  private readonly eventListenerCleanup = new Map<string, () => void>();
  private readonly eventSource$: Observable<EventSource>;
  private readonly eventSubjects = new Map<string, Subject<MessageEvent>>();
  private lastEventSource!: EventSource;
  private readonly options: Required<EventSourceOptions>;
  private readonly readyStateSubject$ = new BehaviorSubject<number>(2); // Track connection state
  private readonly subscriptions = new Map<string, { unsubscribe(): void }>(); // Track subscriptions for cleanup
  private readonly url: string | URL;

  /**
   * Creates an instance of reactive event source.
   * @param url - The URL or URL object for the SSE connection.
   * @param options - Optional configuration for retry behavior and credentials.
   */
  constructor(url: string | URL, options?: Partial<EventSourceOptions>) {
    this.url = url;
    this.options = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      connectionTimeout: 15000,
      withCredentials: false,
      ...options,
    };

    this.eventSource$ = this.createEventSource();
  }

  /**
   * Gets the current connection state of the EventSource
   * @returns {0 | 1 | 2} The ready state:
   *   - 0 (CONNECTING): The connection is being established
   *   - 1 (OPEN): The connection is active and receiving events
   *   - 2 (CLOSED): The connection is closed or failed
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public get readyState(): number {
    return this.readyStateSubject$.value;
  }

  /**
   * Observable that emits the current connection state
   * @returns Observable<number> Stream of connection state changes
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public get readyState$(): Observable<number> {
    return this.readyStateSubject$.asObservable();
  }

  /**
   * Determines if credentials (cookies, HTTP auth) are sent with requests
   * @returns {boolean} True if credentials are being sent, false otherwise
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public get withCredentials(): boolean {
    return this.options.withCredentials ?? false;
  }

  /**
   * Gets the resolved URL string used for the EventSource connection
   * @returns {string} The fully qualified URL as a string
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public get URL(): string {
    return this.url.toString();
  }

  /**
   * Closes the SSE connection and completes all internal subjects and observables.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public close(): void {
    // Clean up subscriptions first
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.clear();

    // Clean up event listeners
    this.eventListenerCleanup.forEach((cleanup) => cleanup());
    this.eventListenerCleanup.clear();

    // Close the EventSource
    this.lastEventSource?.close();

    // Update ready state
    this.readyStateSubject$.next(2);

    // Complete all event subjects
    this.eventSubjects.forEach((subject) => {
      if (!subject.closed) {
        subject.complete();
      }
    });
    this.eventSubjects.clear();

    // Complete internal subjects
    this.destroy$.next();
    this.destroy$.complete();
    this.readyStateSubject$.complete();
  }

  /**
   * Subscribes to a specific SSE event type and returns it as an Observable.
   * @param eventType - The name of the event to listen for (e.g., "message", "error", "open").
   * @returns An Observable that emits events of the given type.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public on(eventType: EventSourceEventType = 'message'): Observable<MessageEvent> {
    if (!this.eventSubjects.has(eventType)) {
      // Always use ReplaySubject(1) to buffer the last event
      const subject = new ReplaySubject<MessageEvent>(1);
      this.eventSubjects.set(eventType, subject);

      // Set up event listener for this specific event type
      this.setupEventListener(eventType, subject);
    }

    return this.eventSubjects.get(eventType)!.asObservable();
  }

  /**
   * Creates an observable EventSource instance with optional credentials and automatic reconnection.
   * @returns An observable that manages the EventSource lifecycle and reconnection strategy.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  private createEventSource(): Observable<EventSource> {
    return defer(() => {
      if (!window.EventSource) {
        /* istanbul ignore next */
        return throwError(() => new EventSourceError('EventSource is not supported in this environment'));
      }

      // Close previous EventSource if it exists before creating a new one
      /* istanbul ignore next */
      if (this.lastEventSource) {
        this.lastEventSource.close();
      }

      this.lastEventSource = new EventSource(this.url, { withCredentials: this.options.withCredentials });

      // Update ready state immediately
      this.readyStateSubject$.next(this.lastEventSource.readyState);

      const open$ = fromEvent(this.lastEventSource, 'open').pipe(
        switchMap(() => {
          this.readyStateSubject$.next(1); // OPEN
          return of(this.lastEventSource);
        })
      );

      const error$ = fromEvent(this.lastEventSource, 'error').pipe(
        switchMap(() => {
          this.readyStateSubject$.next(this.lastEventSource.readyState);
          /* istanbul ignore next */
          if (this.lastEventSource.readyState === EventSource.CONNECTING) {
            return throwError(() => new EventSourceError('Initial connection failed'));
          }
          return EMPTY;
        })
      );

      const timeout$ = timer(this.options.connectionTimeout).pipe(
        /* istanbul ignore next */
        switchMap(() => {
          this.readyStateSubject$.next(2); // CLOSED
          return throwError(() => new EventSourceError('Connection timeout'));
        })
      );

      return merge(open$, error$).pipe(
        raceWith(timeout$),
        retry({
          count: this.options.maxRetries,
          delay: (error, attempt) => {
            if (error instanceof EventSourceError) {
              /* istanbul ignore next */
              if (attempt >= this.options.maxRetries) {
                this.readyStateSubject$.next(2); // CLOSED
                return throwError(() => new EventSourceError(error.message));
              }
              /* istanbul ignore next */
              const baseDelay = Math.min(this.options.initialDelay * Math.pow(2, attempt), this.options.maxDelay);
              /* istanbul ignore next */
              const retryAfter = Math.random() * baseDelay;
              /* istanbul ignore next */
              console.log(`Retrying connection (attempt ${attempt + 1}) in ${retryAfter}ms`);
              /* istanbul ignore next */
              this.readyStateSubject$.next(0); // CONNECTING
              /* istanbul ignore next */
              return timer(retryAfter);
            }
            /* istanbul ignore next */
            return throwError(() => new EventSourceError('Unrecoverable EventSource error', attempt));
          },
        }),
        takeUntil(this.destroy$),
        finalize(() => {
          /* istanbul ignore next */
          if (this.lastEventSource) {
            this.lastEventSource.close();
          }
          /* istanbul ignore next */
          this.readyStateSubject$.next(2); // CLOSED
        })
      );
    }).pipe(
      share({
        connector: () => new ReplaySubject(1),
        resetOnComplete: false,
        resetOnError: false,
        resetOnRefCountZero: false,
      })
    );
  }

  /**
   * Sets up an event listener for a specific event type
   * @param eventType - The event type to listen for
   * @param subject - The subject to emit events to
   */
  private setupEventListener(eventType: string, subject: Subject<MessageEvent>): void {
    const subscription = this.eventSource$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((eventSource) => {
          // Update ready state when we get a new EventSource
          this.readyStateSubject$.next(eventSource.readyState);

          return fromEvent<MessageEvent>(eventSource, eventType).pipe(
            catchError((err) => {
              /* istanbul ignore next */
              console.error(`Error in "${eventType}" event`, err);
              /* istanbul ignore next */
              subject.error(err);
              /* istanbul ignore next */
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: (event) => subject.next(event),
        /* istanbul ignore next */
        error: (err) => subject.error(err),
        /* istanbul ignore next */
        complete: () => subject.complete(),
      });

    // Store subscription for cleanup
    this.subscriptions.set(eventType, subscription);

    // Store cleanup function
    this.eventListenerCleanup.set(eventType, () => {
      // Unsubscribe first
      const sub = this.subscriptions.get(eventType);
      if (sub) {
        sub.unsubscribe();
        this.subscriptions.delete(eventType);
      }

      // Complete subject if not already closed
      /* istanbul ignore next */
      if (!subject.closed) {
        subject.complete();
      }
    });
  }
}
