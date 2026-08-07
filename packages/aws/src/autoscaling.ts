import { setTimeout as sleep } from 'node:timers/promises';

import {
  type AutoScalingClient,
  DescribeAutoScalingInstancesCommand,
} from '@aws-sdk/client-auto-scaling';

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

    await sleep(5_000, undefined, { ref: false, signal });
  }
}
