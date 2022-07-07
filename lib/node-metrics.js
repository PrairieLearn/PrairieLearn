// @ts-check
const AWS = require('aws-sdk');
const loopbench = require('loopbench')();

const logger = require('./logger');
const config = require('./config');

let intervalId;

function emit() {
  if (!config.runningInEc2) return;

  const memoryStats = process.memoryUsage();
  const cpuStats = process.cpuUsage();
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
      Unit: 'Microseconds',
      Value: cpuStats.user,
    },
    {
      MetricName: 'NodeCpuSystem',
      Unit: 'Microseconds',
      Value: cpuStats.system,
    },
  ];

  const cloudwatch = new AWS.CloudWatch(config.awsServiceGlobalOptions);
  /** @type {import('aws-sdk').CloudWatch.Types.Dimensions} */
  const dimensions = [
    { Name: 'Server Group', Value: config.groupName },
    { Name: 'InstanceId', Value: config.instanceId },
  ];
  /** @type {import('aws-sdk').CloudWatch.Types.PutMetricDataInput} */
  const params = {
    Namespace: 'PrairieLearn',
    MetricData: metrics.map((m) => ({
      ...m,
      StorageResolution: 1,
      Timestamp: new Date(),
      Dimensions: dimensions,
    })),
  };
  cloudwatch.putMetricData(params, (err) => {
    if (err) {
      logger.error('Error reporting Node metrics to CloudWatch', err);
    }
  });
}

module.exports.init = () => {
  intervalId = setInterval(emit, config.nodeMetricsIntervalSec * 1000).unref();
  process.nextTick(emit);
};

module.exports.close = () => {
  clearInterval(intervalId);
};
