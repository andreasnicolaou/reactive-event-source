import {
  BehaviorSubject,
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  Subscription,
  defer,
  distinctUntilChanged,
  finalize,
  fromEvent,
  ignoreElements,
  merge,
  of,
  retry,
  share,
  switchMap,
  takeUntil,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { EventSourceError } from './error';

export type EventSourceEventType = 'open' | 'message' | 'error' | (string & Record<never, never>);
export type EventSourceOptions = {
  /**
   * How many times the EventSource is re-created after a fatal failure (the browser gave up, or the
   * connection timed out) before the streams error. Resets every time a connection opens successfully.
   * Use `Infinity` to retry forever.
   */
  maxRetries: number;
  /** Base delay before the first retry, in milliseconds. Doubles on every consecutive failure. */
  initialDelay: number;
  /** Upper bound for the base delay, in milliseconds. */
  maxDelay: number;
  /** How long to wait for the `open` event before treating the attempt as failed, in milliseconds. */
  connectionTimeout?: number;
  withCredentials?: boolean;
};

// Re-export the error class for convenience
export { EventSourceError } from './error';

// EventSource.readyState values. Literals rather than EventSource.* so a polyfill without the statics still works.
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

type EventStream = {
  subject: ReplaySubject<Event>;
  subscription: Subscription;
};

export class ReactiveEventSource {
  private readonly destroy$ = new Subject<void>();
  private readonly eventSource$: Observable<EventSource>;
  private isClosed = false;
  private readonly options: Required<EventSourceOptions>;
  private readonly readyStateSubject$ = new BehaviorSubject<number>(CLOSED);
  private readonly streams = new Map<string, EventStream>();
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
   * Observable that emits the current connection state, without consecutive duplicates
   * @returns Observable<number> Stream of connection state changes
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public get readyState$(): Observable<number> {
    return this.readyStateSubject$.pipe(distinctUntilChanged());
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
   * Safe to call more than once.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;

    // Tear down the shared connection. This closes the underlying EventSource via finalize.
    this.destroy$.next();
    this.destroy$.complete();

    // Complete every event stream handed out by on()
    this.streams.forEach(({ subject, subscription }) => {
      subscription.unsubscribe();
      subject.complete();
    });
    this.streams.clear();

    this.readyStateSubject$.next(CLOSED);
    this.readyStateSubject$.complete();
  }

  /**
   * Subscribes to a specific SSE event type and returns it as an Observable.
   * The underlying connection is opened the first time this method is called, not on subscribe.
   * The returned observable replays the last event to late subscribers, errors with an
   * EventSourceError once retries are exhausted, and completes when close() is called.
   * @param eventType - The name of the event to listen for (e.g., "message", "error", "open").
   * @returns An Observable that emits events of the given type.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  public on(eventType: 'open' | 'error'): Observable<Event>;
  public on(eventType?: EventSourceEventType): Observable<MessageEvent>;
  public on(eventType: EventSourceEventType = 'message'): Observable<Event> {
    if (this.isClosed) {
      return EMPTY;
    }

    let stream = this.streams.get(eventType);
    if (!stream) {
      stream = this.setupEventListener(eventType);
      this.streams.set(eventType, stream);
    }
    return stream.subject.asObservable();
  }

  /**
   * Creates an observable EventSource instance with optional credentials and automatic reconnection.
   *
   * Reconnection policy: a native EventSource reconnects on its own when the connection drops
   * (readyState goes to CONNECTING and it resends Last-Event-ID), so that case is left to the browser.
   * This wrapper only re-creates the EventSource when the browser has given up (readyState CLOSED,
   * e.g. a non-200 response) or when the `open` event does not arrive within `connectionTimeout`.
   * @returns An observable that manages the EventSource lifecycle and reconnection strategy.
   * @author Andreas Nicolaou
   * @memberof ReactiveEventSource
   */
  private createEventSource(): Observable<EventSource> {
    // Consecutive failed attempts. Reset whenever a connection opens, so the budget applies per outage.
    let failures = 0;

    // Emits the EventSource as soon as it is created, so per-type listeners attach before `open` fires.
    const attempt$ = defer(() => {
      const es = new EventSource(this.url, { withCredentials: this.options.withCredentials });
      this.readyStateSubject$.next(es.readyState);

      const opened$ = fromEvent(es, 'open');

      const open$ = opened$.pipe(
        tap(() => {
          failures = 0;
          this.readyStateSubject$.next(OPEN);
        }),
        ignoreElements()
      );

      const error$ = fromEvent(es, 'error').pipe(
        switchMap(() => {
          this.readyStateSubject$.next(es.readyState);
          return es.readyState === CLOSED ? throwError(() => new EventSourceError('Connection closed')) : EMPTY;
        })
      );

      const timeout$ = timer(this.options.connectionTimeout).pipe(
        takeUntil(opened$),
        switchMap(() => throwError(() => new EventSourceError('Connection timeout')))
      );

      return merge(of(es), open$, error$, timeout$).pipe(finalize(() => es.close()));
    }).pipe(
      retry({
        delay: (error: unknown) => {
          if (!(error instanceof EventSourceError)) {
            const detail = error instanceof Error ? error.message : String(error);
            return throwError(() => new EventSourceError(`Unrecoverable EventSource error: ${detail}`, -1, error));
          }
          failures++;
          if (failures > this.options.maxRetries) {
            this.readyStateSubject$.next(CLOSED);
            const retries = this.options.maxRetries;
            return throwError(() => new EventSourceError(`${error.reason} (retries exhausted)`, retries, error));
          }
          this.readyStateSubject$.next(CONNECTING);
          return timer(this.retryDelay(failures));
        },
      })
    );

    return defer(() => {
      if (typeof globalThis.EventSource !== 'function') {
        return throwError(() => new EventSourceError('EventSource is not supported in this environment'));
      }
      return attempt$;
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.readyStateSubject$.next(CLOSED)),
      share({
        connector: () => new ReplaySubject(1),
        resetOnComplete: false,
        resetOnError: false,
        resetOnRefCountZero: false,
      })
    );
  }

  /**
   * Exponential backoff with equal jitter: the wait lies in [base / 2, base) where
   * base = min(initialDelay * 2^(retryCount - 1), maxDelay).
   * @param retryCount - 1-based number of the retry about to be made
   */
  private retryDelay(retryCount: number): number {
    const base = Math.min(this.options.initialDelay * 2 ** (retryCount - 1), this.options.maxDelay);
    return base / 2 + Math.random() * (base / 2);
  }

  /**
   * Wires a ReplaySubject to the given event type on whichever EventSource is currently live.
   * @param eventType - The event type to listen for
   */
  private setupEventListener(eventType: string): EventStream {
    const subject = new ReplaySubject<Event>(1);
    const subscription = this.eventSource$
      .pipe(
        distinctUntilChanged(),
        switchMap((eventSource) => fromEvent(eventSource, eventType)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (event) => subject.next(event),
        error: (err) => subject.error(err),
      });

    return { subject, subscription };
  }
}
