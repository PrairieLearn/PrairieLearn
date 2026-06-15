import { setTimeout } from 'node:timers/promises';

import {
  CloudWatch,
  type CloudWatchClientConfig,
  type Dimension,
} from '@aws-sdk/client-cloudwatch';
import loopbench from 'loopbench';

const loopbenchInstance = loopbench();

let abortController: AbortController | null = null;
let cpuUsage = process.cpuUsage();
let time = process.hrtime.bigint();

interface NodeMetricsOptions {
  awsConfig: CloudWatchClientConfig;
  intervalSeconds: number;
  namespace: string;
  dimensions: Dimension[];
  onError: (err: Error) => void;
}

async function emit(options: NodeMetricsOptions) {
  try {
    const memoryStats = process.memoryUsage();

    const elapsedCpuUsage = process.cpuUsage(cpuUsage);
    // This delta is in nanoseconds.
    const elapsedTime = process.hrtime.bigint() - time;
    // This conversion should be safe, as `Number.MAX_SAFE_INTEGER` microseconds
    // corresponds to about 258 years.
    const elapsedMicroseconds = Number(elapsedTime / 1000n);

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

    // We must use a config passed in from outside this package.
    // eslint-disable-next-line @prairielearn/aws-client-shared-config
    const cloudwatch = new CloudWatch(options.awsConfig);
    await cloudwatch.putMetricData({
      Namespace: options.namespace,
      MetricData: metrics.map((m) => ({
        ...m,
        StorageResolution: 1,
        Timestamp: new Date(),
        Dimensions: options.dimensions,
      })),
    });
  } catch (err: any) {
    options.onError(err);
  }
}

async function emitLoop({
  signal,
  ...options
}: NodeMetricsOptions & {
  signal: AbortSignal;
}) {
  try {
    while (!signal.aborted) {
      await setTimeout(options.intervalSeconds * 1000, null, { signal, ref: false });
      await emit(options);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    throw err;
  }
}

export function start(options: NodeMetricsOptions) {
  abortController = new AbortController();

  // Initialize these so that we can compute a valid delta on the first run of `emit()`.
  cpuUsage = process.cpuUsage();
  time = process.hrtime.bigint();

  (() => emitLoop({ signal: abortController.signal, ...options }))();
}

export function stop() {
  abortController?.abort();
}
