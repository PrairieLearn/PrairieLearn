// @ts-check
const AWS = require('aws-sdk');
const loopbench = require('loopbench')();
const Sentry = require('@prairielearn/sentry');

const { logger } = require('@prairielearn/logger');
const { config } = require('./config');

let intervalId;
let cpuUsage = process.cpuUsage();
let time = process.hrtime.bigint();

async function emit() {
  try {
    const memoryStats = process.memoryUsage();

    const elapsedCpuUsage = process.cpuUsage(cpuUsage);
    // This delta is in nanoseconds.
    const elapsedTime = process.hrtime.bigint() - time;
    // This conversion should be safe, as `Number.MAX_SAFE_INTEGER` microseconds
    // corresponds to about 258 years.
    const elapsedMicroseconds = Number(elapsedTime / BigInt(1000));

    const userCpuPercent = (100 * elapsedCpuUsage.user) / elapsedMicroseconds;
    const systemCpuPercent = (100 * elapsedCpuUsage.system) / elapsedMicroseconds;
    const totalCpuPercent = userCpuPercent + systemCpuPercent;

    cpuUsage = process.cpuUsage();
    time = process.hrtime.bigint();

    const metrics = [
      {
        MetricName: 'NodeEventLoopDelay',
        Unit: 'Milliseconds',
        Value: loopbench.delay,
      },
      {
        MetricName: 'NodeMemoryRss',
        Unit: 'Bytes',
        Value: memoryStats.rss,
      },
      {
        MetricName: 'NodeMemoryHeapTotal',
        Unit: 'Bytes',
        Value: memoryStats.heapTotal,
      },
      {
        MetricName: 'NodeMemoryHeapUsed',
        Unit: 'Bytes',
        Value: memoryStats.heapUsed,
      },
      {
        MetricName: 'NodeMemoryExternal',
        Unit: 'Bytes',
        Value: memoryStats.external,
      },
      {
        MetricName: 'NodeCpuUser',
        Unit: 'Percent',
        Value: userCpuPercent,
      },
      {
        MetricName: 'NodeCpuSystem',
        Unit: 'Percent',
        Value: systemCpuPercent,
      },
      {
        MetricName: 'NodeCpuTotal',
        Unit: 'Percent',
        Value: totalCpuPercent,
      },
    ];

    const cloudwatch = new AWS.CloudWatch(config.awsServiceGlobalOptions);
    /** @type {import('aws-sdk').CloudWatch.Types.Dimensions} */
    const dimensions = [
      { Name: 'Server Group', Value: config.groupName },
      { Name: 'InstanceId', Value: `${config.instanceId}:${config.serverPort}` },
    ];
    await cloudwatch
      .putMetricData({
        Namespace: 'PrairieLearn',
        MetricData: metrics.map((m) => ({
          ...m,
          StorageResolution: 1,
          Timestamp: new Date(),
          Dimensions: dimensions,
        })),
      })
      .promise();
  } catch (err) {
    logger.error('Error reporting Node metrics', err);
    Sentry.captureException(err);
  }
}

module.exports.init = () => {
  if (!config.runningInEc2 || config.nodeMetricsIntervalSec === null) return;

  // Initialize these so that we can compute a valid delta on the first run of `emit()`.
  cpuUsage = process.cpuUsage();
  time = process.hrtime.bigint();

  intervalId = setInterval(emit, config.nodeMetricsIntervalSec * 1000).unref();
  process.nextTick(emit);
};

module.exports.close = () => {
  clearInterval(intervalId);
};
