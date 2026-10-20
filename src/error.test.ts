import { EventSourceError } from './error';

describe('EventSourceError', () => {
  it('should create error with message only', () => {
    const error = new EventSourceError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error.attempt).toBe(-1);
    expect(error.name).toBe('EventSourceError');
    expect(error.message).toBe('EventSource Error: Test error');
    expect(error.reason).toBe('Test error');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with message and attempt', () => {
    const error = new EventSourceError('Connection failed', 3);
    expect(error.attempt).toBe(3);
    expect(error.name).toBe('EventSourceError');
    expect(error.message).toBe('EventSource Error: Connection failed - Attempt: 3');
    expect(error.reason).toBe('Connection failed');
  });

  it('should create error with attempt of 0', () => {
    const error = new EventSourceError('First attempt failed', 0);
    expect(error.attempt).toBe(0);
    expect(error.message).toBe('EventSource Error: First attempt failed - Attempt: 0');
  });

  it('should keep the underlying cause', () => {
    const cause = new TypeError('boom');
    const error = new EventSourceError('Wrapped', -1, cause);
    expect(error.cause).toBe(cause);
  });
});
