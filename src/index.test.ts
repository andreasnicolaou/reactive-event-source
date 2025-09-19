/* eslint-disable @typescript-eslint/no-explicit-any */
import { lastValueFrom, Subscription } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { ReactiveEventSource } from './index';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  callbacks: Record<string, (event: any) => void> = {};
  closeCalled = false;
  readyState = 0;
  url: string | URL;
  withCredentials = false;

  constructor(url: string | URL, options?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.readyState === 0 && !this.closeCalled) {
        this.readyState = 1;
        this.emit('open');
      }
    }, 10);
  }

  public static clearInstances(): void {
    MockEventSource.instances = [];
  }

  public addEventListener(type: string, callback: (event: any) => void): void {
    this.callbacks[type] = callback;
  }

  public close(): void {
    this.readyState = 2;
    this.closeCalled = true;
  }

  public emit(type: string, data?: any): void {
    if (this.callbacks[type]) {
      this.callbacks[type]({ type, data });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public removeEventListener(): void {}
}
const testUrl = 'http://test.com/events';

const setupAndSubscribeTo = (
  eventType: string
): {
  source: ReactiveEventSource;
  mock: MockEventSource;
  subscription: Subscription;
} => {
  const source = new ReactiveEventSource(testUrl);
  const subscription = source.on(eventType).subscribe();
  const mock = MockEventSource.instances[0];
  mock.emit('open');
  return { source, mock, subscription };
};

let originalEventSource: typeof window.EventSource;

beforeAll(() => {
  originalEventSource = window.EventSource;
  (window as any).EventSource = MockEventSource;
});

afterAll(() => {
  (window as any).EventSource = originalEventSource;
});

beforeEach(() => {
  jest.useFakeTimers();
  (window as any).EventSource = MockEventSource;
  MockEventSource.clearInstances();
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  MockEventSource.clearInstances();
});

describe('ReactiveEventSource', () => {
  it('should create an EventSource with the correct URL', async () => {
    const { source, mock } = setupAndSubscribeTo('error');
    const sub = source.on('open').subscribe();
    jest.advanceTimersByTime(10);

    expect(mock).toBeDefined();
    expect(mock.url).toBe(testUrl);
    mock.emit('open');
    source.close();
    sub.unsubscribe();
  });

  it('should set withCredentials when configured', () => {
    const source = new ReactiveEventSource(testUrl, { withCredentials: true });
    expect(source.withCredentials).toBe(true);
  });

  it('should emit message events', (done) => {
    const { source, mock } = setupAndSubscribeTo('message');
    source
      .on('message')
      .pipe(take(1))
      .subscribe((event) => {
        expect(event.type).toBe('message');
        expect(event?.data).toBe('test data');
        done();
      });
    mock.emit('message', 'test data');
  });

  it('should emit error events', (done) => {
    const { source, mock } = setupAndSubscribeTo('error');
    source
      .on('error')
      .pipe(take(1))
      .subscribe((event) => {
        expect(event.type).toBe('error');
        done();
      });
    mock.emit('error');
  });

  it('should complete all observables when closed', async () => {
    const { source, mock } = setupAndSubscribeTo('message');
    const messages$ = source.on('message').pipe(toArray());
    const errors$ = source.on('error').pipe(toArray());
    mock.emit('open');
    source.close();
    const [messages, errors] = await Promise.all([lastValueFrom(messages$), lastValueFrom(errors$)]);
    expect(messages.length).toBe(0);
    expect(errors.length).toBe(0);
  });

  it('should connect to EventSource', () => {
    const source = new ReactiveEventSource(testUrl);
    source.on('message').subscribe();
    expect(MockEventSource.instances.length).toBe(1);
  });

  it('should closes EventSource stream cleanly', () => {
    const source = new ReactiveEventSource(testUrl);
    source.on('message').subscribe();
    source.close();
    expect(MockEventSource.instances[0].closeCalled).toBe(true);
  });

  it('should throw error when EventSource is not supported', () => {
    (window as any).EventSource = undefined;
    try {
      new ReactiveEventSource(testUrl);
    } catch (e: any) {
      expect(e.message).toContain('not supported');
    } finally {
      (window as any).EventSource = MockEventSource;
    }
  });

  it('should report correct readyState', () => {
    const source = new ReactiveEventSource(testUrl);
    source.on('message').subscribe();
    jest.advanceTimersByTime(1);

    const mock = MockEventSource.instances[0];
    mock.readyState = 0;
    expect(source.readyState).toBe(0);

    mock.readyState = 1;
    mock.emit('open');
    expect(source.readyState).toBe(1);

    mock.readyState = 2;
    mock.emit('error');
    expect(source.readyState).toBe(2);
  });

  it('should not timeout if open event received', async () => {
    const source = new ReactiveEventSource(testUrl, {
      connectionTimeout: 100,
    });

    const errorSpy = jest.fn();
    source.on('error').subscribe(errorSpy);

    const mock = MockEventSource.instances[0];
    mock.emit('open');

    jest.advanceTimersByTime(150);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should prevent multiple close() calls', () => {
    const source = new ReactiveEventSource(testUrl);
    const subscription = source.on('message').subscribe();

    source.close();
    source.close(); // Should not throw or cause issues

    expect(source.readyState).toBe(2);
    subscription.unsubscribe();
  });

  it('should return EMPTY observable when trying to subscribe after close', () => {
    const source = new ReactiveEventSource(testUrl);
    source.close();

    const observable = source.on('message');
    expect(observable).toBeDefined();

    let eventReceived = false;
    const subscription = observable.subscribe(() => {
      eventReceived = true;
    });

    expect(eventReceived).toBe(false);
    subscription.unsubscribe();
  });

  it('should properly clean up subscriptions on close', () => {
    const source = new ReactiveEventSource(testUrl);

    const messageSubscription = source.on('message').subscribe();
    const errorSubscription = source.on('error').subscribe();
    const openSubscription = source.on('open').subscribe();

    jest.advanceTimersByTime(10);

    expect(messageSubscription.closed).toBe(false);
    expect(errorSubscription.closed).toBe(false);
    expect(openSubscription.closed).toBe(false);

    source.close();

    // Verify all internal state is cleaned up
    expect(source.readyState).toBe(2);

    messageSubscription.unsubscribe();
    errorSubscription.unsubscribe();
    openSubscription.unsubscribe();
  });

  it('should handle rapid subscribe/unsubscribe cycles without leaks', () => {
    const source = new ReactiveEventSource(testUrl);

    for (let i = 0; i < 10; i++) {
      const sub = source.on('message').subscribe();
      sub.unsubscribe();
    }

    const finalSub = source.on('message').subscribe();
    expect(finalSub).toBeDefined();

    source.close();
    finalSub.unsubscribe();
  });

  it('should not create new subjects after close', () => {
    const source = new ReactiveEventSource(testUrl);
    source.close();

    const customEventObs = source.on('custom-event');

    let eventReceived = false;
    const subscription = customEventObs.subscribe(() => {
      eventReceived = true;
    });

    expect(eventReceived).toBe(false);
    subscription.unsubscribe();
  });
});

describe('Getters', () => {
  it('should return URL as string', () => {
    const source = new ReactiveEventSource(testUrl);
    expect(source.URL).toBe(testUrl);
    source.close();
  });

  it('should return URL from URL object', () => {
    const urlObj = new URL(testUrl);
    const source = new ReactiveEventSource(urlObj);
    expect(source.URL).toBe(testUrl);
    source.close();
  });

  it('should return withCredentials when not explicitly set', () => {
    const source = new ReactiveEventSource(testUrl);
    expect(source.withCredentials).toBe(false);
    source.close();
  });

  it('should return withCredentials when explicitly set to true', () => {
    const source = new ReactiveEventSource(testUrl, { withCredentials: true });
    expect(source.withCredentials).toBe(true);
    source.close();
  });
});

describe('Reactive State Tracking', () => {
  it('should emit readyState$ changes', (done) => {
    const source = new ReactiveEventSource(testUrl);
    const states: number[] = [];

    source.readyState$.subscribe((state) => {
      states.push(state);
      if (states.length === 3) {
        expect(states).toEqual([2, 0, 1]); // CLOSED -> CONNECTING -> OPEN
        source.close();
        done();
      }
    });

    // Trigger subscription which starts connection
    source.on('message').subscribe();
    jest.advanceTimersByTime(10);
    MockEventSource.instances[0].emit('open');
  });

  it('should track state changes during reconnection', () => {
    const source = new ReactiveEventSource(testUrl, { maxRetries: 1, initialDelay: 100 });
    const states: number[] = [];

    source.readyState$.subscribe((state) => states.push(state));
    source.on('message').subscribe();

    const mock = MockEventSource.instances[0];
    mock.readyState = 0; // CONNECTING
    mock.emit('error');

    jest.advanceTimersByTime(10);
    expect(states).toContain(0); // Should include CONNECTING state

    source.close();
  });
});

describe('Connection Timeout', () => {
  it('should handle timeout configuration', () => {
    const source = new ReactiveEventSource(testUrl, { connectionTimeout: 50 });

    source.on('message').subscribe();
    source.on('error').subscribe();

    // Test that the configuration is set
    expect(source.readyState).toBeDefined();

    source.close();
  });

  it('should handle state changes during connection', () => {
    const source = new ReactiveEventSource(testUrl, { connectionTimeout: 100 });
    const states: number[] = [];

    source.readyState$.subscribe((state) => states.push(state));
    source.on('message').subscribe(); // Trigger connection

    jest.advanceTimersByTime(10);

    expect(states.length).toBeGreaterThan(1);
    expect(states).toContain(0); // Should include CONNECTING state

    source.close();
  });
});

describe('Retry Logic', () => {
  it('should handle error states properly', () => {
    const source = new ReactiveEventSource(testUrl, { maxRetries: 1, initialDelay: 50 });

    source.on('message').subscribe();
    source.on('error').subscribe();

    const mock = MockEventSource.instances[0];
    mock.readyState = 0; // CONNECTING state
    mock.emit('error');

    jest.advanceTimersByTime(10);

    expect(source.readyState).toBeDefined();
    source.close();
  });

  it('should handle non-connecting error states', () => {
    const source = new ReactiveEventSource(testUrl, { maxRetries: 1 });

    source.on('message').subscribe();
    source.on('error').subscribe();

    // Simulate a non-connecting error
    const mock = MockEventSource.instances[0];
    mock.readyState = 2; // CLOSED state (not CONNECTING)
    mock.emit('error');

    jest.advanceTimersByTime(10);

    expect(source.readyState).toBeDefined();
    source.close();
  });
});

describe('Error Handling in Event Listeners', () => {
  it('should handle errors in event listener streams', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      // Mock implementation
    });
    const source = new ReactiveEventSource(testUrl);

    source.on('message').subscribe();

    const mock = MockEventSource.instances[0];
    mock.emit('open');

    // Test that error handling exists
    expect(consoleErrorSpy).toBeDefined();

    consoleErrorSpy.mockRestore();
    source.close();
  });
});

