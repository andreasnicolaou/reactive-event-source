/* eslint-disable @typescript-eslint/no-explicit-any */
import { lastValueFrom, Subscription } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { EventSourceError, ReactiveEventSource } from './index';

/**
 * Minimal EventSource stand-in built on the real (jsdom) EventTarget, so multiple listeners per type,
 * removeEventListener and dispatch semantics all behave like a browser.
 */
class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = [];
  closeCalled = false;
  readonly listenerCounts: Record<string, number> = {};
  readyState = 0;
  readonly url: string;
  readonly withCredentials: boolean;

  constructor(url: string | URL, init?: EventSourceInit) {
    super();
    if (String(url) === 'invalid') {
      throw new SyntaxError('Invalid URL');
    }
    if (String(url) === 'throws-non-error') {
      throw 'not an Error instance';
    }
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  static get latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.listenerCounts[type] = (this.listenerCounts[type] ?? 0) + 1;
    super.addEventListener(type, listener, options);
  }

  public close(): void {
    this.readyState = 2;
    this.closeCalled = true;
  }

  /** Browser gave up (e.g. non-200 response): readyState CLOSED, then an error event. */
  public fail(): void {
    this.readyState = 2;
    this.dispatchEvent(new Event('error'));
  }

  public message(data: string, type = 'message'): void {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }

  /** Native auto-reconnect: readyState CONNECTING, then an error event. */
  public networkDrop(): void {
    this.readyState = 0;
    this.dispatchEvent(new Event('error'));
  }

  public open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.listenerCounts[type] = (this.listenerCounts[type] ?? 0) - 1;
    super.removeEventListener(type, listener, options);
  }

  public totalListeners(): number {
    return Object.values(this.listenerCounts).reduce((a, b) => a + b, 0);
  }
}

const testUrl = 'http://test.com/events';

type Recorder = { values: any[]; error?: unknown; completed: boolean; subscription: Subscription };
const record = (source: ReactiveEventSource, eventType?: string): Recorder => {
  const rec: Recorder = { values: [], completed: false, subscription: undefined as unknown as Subscription };
  rec.subscription = source.on(eventType).subscribe({
    next: (v) => rec.values.push(v),
    error: (e) => (rec.error = e),
    complete: () => (rec.completed = true),
  });
  return rec;
};

let originalEventSource: unknown;
let sources: ReactiveEventSource[] = [];
const create = (
  url: string | URL = testUrl,
  options?: ConstructorParameters<typeof ReactiveEventSource>[1]
): ReactiveEventSource => {
  const s = new ReactiveEventSource(url, options);
  sources.push(s);
  return s;
};

beforeAll(() => {
  originalEventSource = (globalThis as any).EventSource;
});

afterAll(() => {
  (globalThis as any).EventSource = originalEventSource;
});

