export class EventSourceError extends Error {
  public attempt: number;
  constructor(message: string, attempt = -1) {
    const attemptMessage = attempt > -1 ? ` - Attempt: ${attempt}` : '';
    super(`EventSource Error: ${message}${attemptMessage}`);
    this.name = 'EventSourceError';
    this.attempt = attempt;
  }
}
