/**
 * Error class for operations that may be associated with a job sequence.
 * Used in client-side components to display error messages with links to job logs.
 */
export class JobSequenceError extends Error {
  jobSequenceId?: string;

  constructor(message: string, jobSequenceId?: string) {
    super(message);
    this.jobSequenceId = jobSequenceId;
  }
}
