import loopbench = require('loopbench');
import { CloudWatch, type Dimension } from '@aws-sdk/client-cloudwatch';
import * as Sentry from '@prairielearn/sentry';
import { logger } from '@prairielearn/logger';

import { makeAwsClientConfig } from './aws';
import { config } from './config';

const loopbenchInstance = loopbench();

let intervalId: NodeJS.Timeout;
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
        Value: loopbenchInstance.delay,
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
    ] as const;

    const cloudwatch = new CloudWatch(makeAwsClientConfig());
    const dimensions: Dimension[] = [
      { Name: 'Server Group', Value: config.groupName },
      { Name: 'InstanceId', Value: `${config.instanceId}:${config.serverPort}` },
    ];
    await cloudwatch.putMetricData({
      Namespace: 'PrairieLearn',
      MetricData: metrics.map((m) => ({
        ...m,
        StorageResolution: 1,
        Timestamp: new Date(),
        Dimensions: dimensions,
      })),
    });
  } catch (err) {
    logger.error('Error reporting Node metrics', err);
    Sentry.captureException(err);
  }
}

export function init() {
  if (!config.runningInEc2 || config.nodeMetricsIntervalSec === null) return;

  // Initialize these so that we can compute a valid delta on the first run of `emit()`.
  cpuUsage = process.cpuUsage();
  time = process.hrtime.bigint();

  intervalId = setInterval(emit, config.nodeMetricsIntervalSec * 1000).unref();
  process.nextTick(emit);
}

export function close() {
  clearInterval(intervalId);
}
