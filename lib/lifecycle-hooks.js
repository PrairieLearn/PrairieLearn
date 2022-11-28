// @ts-check
const {
  AutoScalingClient,
  CompleteLifecycleActionCommand,
} = require('@aws-sdk/client-auto-scaling');

const config = require('./config');
const logger = require('./logger');

module.exports.completeInstanceLaunch = async function () {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingLaunchingLifecycleHookName
  ) {
    logger.verbose('Lifecycle hooks not configured; skipping launching hook');
    return;
  }

  logger.info('Completing Auto Scaling lifecycle action for instance launch...');
  const client = new AutoScalingClient({ region: config.awsRegion, maxAttempts: 3 });
  await client.send(
    new CompleteLifecycleActionCommand({
      LifecycleActionResult: 'CONTINUE',
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleHookName: config.autoScalingLaunchingLifecycleHookName,
      InstanceId: config.instanceId,
    })
  );
  logger.info('Completed Auto Scaling lifecycle action for instance launch');
};

module.exports.completeInstanceTermination = async function () {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingTerminatingLifecycleHookName
  ) {
    logger.verbose('Lifecycle hooks not configured; skipping terminating hook');
    return;
  }

  logger.info('Completing Auto Scaling lifecycle action for instance termination...');
  const client = new AutoScalingClient({ region: config.awsRegion, maxAttempts: 3 });
  await client.send(
    new CompleteLifecycleActionCommand({
      LifecycleActionResult: 'CONTINUE',
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
      InstanceId: config.instanceId,
    })
  );
  logger.info('Completed Auto Scaling lifecycle action for instance termination');
};