beforeEach(() => {
  jest.useFakeTimers();
  (globalThis as any).EventSource = MockEventSource;
  MockEventSource.instances = [];
  sources = [];
  jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  sources.forEach((s) => s.close());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('connection setup', () => {
  it('does not connect until on() is called', () => {
    create();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('connects as soon as on() is called, even without a subscriber', () => {
    create().on('message');
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('passes the URL and withCredentials to EventSource', () => {
    create(new URL(testUrl), { withCredentials: true }).on();
    expect(MockEventSource.latest.url).toBe(testUrl);
    expect(MockEventSource.latest.withCredentials).toBe(true);
  });

  it('shares a single EventSource across event types and subscribers', () => {
    const source = create();
    record(source, 'message');
    record(source, 'message');
    record(source, 'custom');
    record(source, 'open');
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('returns the same stream for repeated on() calls with the same type', () => {
    const source = create();
    const a = record(source, 'message');
    const b = record(source); // defaults to 'message'
    MockEventSource.latest.open();
    MockEventSource.latest.message('hello');
    expect(a.values.map((e) => e.data)).toEqual(['hello']);
    expect(b.values.map((e) => e.data)).toEqual(['hello']);
  });
});

describe('events', () => {
  it('emits message events with their data', () => {
    const source = create();
    const rec = record(source, 'message');
    MockEventSource.latest.open();
    MockEventSource.latest.message('one');
    MockEventSource.latest.message('two');
    expect(rec.values.map((e) => e.data)).toEqual(['one', 'two']);
    expect(rec.values[0]).toBeInstanceOf(MessageEvent);
  });

  it('emits custom named events', () => {
    const source = create();
    const custom = record(source, 'update');
    const message = record(source, 'message');
    MockEventSource.latest.open();
    MockEventSource.latest.message('payload', 'update');
    expect(custom.values.map((e) => e.data)).toEqual(['payload']);
    expect(message.values).toHaveLength(0);
  });

  it('replays the last event to late subscribers', () => {
    const source = create();
    source.on('message');
    MockEventSource.latest.open();
    MockEventSource.latest.message('first');
    MockEventSource.latest.message('latest');
    const late = record(source, 'message');
    expect(late.values.map((e) => e.data)).toEqual(['latest']);
  });

  it('surfaces native open and error events as plain Events', () => {
    const source = create();
    const opens = record(source, 'open');
    const errors = record(source, 'error');
    MockEventSource.latest.open();
    MockEventSource.latest.networkDrop();
    expect(opens.values).toHaveLength(1);
    expect(errors.values).toHaveLength(1);
    expect(errors.values[0].type).toBe('error');
    expect(errors.error).toBeUndefined();
  });
});

describe('readyState', () => {
  it('emits CLOSED -> CONNECTING -> OPEN without duplicates', () => {
    const source = create();
    const states: number[] = [];
    source.readyState$.subscribe((s) => states.push(s));
    source.on('message');
    MockEventSource.latest.open();
    MockEventSource.latest.open();
    expect(states).toEqual([2, 0, 1]);
    expect(source.readyState).toBe(1);
  });

  it('tracks native reconnects', () => {
    const source = create();
    source.on('message');
    MockEventSource.latest.open();
    MockEventSource.latest.networkDrop();
    expect(source.readyState).toBe(0);
    MockEventSource.latest.open();
    expect(source.readyState).toBe(1);
  });

  it('ends CLOSED and completes readyState$ on close()', () => {
    const source = create();
    let completed = false;
    source.readyState$.subscribe({ complete: () => (completed = true) });
    source.on('message');
    MockEventSource.latest.open();
    source.close();
    expect(source.readyState).toBe(2);
    expect(completed).toBe(true);
  });
});

describe('reconnection', () => {
  it('leaves native reconnects to the browser (no new EventSource, no error)', () => {
    const source = create({} as any, { connectionTimeout: 100 });
    const rec = record(source, 'message');
    MockEventSource.latest.open();
    MockEventSource.latest.networkDrop();
    jest.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(rec.error).toBeUndefined();

    MockEventSource.latest.open();
    MockEventSource.latest.message('resumed');
    expect(rec.values.map((e) => e.data)).toEqual(['resumed']);
  });

  it('re-creates the EventSource after the browser gives up', () => {
    const source = create(testUrl, { initialDelay: 1000 });
    const rec = record(source, 'message');
    const first = MockEventSource.latest;
    first.open();
    first.fail();

    expect(first.closeCalled).toBe(true);
    expect(source.readyState).toBe(0);
    jest.advanceTimersByTime(499);
    expect(MockEventSource.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2);

    const second = MockEventSource.latest;
    second.open();
    second.message('after reconnect');
    expect(rec.values.map((e) => e.data)).toEqual(['after reconnect']);
    expect(rec.error).toBeUndefined();
  });

  it('removes all listeners from a replaced EventSource and ignores its events', () => {
    const source = create(testUrl, { initialDelay: 10 });
    const rec = record(source, 'message');
    record(source, 'custom');
    const first = MockEventSource.latest;
    first.open();
    first.fail();
    jest.advanceTimersByTime(10);

    expect(first.totalListeners()).toBe(0);
    first.message('stale');
    expect(rec.values).toHaveLength(0);
  });

  it('makes exactly maxRetries retries, then errors every stream', () => {
    const source = create(testUrl, { maxRetries: 2, initialDelay: 1000 });
    const messages = record(source, 'message');
    const opens = record(source, 'open');

    MockEventSource.latest.fail();
    jest.advanceTimersByTime(500);
    MockEventSource.latest.fail();
    jest.advanceTimersByTime(1000);
    MockEventSource.latest.fail();
    jest.advanceTimersByTime(60_000);

    expect(MockEventSource.instances).toHaveLength(3); // initial + 2 retries
    expect(MockEventSource.instances.every((es) => es.closeCalled)).toBe(true);
    for (const rec of [messages, opens]) {
      expect(rec.error).toBeInstanceOf(EventSourceError);
      expect((rec.error as EventSourceError).message).toBe(
        'EventSource Error: Connection closed (retries exhausted) - Attempt: 2'
      );
      expect((rec.error as EventSourceError).attempt).toBe(2);
    }
    expect(source.readyState).toBe(2);
  });

  it('errors on the first failure when maxRetries is 0', () => {
    const source = create(testUrl, { maxRetries: 0 });
    const rec = record(source, 'message');
    MockEventSource.latest.fail();
    expect(MockEventSource.instances).toHaveLength(1);
    expect((rec.error as EventSourceError).attempt).toBe(0);
  });

  it('replays the terminal error to later subscribers and new event types', () => {
    const source = create(testUrl, { maxRetries: 0 });
    source.on('message');
    MockEventSource.latest.fail();
    expect(record(source, 'message').error).toBeInstanceOf(EventSourceError);
    expect(record(source, 'never-seen').error).toBeInstanceOf(EventSourceError);
  });

  it('resets the retry budget after every successful open', () => {
    const source = create(testUrl, { maxRetries: 1, initialDelay: 100 });
    const rec = record(source, 'message');
    MockEventSource.latest.open();
    for (let i = 0; i < 5; i++) {
      MockEventSource.latest.fail();
      jest.advanceTimersByTime(50);
      MockEventSource.latest.open();
    }
    expect(MockEventSource.instances).toHaveLength(6);
    expect(rec.error).toBeUndefined();
    expect(source.readyState).toBe(1);
  });

  it('doubles the backoff up to maxDelay', () => {
    const source = create(testUrl, { maxRetries: 5, initialDelay: 1000, maxDelay: 3000 });
    source.on('message');
    // Math.random() = 0, so each wait is exactly half the base delay
    const expectedWaits = [500, 1000, 1500, 1500, 1500];
    for (const [i, wait] of expectedWaits.entries()) {
      MockEventSource.latest.fail();
      jest.advanceTimersByTime(wait - 1);
      expect(MockEventSource.instances).toHaveLength(i + 1);
      jest.advanceTimersByTime(1);
      expect(MockEventSource.instances).toHaveLength(i + 2);
    }
  });

  it('applies jitter within [base / 2, base)', () => {
    (Math.random as jest.Mock).mockReturnValue(0.5);
    const source = create(testUrl, { initialDelay: 1000 });
    source.on('message');
    MockEventSource.latest.fail();
    jest.advanceTimersByTime(749);
    expect(MockEventSource.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('retries when open does not arrive within connectionTimeout', () => {
    const source = create(testUrl, { connectionTimeout: 100, maxRetries: 1, initialDelay: 1000 });
    const rec = record(source, 'message');
    jest.advanceTimersByTime(100);
    expect(MockEventSource.instances[0].closeCalled).toBe(true);
    expect(source.readyState).toBe(0);
    jest.advanceTimersByTime(500);
    expect(MockEventSource.instances).toHaveLength(2);

    jest.advanceTimersByTime(100);
    expect((rec.error as EventSourceError).message).toBe(
      'EventSource Error: Connection timeout (retries exhausted) - Attempt: 1'
    );
  });

  it('does not time out once open has arrived', () => {
    const source = create(testUrl, { connectionTimeout: 100 });
    const rec = record(source, 'message');
    jest.advanceTimersByTime(50);
    MockEventSource.latest.open();
    jest.advanceTimersByTime(10_000);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(rec.error).toBeUndefined();
  });

  it('does not retry errors thrown by the EventSource constructor', () => {
    const source = create('invalid');
    const rec = record(source, 'message');
    jest.advanceTimersByTime(60_000);
    const error = rec.error as EventSourceError;
    expect(error).toBeInstanceOf(EventSourceError);
    expect(error.message).toBe('EventSource Error: Unrecoverable EventSource error: Invalid URL');
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(source.readyState).toBe(2);
  });

  it('wraps non-Error values thrown by the EventSource constructor', () => {
    const rec = record(create('throws-non-error'), 'message');
    expect((rec.error as EventSourceError).message).toBe(
      'EventSource Error: Unrecoverable EventSource error: not an Error instance'
    );
    expect((rec.error as EventSourceError).cause).toBe('not an Error instance');
  });

  it('delivers the first open event to on("open") subscribers', () => {
    const source = create();
    const opens = record(source, 'open');
    MockEventSource.latest.open();
    expect(opens.values).toHaveLength(1);
  });

  it('delivers error events that arrive before the first open', () => {
    const source = create();
    const errors = record(source, 'error');
    MockEventSource.latest.networkDrop();
    expect(errors.values).toHaveLength(1);
  });
});

describe('unsupported environments', () => {
  it.each([
    ['undefined', (): void => void ((globalThis as any).EventSource = undefined)],
    ['deleted', (): void => void delete (globalThis as any).EventSource],
  ])('errors the stream instead of throwing when EventSource is %s', (_label, remove) => {
    remove();
    const source = create();
    const rec = record(source, 'message');
    expect(rec.error).toBeInstanceOf(EventSourceError);
    expect((rec.error as Error).message).toContain('not supported');
    expect(source.readyState).toBe(2);
  });
});

describe('close()', () => {
  it('completes every stream and closes the EventSource', async () => {
    const source = create();
    const messages$ = source.on('message').pipe(toArray());
    const errors$ = source.on('error').pipe(toArray());
    const result = Promise.all([lastValueFrom(messages$), lastValueFrom(errors$)]);
    MockEventSource.latest.open();
    MockEventSource.latest.message('x');
    source.close();

    const [messages, errors] = await result;
    expect(messages.map((e) => e.data)).toEqual(['x']);
    expect(errors).toHaveLength(0);
    expect(MockEventSource.latest.closeCalled).toBe(true);
    expect(MockEventSource.latest.totalListeners()).toBe(0);
  });

  it('is idempotent', () => {
    const source = create();
    source.on('message');
    source.close();
    expect(() => source.close()).not.toThrow();
    expect(source.readyState).toBe(2);
  });

  it('returns completed streams and opens no connection after close', () => {
    const source = create();
    source.close();
    const rec = record(source, 'message');
    expect(rec.completed).toBe(true);
    expect(rec.values).toHaveLength(0);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('cancels a pending retry', () => {
    const source = create(testUrl, { initialDelay: 1000 });
    source.on('message');
    MockEventSource.latest.fail();
    source.close();
    jest.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(source.readyState).toBe(2);
  });

  it('keeps the connection open when individual subscribers unsubscribe', () => {
    const source = create();
    for (let i = 0; i < 10; i++) {
      record(source, 'message').subscription.unsubscribe();
    }
    MockEventSource.latest.open();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest.closeCalled).toBe(false);
  });
});

describe('getters', () => {
  it('returns the URL as a string for string and URL input', () => {
    expect(create(testUrl).URL).toBe(testUrl);
    expect(create(new URL(testUrl)).URL).toBe(testUrl);
  });

  it('reports withCredentials, defaulting to false', () => {
    expect(create().withCredentials).toBe(false);
    expect(create(testUrl, { withCredentials: true }).withCredentials).toBe(true);
    expect(create(testUrl, { withCredentials: undefined }).withCredentials).toBe(false);
  });

  it('starts CLOSED before connecting', () => {
    expect(create().readyState).toBe(2);
  });
});
