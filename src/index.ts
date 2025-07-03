import { Observable, Subject, fromEvent, throwError, timer, merge, defer, EMPTY, ReplaySubject, of } from 'rxjs';
import { retry, catchError, switchMap, takeUntil, finalize, share, raceWith } from 'rxjs/operators';
import { EventSourceError } from './error';

export type EventSourceEventType = 'open' | 'message' | 'error' | (string & {});
export type EventSourceOptions = {
  maxRetries: number;
  initialDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  connectionTimeout?: number; // in milliseconds
  withCredentials?: boolean;
};

export class ReactiveEventSource {
  private readonly destroy$ = new Subject<void>();
  private readonly eventSource$: Observable<EventSource>;
  private readonly eventSubjects = new Map<string, ReplaySubject<MessageEvent>>();
  private lastEventSource!: EventSource;
  private readonly options: EventSourceOptions;
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
    return this.lastEventSource?.readyState ?? 2;
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
    this.lastEventSource?.close();
    this.eventSubjects.forEach((subject) => {
      if (!subject.closed) {
        subject.complete();
      }
    });
    this.eventSubjects.clear();
    this.destroy$.next();
    this.destroy$.complete();
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
      this.eventSubjects.set(eventType, new ReplaySubject<MessageEvent>(1)); // Buffers last event

      this.eventSource$
        .pipe(
          takeUntil(this.destroy$),
          switchMap((eventSource) =>
            fromEvent<MessageEvent>(eventSource, eventType).pipe(
              catchError((err) => {
                console.error(`Error in "${eventType}" event`, err);
                return EMPTY;
              })
            )
          ),
          finalize(() => {
            this.eventSubjects.delete(eventType);
          })
        )
        .subscribe((event) => {
          this.eventSubjects.get(eventType)?.next(event);
        });
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
        return throwError(() => new EventSourceError('EventSource is not supported in this environment'));
      }

      this.lastEventSource = new EventSource(this.url, { withCredentials: this.options.withCredentials });
      this.setupEventForwarding();

      const open$ = fromEvent(this.lastEventSource, 'open').pipe(switchMap(() => of(this.lastEventSource)));
      const error$ = fromEvent(this.lastEventSource, 'error').pipe(
        switchMap(() => {
          if (this.lastEventSource.readyState === EventSource.CONNECTING) {
            return throwError(() => new EventSourceError('Initial connection failed'));
          }
          return EMPTY;
        })
      );
      const timeout$ = timer(this.options.connectionTimeout ?? 15000).pipe(
        switchMap(() => throwError(() => new EventSourceError('Connection timeout')))
      );

      return merge(open$, error$).pipe(
        raceWith(timeout$),
        retry({
          count: this.options.maxRetries,
          delay: (error, attempt) => {
            if (error instanceof EventSourceError) {
              if (attempt >= this.options.maxRetries) {
                return throwError(() => new EventSourceError(error.message));
              }
              const baseDelay = Math.min(this.options.initialDelay * Math.pow(2, attempt), this.options.maxDelay);
              const retryAfter = Math.random() * baseDelay;
              console.log(`Retrying connection (attempt ${attempt + 1}) in ${retryAfter}ms`);
              return timer(retryAfter);
            }
            return throwError(() => new EventSourceError('Unrecoverable EventSource error', attempt));
          },
        }),
        takeUntil(this.destroy$),
        finalize(() => {
          this.lastEventSource?.close();
          this.eventSubjects.forEach((subject) => subject.complete());
          this.eventSubjects.clear();
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
   * Sets up listeners on the EventSource for core events (open, message, error),
   * forwarding those events to the corresponding subjects for subscribers.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  private setupEventForwarding(): void {
    const coreEvents = ['open', 'message', 'error'] as const;
    coreEvents.forEach((eventType) => {
      if (!this.eventSubjects.has(eventType)) {
        this.eventSubjects.set(eventType, new ReplaySubject<MessageEvent>(1));
      }

      fromEvent<MessageEvent>(this.lastEventSource, eventType)
        .pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            console.error(`Error in "${eventType}" event`, err);
            return EMPTY;
          })
        )
        .subscribe((event) => {
          this.eventSubjects.get(eventType)?.next(event);
        });
    });
  }
}
