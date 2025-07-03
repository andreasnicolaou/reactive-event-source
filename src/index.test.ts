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

  describe('Memory Leak Prevention', () => {
    it('should prevent multiple close() calls', () => {
      const source = new ReactiveEventSource(testUrl);
      const subscription = source.on('message').subscribe();

      source.close();
      source.close(); // Should not throw or cause issues

      // Verify the source is properly closed
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

      // Create multiple subscriptions to different event types
      const messageSubscription = source.on('message').subscribe();
      const errorSubscription = source.on('error').subscribe();
      const openSubscription = source.on('open').subscribe();

      jest.advanceTimersByTime(10);

      // Verify subscriptions are created
      expect(messageSubscription.closed).toBe(false);
      expect(errorSubscription.closed).toBe(false);
      expect(openSubscription.closed).toBe(false);

      // Close the source
      source.close();

      // Verify all internal state is cleaned up
      expect(source.readyState).toBe(2);

      // Clean up test subscriptions
      messageSubscription.unsubscribe();
      errorSubscription.unsubscribe();
      openSubscription.unsubscribe();
    });

    it('should handle rapid subscribe/unsubscribe cycles without leaks', () => {
      const source = new ReactiveEventSource(testUrl);

      // Simulate rapid subscription cycles
      for (let i = 0; i < 10; i++) {
        const sub = source.on('message').subscribe();
        sub.unsubscribe();
      }

      // Final subscription to test functionality
      const finalSub = source.on('message').subscribe();
      expect(finalSub).toBeDefined();

      source.close();
      finalSub.unsubscribe();
    });

    it('should not create new subjects after close', () => {
      const source = new ReactiveEventSource(testUrl);
      source.close();

      // Try to create subscriptions to new event types after close
      const customEventObs = source.on('custom-event');

      let eventReceived = false;
      const subscription = customEventObs.subscribe(() => {
        eventReceived = true;
      });

      expect(eventReceived).toBe(false);
      subscription.unsubscribe();
    });
  });
});
