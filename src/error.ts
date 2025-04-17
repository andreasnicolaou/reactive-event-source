export class EventSourceError extends Error {
  constructor(
    public message: string,
    public attempt = -1
  ) {
    const attemptMessage = attempt > -1 ? ` - Attempt: ${attempt}` : '';
    super(`EventSource Error: ${message}${attemptMessage}`);
    this.name = 'EventSourceError';
  }
}
