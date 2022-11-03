// @ts-check
const {
  AutoScalingClient,
  DescribeAutoScalingInstancesCommand,
  CompleteLifecycleActionCommand,
} = require('@aws-sdk/client-auto-scaling');

const config = require('./config');
const logger = require('./logger');
const { sleep } = require('./sleep');

/**
 * Polls the Auto Scaling API until the instance is in the given lifecycle state.
 * Ideally this would be event-driven instead, but there's no good way to receive
 * events straight to an EC2 instance; it's really designed to be used with
 * something like SNS, SQS, or Lambda.
 *
 * @param {import('@aws-sdk/client-auto-scaling').AutoScalingClient} client
 * @param {string} instanceId
 * @param {string} lifecycleState
 */
async function waitForLifecycleState(client, instanceId, lifecycleState) {
  // We use a loop + "sleeps" instead of `setInterval` because we've configured
  // the ASG client to automatically retry with exponential backoff. We don't
  // want to have multiple overlapping calls in progress, which would be possible
  // if automatic retries were happening in parallel with our `setInterval`.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const instances = await client.send(
        new DescribeAutoScalingInstancesCommand({ InstanceIds: [instanceId] })
      );
      if (instances.AutoScalingInstances.length === 0) return;
      const instance = instances.AutoScalingInstances[0];
      if (instance.LifecycleState === lifecycleState) {
        return;
      }
    } catch (err) {
      // Hopefully a transient error; keep trying to fetch instance state.
    }

    await sleep(config.autoScalingLifecycleStatePollIntervalSec * 1000);
  }
}

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

/**
 * Resolves once the instance has entered the `Terminating:Wait` state. If
 * not running in EC2 or not configured with an ASG or lifecycle hook name,
 * returns a promise that never settles.
 */
module.exports.waitForInstanceTermination = async function () {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingTerminatingLifecycleHookName
  ) {
    // Return a Promise that never settles.
    return new Promise(() => {});
  }

  const client = new AutoScalingClient({ region: config.awsRegion, maxAttempts: 3 });
  await waitForLifecycleState(client, config.instanceId, 'Terminating:Wait');
};
