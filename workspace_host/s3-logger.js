// @ts-check
const { Mutex } = require('async-mutex');
const AWS = require('aws-sdk');
const Sentry = require('@prairielearn/sentry');

/**
 * @typedef {Object} ContainerS3LogForwarderOptions
 * @property {string} bucket The name of the S3 bucket to upload logs to.
 * @property {string} prefix The prefix of the S3 object key to upload logs to.
 * @property {number} [interval] The number of milliseconds between each log upload.
 */

class ContainerS3LogForwarder {
  /**
   * @param {import('dockerode').Container} container
   * @param {ContainerS3LogForwarderOptions} options
   */
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.mutex = new Mutex();
    this.lastFlushAt = null;
    this.s3 = new AWS.S3({ maxRetries: 3 });

    // Gather logs periodically at a regular interval.
    // TODO: Make the interval configurable.
    this.timeoutId = setInterval(async () => {
      try {
        await this.flushLogs();
      } catch (err) {
        Sentry.captureException(err);
      }
    }, options.interval ?? 60 * 1000);
  }

  async flushLogs() {
    await this.mutex.runExclusive(async () => {
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      const currentFlushAt = now.getTime();
      // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/62861
      // @ts-expect-error
      const logs = await this.container.logs({
        // The initial call will use a `null` value, meaning it will fetch all
        // logs since the container booted up.
        since: this.lastFlushAt ?? undefined,
        // Docker uses Golang's `Time.Before` and `Time.After` functions to
        // determine if a log should be included, and those functions are
        // exclusive of the end time.
        //
        // To ensure that we don't miss any logs, we add a second to the end
        // time. The next time we fetch logs, we'll use a value one second
        // less than that as the start time (`since`) to avoid duplicates.
        until: currentFlushAt + 1,
        stdout: true,
        stderr: true,
      });

      this.s3
        .putObject({
          Bucket: this.options.bucket,
          Key: 'foo',
          Body: logs,
        })
        .promise();

      this.lastFlushAt = currentFlushAt;
    });
  }

  async shutdown() {
    clearTimeout(this.timeoutId);
    await this.flushLogs();
  }
}

module.exports = {
  ContainerS3LogForwarder,
};
