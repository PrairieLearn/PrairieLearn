import { setTimeout as sleep } from 'node:timers/promises';

import {
  type AutoScalingClient,
  CompleteLifecycleActionCommand,
  DescribeAutoScalingInstancesCommand,
} from '@aws-sdk/client-auto-scaling';

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export async function getAutoScalingInstanceLifecycleState({
  client,
  instanceId,
  signal,
}: {
  client: AutoScalingClient;
  instanceId: string;
  signal?: AbortSignal;
}): Promise<string | undefined> {
  const result = await client.send(
    new DescribeAutoScalingInstancesCommand({
      InstanceIds: [instanceId],
    }),
    { abortSignal: signal },
  );

  return result.AutoScalingInstances?.[0]?.LifecycleState;
}

/**
 * Waits until the instance has entered the termination lifecycle hook's
 * regional `Terminating:Wait` state.
 */
export async function waitForAutoScalingTerminationLifecycleAction({
  client,
  instanceId,
  onError,
  signal,
}: {
  client: AutoScalingClient;
  instanceId: string;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}): Promise<void> {
  let errorReported = false;

  while (true) {
    try {
      const state = await getAutoScalingInstanceLifecycleState({ client, instanceId, signal });
      errorReported = false;

      if (state === 'Terminating:Wait') return;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!errorReported) onError?.(error);
      errorReported = true;
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS, undefined, { ref: false, signal });
  }
}

/**
 * Completes a termination lifecycle action, retrying until the action succeeds,
 * has already proceeded, or the operation is aborted.
 *
 * Callers should first verify that the instance has reached `Terminating:Wait`.
 * The lifecycle state can become visible before the action is accepted by
 * `CompleteLifecycleAction`, so a failed completion must not cause the process
 * to exit while the action is still waiting.
 */
export async function completeAutoScalingTerminationLifecycleAction({
  client,
  autoScalingGroupName,
  instanceId,
  lifecycleHookName,
  onError,
  signal,
}: {
  client: AutoScalingClient;
  autoScalingGroupName: string;
  instanceId: string;
  lifecycleHookName: string;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}): Promise<'completed' | 'already-resolved'> {
  let errorReported = false;

  while (true) {
    try {
      await client.send(
        new CompleteLifecycleActionCommand({
          AutoScalingGroupName: autoScalingGroupName,
          InstanceId: instanceId,
          LifecycleActionResult: 'CONTINUE',
          LifecycleHookName: lifecycleHookName,
        }),
        { abortSignal: signal },
      );
      return 'completed';
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!errorReported) onError?.(error);
      errorReported = true;
    }

    try {
      const state = await getAutoScalingInstanceLifecycleState({ client, instanceId, signal });
      if (state === 'Terminating:Proceed' || state === 'Warmed:Terminating:Proceed') {
        return 'already-resolved';
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!errorReported) onError?.(error);
      errorReported = true;
    }

    // The pending lifecycle action must keep the process alive until the next attempt.
    await sleep(DEFAULT_POLL_INTERVAL_MS, undefined, { signal });
  }
}
