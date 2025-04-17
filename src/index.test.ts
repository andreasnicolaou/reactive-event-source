/* eslint-disable @typescript-eslint/no-explicit-any */
import { lastValueFrom, Subscription } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { ReactiveEventSource } from './index';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  callbacks: Record<string, (event: any) => void> = {};
  readyState = 0;
  url: string | URL;

  constructor(url: string | URL) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  public static clearInstances(): void {
    MockEventSource.instances = [];
  }

  public addEventListener(type: string, callback: (event: any) => void): void {
    this.callbacks[type] = callback;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public close(): void {}

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

describe('ReactiveEventSource', () => {
  let originalEventSource!: typeof window.EventSource;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    jest.spyOn(console, 'error').mockImplementation(() => {}); // Disable console warnings
  });

  beforeAll(() => {
    originalEventSource = window.EventSource;
    (window as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    MockEventSource.clearInstances();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterAll(() => {
    (window as any).EventSource = originalEventSource;
  });

  it('should create an EventSource with the correct URL', (done) => {
    const { source, mock } = setupAndSubscribeTo('error');
    source
      .on('open')
      .pipe(take(1))
      .subscribe(() => {
        expect(mock.url).toBe(testUrl);
        done();
      });
    mock.emit('open');
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
        expect((event as MessageEvent<any>)?.data).toBe('test data');
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
});
