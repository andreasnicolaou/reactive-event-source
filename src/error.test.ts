import { EventSourceError } from './error';

describe('EventSourceError', () => {
  it('should create error with message only', () => {
    const error = new EventSourceError('Test error');
    expect(error.attempt).toBe(-1);
    expect(error.name).toBe('EventSourceError');
    expect(error.message).toBe('EventSource Error: Test error');
  });

  it('should create error with message and attempt', () => {
    const error = new EventSourceError('Connection failed', 3);
    expect(error.attempt).toBe(3);
    expect(error.name).toBe('EventSourceError');
    expect(error.message).toBe('EventSource Error: Connection failed - Attempt: 3');
  });

  it('should create error with attempt of 0', () => {
    const error = new EventSourceError('First attempt failed', 0);
    expect(error.attempt).toBe(0);
    expect(error.message).toBe('EventSource Error: First attempt failed - Attempt: 0');
  });
});
