export const DEFAULT_PREFIX = 'prairiemq';

/** Builders for the Redis keys used by a single queue. */
export class QueueKeys {
  readonly base: string;

  constructor(prefix: string, queueName: string) {
    this.base = `${prefix}:{${prefix}:${queueName}}`;
  }

  get active() {
    return `${this.base}:active`;
  }

  get delayed() {
    return `${this.base}:delayed`;
  }

  get completed() {
    return `${this.base}:completed`;
  }

  get failed() {
    return `${this.base}:failed`;
  }

  get marker() {
    return `${this.base}:marker`;
  }

  get paused() {
    return `${this.base}:paused`;
  }

  deduplication(deduplicationId: string) {
    return `${this.base}:deduplication:${deduplicationId}`;
  }

  get schedulers() {
    return `${this.base}:schedulers`;
  }
}
