// @ts-check
const {
  AutoScalingClient,
  DescribeAutoScalingInstancesCommand,
  CompleteLifecycleActionCommand,
} = require('@aws-sdk/client-auto-scaling');

const config = require('./config');
const { getInstanceMetadata } = require('./aws');
const logger = require('./logger');
const { deferredPromise } = require('./deferred');

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
  const p = deferredPromise();

  const intervalId = setInterval(async () => {
    try {
      const instances = await client.send(
        new DescribeAutoScalingInstancesCommand({ InstanceIds: [instanceId] })
      );
      if (instances.AutoScalingInstances.length === 0) return;
      const instance = instances.AutoScalingInstances[0];
      if (instance.LifecycleState === lifecycleState) {
        clearInterval(intervalId);
        p.resolve();
      }
    } catch (err) {
      // Hopefully a transitive error; keep trying to fetch instance state.
    }
  }, 10 * 1000);

  return p.promise;
}

/**
 * Waits for the instance to enter the `Terminating:Wait` state. When it does,
 * runs the provided function and then completes the lifecycle action so that
 * the instance can terminate.
 *
 * Note that by the time the function is called, the instance has already been
 * deregistered from the load balancer.
 *
 * @param {() => Promise<void>} fn
 */
module.exports.handleAndCompleteInstanceTermination = async function (fn) {
  if (!config.runningInEc2) return;

  if (!config.autoScalingGroupName || !config.autoScalingTerminatingLifecycleHookName) {
    logger.info(
      'Not using lifecycle hooks because autoScalingGroupName or autoScalingLifecycleHookName is not set'
    );
    return;
  }

  // We can't use `config.instanceId` because it's hardcoded for some servers.
  const instanceMetadata = await getInstanceMetadata();
  const { instanceId } = instanceMetadata;

  const client = new AutoScalingClient({ region: config.awsRegion });

  await waitForLifecycleState(client, instanceId, 'Terminating:Wait');

  try {
    await fn();
  } finally {
    await client.send(
      new CompleteLifecycleActionCommand({
        LifecycleActionResult: 'CONTINUE',
        AutoScalingGroupName: config.autoScalingGroupName,
        LifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
        InstanceId: instanceId,
      })
    );
  }
};
