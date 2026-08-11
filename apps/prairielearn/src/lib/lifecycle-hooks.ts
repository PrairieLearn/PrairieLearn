import { AutoScalingClient, CompleteLifecycleActionCommand } from '@aws-sdk/client-auto-scaling';

import {
  completeAutoScalingTerminationLifecycleAction,
  getAutoScalingInstanceLifecycleState,
  waitForAutoScalingTerminationLifecycleAction,
} from '@prairielearn/aws';
import { watchAutoScalingTargetLifecycleState } from '@prairielearn/aws-imds';
import { logger } from '@prairielearn/logger';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';

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
  const lifecycleState = await getAutoScalingInstanceLifecycleState({
    client,
    instanceId: config.instanceId,
  });
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
  const lifecycleState = await getAutoScalingInstanceLifecycleState({
    client,
    instanceId: config.instanceId,
  });
  if (lifecycleState !== 'Terminating:Wait') return;

  logger.info('Completing Auto Scaling lifecycle action for instance termination...');
  const result = await completeAutoScalingTerminationLifecycleAction({
    client,
    autoScalingGroupName: config.autoScalingGroupName,
    lifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
    instanceId: config.instanceId,
    onError(error) {
      logger.warn('Error completing Auto Scaling termination lifecycle action; retrying', error);
    },
  });
  if (result === 'completed') {
    logger.info('Completed Auto Scaling lifecycle action for instance termination');
  } else {
    logger.info('Auto Scaling termination lifecycle action was already resolved');
  }
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
      const client = new AutoScalingClient(makeAwsClientConfig());

      // IMDS reports the target state `Terminated` before Auto Scaling reaches
      // `Terminating:Wait`. PrairieLearn must remain available while the load
      // balancer drains, so it does not begin shutdown until the action is ready.
      void waitForAutoScalingTerminationLifecycleAction({
        client,
        instanceId: config.instanceId,
        onError(error) {
          logger.warn('Error checking Auto Scaling termination lifecycle state; retrying', error);
        },
      })
        .then(() => {
          logger.info('Auto Scaling termination lifecycle action is ready');
          onTermination();
        })
        .catch((error) => {
          logger.error('Error waiting for Auto Scaling termination lifecycle action', error);
        });
    },
    onError(error) {
      logger.warn('Error polling IMDS for Auto Scaling target lifecycle state; retrying', error);
    },
  });
}
