// @ts-check
const { Mutex } = require('async-mutex');
const AWS = require('aws-sdk');
const Sentry = require('@prairielearn/sentry');

const logger = require('../lib/logger');

const { parseDockerLogs } = require('./lib/docker');

const SINCE_NANOS = '000000000';
const UNTIL_NANOS = '999999999';

/**
 * @typedef {Object} ContainerS3LogForwarderOptions
 * @property {string} bucket The name of the S3 bucket to upload logs to.
 * @property {string} prefix The prefix of the S3 object key to upload logs to.
 * @property {Record<string, string>} [tags] Tags to apply to all S3 objects.
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
    // Start at zero seconds to ensure that we get all logs.
    this.readUntilTime = 0;
    this.s3 = new AWS.S3({ maxRetries: 3 });

    // Encode the tags as a URL query string; this is what S3 requires.
    const tags = this.options.tags ?? {};
    this.tagging = Object.keys(tags).length > 0 ? new URLSearchParams(tags).toString() : undefined;

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
      // The `since` and `until` options have been observed to be inclusive. To
      // avoid duplicates or dropped logs, we'll include nanosecond values in
      // those options such that `since` ends in `000000000` and `until` ends in
      // `999999999`.
      const nowSecs = Math.floor(Date.now() / 1000);
      const since = `${this.readUntilTime}.${SINCE_NANOS}`;
      const until = `${nowSecs}.${UNTIL_NANOS}`;

      const rawLogs = await this.container.logs({
        since,
        until,
        stdout: true,
        stderr: true,
        // Always include timestamps to make debugging easier.
        timestamps: true,
      });

      const logs = parseDockerLogs(rawLogs);

      if (logs.length === 0) {
        // No logs to upload; don't create an empty object in S3.
        this.readUntilTime = nowSecs;
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
      const now = new Date(nowSecs * 1000);
      const key = `${this.options.prefix}/${now.toISOString()}.log`;

      await this.s3
        .putObject({
          Bucket: this.options.bucket,
          Key: key,
          Body: logs,
          Tagging: this.tagging,
        })
        .promise();

      // We don't set this until after we've successfully uploaded the logs to
      // S3; this gives us a tad more resilience in the case of failure, as
      // we'll include logs from the current interval in the next upload.
      this.readUntilTime = nowSecs;
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
