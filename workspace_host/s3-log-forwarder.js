// @ts-check
const { Mutex } = require('async-mutex');
const AWS = require('aws-sdk');
const getStream = require('get-stream');
const Sentry = require('@prairielearn/sentry');
const logger = require('../lib/logger');

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
    this.timeoutId = setInterval(async () => {
      try {
        await this.flushLogs();
      } catch (err) {
        logger.error('Error flushing logs to S3', err);
        Sentry.captureException(err);
      }
    }, options.interval ?? 60 * 1000);
  }

  async flushLogs() {
    await this.mutex.runExclusive(async () => {
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      const currentFlushAt = now.getTime();
      // @ts-expect-error https://github.com/DefinitelyTyped/DefinitelyTyped/pull/62861
      const logStream = await this.container.logs({
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

      // We'll read logs into memory instead of piping them straight to S3 so
      // that a) we can retry the upload if it fails and b) we can tell if
      // there aren't any logs and avoid creating an S3 object if that's the case.
      //
      // Since we're building a string in memory, we'll limit ourselves to
      // 100 MB to avoid a denial-of-service attack.
      //
      // @ts-expect-error https://github.com/DefinitelyTyped/DefinitelyTyped/pull/62861
      const logs = await getStream(logStream, { maxBuffer: 100 * 1024 * 1024 });

      if (logs.length === 0) {
        // No logs to upload; don't create an empty object in S3.
        this.lastFlushAt = currentFlushAt;
        return;
      }

      // Strip trailing slash if it's present.
      let prefix = this.options.prefix;
      if (prefix.endsWith('/')) {
        prefix = prefix.slice(0, -1);
      }

      // Logs will be identified based on the end time. We use an ISO string
      // because that means that the logs will be sorted by time when we read
      // the list of objects.
      const key = `${this.options.prefix}/${now.toISOString()}.log`;

      await this.s3
        .putObject({
          Bucket: this.options.bucket,
          Key: key,
          Body: logs,
        })
        .promise();

      // We don't set this until after we've successfully uploaded the logs to
      // S3; this gives us a tad more resilience in the case of failure, as
      // we'll include logs from the current interval in the next upload.
      this.lastFlushAt = currentFlushAt;
    });
  }

  async shutdown() {
    // Stop work, and flush logs one final time.
    clearTimeout(this.timeoutId);
    await this.flushLogs();
  }
}

module.exports = {
  ContainerS3LogForwarder,
};
