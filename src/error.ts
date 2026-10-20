export class EventSourceError extends Error {
  /** Number of retries that had been made when the error was raised, or -1 when not applicable. */
  public readonly attempt: number;
  /** The unformatted reason, without the "EventSource Error:" prefix or the attempt suffix. */
  public readonly reason: string;

  constructor(message: string, attempt = -1, cause?: unknown) {
    const attemptMessage = attempt > -1 ? ` - Attempt: ${attempt}` : '';
    super(`EventSource Error: ${message}${attemptMessage}`, cause === undefined ? undefined : { cause });
    this.name = 'EventSourceError';
    this.attempt = attempt;
    this.reason = message;
  }
}
