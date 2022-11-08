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

/**
 * Waits for the instance to enter the `Terminating:Wait` state. When it does,
 * runs the provided function and then completes the lifecycle action so that
 * the instance can terminate.
 *
 * This Promise returned by this function will only resolve once the lifecycle
 * action has been completed, so it's safe to perform any additional cleanup
 * and exit the process once this Promise resolves. Note that if we aren't
 * running in EC2, this Promise will never resolve.
 *
 * Note that by the time the provided function is called, the instance will
 * have already been deregistered from the load balancer.
 *
 * @param {() => Promise<void>} fn
 */
module.exports.handleAndCompleteInstanceTermination = async function (fn) {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingTerminatingLifecycleHookName
  ) {
    logger.verbose('Lifecycle hooks not configured; skipping terminating hook');

    // Return a promise that never settles.
    return new Promise(() => {});
  }

  const client = new AutoScalingClient({ region: config.awsRegion, maxAttempts: 3 });
  await waitForLifecycleState(client, config.instanceId, 'Terminating:Wait');

  logger.info('Instance is in Terminating:Wait state; running termination hook');

  try {
    await fn();
  } finally {
    logger.info('Completing Auto Scaling lifecycle action for instance termination...');
    await client.send(
      new CompleteLifecycleActionCommand({
        LifecycleActionResult: 'CONTINUE',
        AutoScalingGroupName: config.autoScalingGroupName,
        LifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
        InstanceId: config.instanceId,
      })
    );
    logger.info('Completed Auto Scaling lifecycle action for instance termination');
  }
};