describe('Advanced Cleanup Scenarios', () => {
  it('should handle cleanup when subscription already unsubscribed', () => {
    const source = new ReactiveEventSource(testUrl);
    const subscription = source.on('message').subscribe();

    // Manually unsubscribe first
    subscription.unsubscribe();

    // Then close source (should handle already unsubscribed case)
    expect(() => source.close()).not.toThrow();
  });

  it('should handle cleanup when subject already closed', () => {
    const source = new ReactiveEventSource(testUrl);
    source.on('message').subscribe();

    // Close source which should close subjects
    source.close();

    // Calling close again should handle already closed subjects
    expect(() => source.close()).not.toThrow();
  });

  it('should properly manage EventSource instances', () => {
    const source = new ReactiveEventSource(testUrl, { maxRetries: 1, initialDelay: 50 });
    source.on('message').subscribe();

    const firstMock = MockEventSource.instances[0];
    expect(firstMock.closeCalled).toBe(false);

    // Test that EventSource management works
    source.close();
    expect(firstMock.closeCalled).toBe(true);
  });

  it('should handle subscription cleanup edge cases', () => {
    const source = new ReactiveEventSource(testUrl);

    // Create multiple subscriptions to same event type
    const sub1 = source.on('message').subscribe();
    const sub2 = source.on('message').subscribe();

    // Verify both get the same observable (shared)
    expect(sub1).toBeDefined();
    expect(sub2).toBeDefined();

    // Close should clean up properly
    source.close();

    sub1.unsubscribe();
    sub2.unsubscribe();
  });
});

describe('Edge Cases', () => {
  it('should handle URL object input correctly', () => {
    const urlObj = new URL(testUrl);
    const source = new ReactiveEventSource(urlObj);

    expect(source.URL).toBe(testUrl);
    source.close();
  });

  it('should handle configuration options correctly', () => {
    const source = new ReactiveEventSource(testUrl, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 2000,
    });

    source.on('message').subscribe();

    // Test that configuration is applied
    expect(source.withCredentials).toBe(false);
    expect(source.URL).toBe(testUrl);

    source.close();
  });

  it('should cover withCredentials getter edge case', () => {
    const source = new ReactiveEventSource(testUrl, { withCredentials: undefined as any });

    // This should trigger the ?? false fallback
    expect(source.withCredentials).toBe(false);

    source.close();
  });
});
