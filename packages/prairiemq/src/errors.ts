/** Fails a job immediately without using its remaining retry attempts. */
export class UnrecoverableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnrecoverableError';
  }
}
