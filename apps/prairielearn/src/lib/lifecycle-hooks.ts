import { setTimeout as sleep } from 'node:timers/promises';

import {
  AutoScalingClient,
  CompleteLifecycleActionCommand,
  DescribeAutoScalingInstancesCommand,
} from '@aws-sdk/client-auto-scaling';

import { watchAutoScalingTargetLifecycleState } from '@prairielearn/aws-imds';
import { logger } from '@prairielearn/logger';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';

/**
 * Gets the lifecycle state of the current EC2 instance.
 */
async function getInstanceLifecycleState(client: AutoScalingClient): Promise<string | undefined> {
  const res = await client.send(
    new DescribeAutoScalingInstancesCommand({
      InstanceIds: [config.instanceId],
    }),
  );

  return res.AutoScalingInstances?.[0]?.LifecycleState;
}

async function waitForInstanceTerminationLifecycleAction() {
  const client = new AutoScalingClient(makeAwsClientConfig());
  let errorReported = false;

  // IMDS can report the target state `Terminated` before Auto Scaling reaches
  // `Terminating:Wait`. Wait for the lifecycle action so shutdown does not race
  // load balancer draining. If the hook is absent or bypassed, EC2's eventual
  // SIGTERM remains the fallback.
  while (true) {
    try {
      const lifecycleState = await getInstanceLifecycleState(client);
      errorReported = false;

      if (lifecycleState === 'Terminating:Wait') {
        logger.info('Auto Scaling termination lifecycle action is ready');
        return;
      }
    } catch (error) {
      if (!errorReported) {
        errorReported = true;
        logger.warn('Error checking Auto Scaling termination lifecycle state; retrying', error);
      }
    }

    await sleep(5_000);
  }
}

export async function completeInstanceLaunch() {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingLaunchingLifecycleHookName
  ) {
    logger.verbose('Lifecycle hooks not configured; skipping launching hook');
    return;
  }

  const client = new AutoScalingClient(makeAwsClientConfig());

  // If we're starting outside the context of an Auto Scaling lifecycle change
  // (e.g. a restart after a process crash), there won't be a lifecycle action
  // to complete.
  const lifecycleState = await getInstanceLifecycleState(client);
  if (lifecycleState !== 'Pending:Wait' && lifecycleState !== 'Warmed:Pending:Wait') {
    return;
  }

  logger.info('Completing Auto Scaling lifecycle action for instance launch...');
  await client.send(
    new CompleteLifecycleActionCommand({
      LifecycleActionResult: 'CONTINUE',
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleHookName: config.autoScalingLaunchingLifecycleHookName,
      InstanceId: config.instanceId,
    }),
  );
  logger.info('Completed Auto Scaling lifecycle action for instance launch');
}

export async function completeInstanceTermination() {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingTerminatingLifecycleHookName
  ) {
    logger.verbose('Lifecycle hooks not configured; skipping terminating hook');
    return;
  }

  const client = new AutoScalingClient(makeAwsClientConfig());

  // If we're terminating outside the context of an Auto Scaling lifecycle change
  // (e.g. via `systemctl stop`), there won't be a lifecycle action to complete.
  const lifecycleState = await getInstanceLifecycleState(client);
  if (lifecycleState !== 'Terminating:Wait') return;

  logger.info('Completing Auto Scaling lifecycle action for instance termination...');
  await client.send(
    new CompleteLifecycleActionCommand({
      LifecycleActionResult: 'CONTINUE',
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
      InstanceId: config.instanceId,
    }),
  );
  logger.info('Completed Auto Scaling lifecycle action for instance termination');
}

export function startInstanceTerminationWatcher(onTermination: () => void) {
  if (
    !config.runningInEc2 ||
    !config.autoScalingGroupName ||
    !config.autoScalingTerminatingLifecycleHookName
  ) {
    logger.verbose('Termination lifecycle hook not configured; skipping IMDS watcher');
    return;
  }

  logger.info('Watching IMDS for Auto Scaling termination');
  void watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    onTargetState(state) {
      logger.info(`Detected Auto Scaling termination target state from IMDS: ${state}`);
      void waitForInstanceTerminationLifecycleAction()
        .then(onTermination)
        .catch((error) => {
          logger.error('Error waiting for Auto Scaling termination lifecycle action', error);
        });
    },
    onError(error) {
      logger.warn('Error polling IMDS for Auto Scaling target lifecycle state; retrying', error);
    },
  });
}
