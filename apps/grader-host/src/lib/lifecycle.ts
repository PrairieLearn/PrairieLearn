import * as assert from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';

import { AutoScaling } from '@aws-sdk/client-auto-scaling';

import {
  type AutoScalingTargetLifecycleState,
  watchAutoScalingTargetLifecycleState,
} from '@prairielearn/aws-imds';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';
import logger from './logger.js';

/**
 * Stores our current state. We do one-way transitions:
 *    null -> Launching -> InService -> Terminating
 * or
 *    null -> Launching -> AbandoningLaunch
 */
let lifecycleState: 'Launching' | 'InService' | 'Terminating' | 'AbandoningLaunch' | null = null;
let terminationLifecycleActionCompleted = false;

export function getState() {
  return lifecycleState;
}

export async function init() {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.init(): not running in AutoScalingGroup');
    return;
  }

  assert.equal(lifecycleState, null);
  lifecycleState = 'Launching';
  logger.info(`lifecycle.init(): changing to state ${lifecycleState}`);
  heartbeat();
}

export async function inService() {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.inService(): not running in AutoScalingGroup');
    return;
  }

  assert.equal(lifecycleState, 'Launching');
  lifecycleState = 'InService';
  logger.info(`lifecycle.inService(): changing to state ${lifecycleState}`);

  const autoscaling = new AutoScaling(makeAwsClientConfig());
  const params = {
    AutoScalingGroupName: config.autoScalingGroupName,
    LifecycleActionResult: 'CONTINUE',
    LifecycleHookName: 'launching',
    InstanceId: config.instanceId,
  };
  try {
    await autoscaling.completeLifecycleAction(params);
    logger.info('lifecycle.inService(): completed action', params);
  } catch {
    // don't return the error, because there is nothing to be done about it
    logger.error('lifecycle.inService(): error completing action', params);
  }
}

export async function abandonLaunch() {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.abandonLaunch(): not running in AutoScalingGroup');
    return;
  }

  if (lifecycleState === 'Launching') {
    lifecycleState = 'AbandoningLaunch';
    logger.info(`lifecycle.abandonLaunch(): changing to state ${lifecycleState}`);

    const autoscaling = new AutoScaling(makeAwsClientConfig());
    const params = {
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleActionResult: 'ABANDON',
      LifecycleHookName: 'launching',
      InstanceId: config.instanceId,
    };
    try {
      await autoscaling.completeLifecycleAction(params);
      logger.info('lifecycle.abandonLaunch(): completed action', params);
    } catch {
      // don't return the error, because there is nothing to be done about it
      logger.error('lifecycle.abandonLaunch(): error completing action', params);
    }
  } else {
    logger.info(`lifecycle.abandonLaunch(): in state ${lifecycleState}, taking no action`);
  }
}

export function startTerminationWatcher(
  onTermination: (state: AutoScalingTargetLifecycleState) => void,
) {
  if (
    config.autoScalingGroupName === null ||
    config.autoScalingTerminatingLifecycleHookName === null
  ) {
    logger.info('lifecycle.startTerminationWatcher(): termination hook not configured');
    return;
  }

  logger.info('lifecycle.startTerminationWatcher(): watching IMDS for termination');
  void watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    onTargetState(state) {
      logger.info(
        `lifecycle.startTerminationWatcher(): detected Auto Scaling target state ${state}`,
      );
      onTermination(state);
    },
    onError(error) {
      logger.warn(
        'lifecycle.startTerminationWatcher(): error polling IMDS target lifecycle state; retrying',
        error,
      );
    },
  });
}

export function terminating(recordHeartbeats: boolean) {
  if (config.autoScalingGroupName === null) return;

  lifecycleState = 'Terminating';
  terminationLifecycleActionCompleted = !recordHeartbeats;
  logger.info(`lifecycle.terminating(): changing to state ${lifecycleState}`);
  if (recordHeartbeats) heartbeat();
}

export async function completeTermination(signal: AbortSignal) {
  if (
    config.autoScalingGroupName === null ||
    config.autoScalingTerminatingLifecycleHookName === null
  ) {
    logger.info('lifecycle.completeTermination(): termination hook not configured');
    return;
  }

  const autoscaling = new AutoScaling(makeAwsClientConfig());
  const params = {
    AutoScalingGroupName: config.autoScalingGroupName,
    LifecycleActionResult: 'CONTINUE',
    LifecycleHookName: config.autoScalingTerminatingLifecycleHookName,
    InstanceId: config.instanceId,
  };
  let errorReported = false;

  // IMDS can report the target state `Terminated` before Auto Scaling reaches
  // `Terminating:Wait`. Grading jobs start draining immediately, so retry
  // completion here until the lifecycle action exists or SIGTERM arrives.
  logger.info('lifecycle.completeTermination(): completing lifecycle action', params);
  while (!signal.aborted) {
    try {
      await autoscaling.completeLifecycleAction(params);
      logger.info('lifecycle.completeTermination(): completed lifecycle action', params);
      break;
    } catch (error) {
      if (!errorReported) {
        errorReported = true;
        logger.error('lifecycle.completeTermination(): error; retrying', error);
      }
    }

    await sleep(1_000, undefined, { signal }).catch(() => {});
  }

  terminationLifecycleActionCompleted = true;
  if (signal.aborted) {
    logger.info('lifecycle.completeTermination(): stopped waiting after external SIGTERM');
  }
}

function heartbeat() {
  if (config.autoScalingGroupName == null) return;

  const lifecycleHookName =
    lifecycleState === 'Launching'
      ? 'launching'
      : lifecycleState === 'Terminating' &&
          config.autoScalingTerminatingLifecycleHookName !== null &&
          !terminationLifecycleActionCompleted
        ? config.autoScalingTerminatingLifecycleHookName
        : null;
  if (lifecycleHookName === null) {
    logger.info(`lifecycle.heartbeat(): in state ${lifecycleState}, not sending heartbeat`);
    return;
  }

  logger.info(`lifecycle.heartbeat(): sending heartbeat for ${lifecycleState}...`);
  const autoscaling = new AutoScaling(makeAwsClientConfig());
  const params = {
    AutoScalingGroupName: config.autoScalingGroupName,
    LifecycleHookName: lifecycleHookName,
    InstanceId: config.instanceId,
  };
  autoscaling.recordLifecycleActionHeartbeat(params, (err: any) => {
    if (err) logger.error('lifecycle.heartbeat(): ERROR', err);
    setTimeout(heartbeat, config.lifecycleHeartbeatIntervalMS);
  });
}
