import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

const IMDS_URI = 'http://169.254.169.254';
const TOKEN_PATH = '/latest/api/token';
const TOKEN_TTL = 21_600; // 6 hours
const AUTO_SCALING_TARGET_LIFECYCLE_STATE_PATH =
  '/latest/meta-data/autoscaling/target-lifecycle-state';

const InstanceIdentitySchema = z.object({
  availabilityZone: z.string(),
  privateIp: z.string(),
  version: z.string(),
  instanceId: z.string(),
  instanceType: z.string(),
  accountId: z.string(),
  imageId: z.string(),
  pendingTime: z.string(),
  architecture: z.string(),
  region: z.string(),
});
type InstanceIdentity = z.infer<typeof InstanceIdentitySchema>;

export const AutoScalingTargetLifecycleStateSchema = z.enum([
  'Detached',
  'InService',
  'Standby',
  'Terminated',
  'Warmed:Hibernated',
  'Warmed:Running',
  'Warmed:Stopped',
  'Warmed:Terminated',
]);
export type AutoScalingTargetLifecycleState = z.infer<typeof AutoScalingTargetLifecycleStateSchema>;

let cachedToken: string | null = null;
let cachedTokenExpiration = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiration) {
    return cachedToken;
  }

  const tokenRes = await fetch(`${IMDS_URI}${TOKEN_PATH}`, {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': TOKEN_TTL.toString(),
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!tokenRes.ok) {
    throw new Error(`Failed to get IMDS token: ${tokenRes.status} ${tokenRes.statusText}`);
  }

  cachedToken = await tokenRes.text();
  cachedTokenExpiration = Date.now() + TOKEN_TTL * 1000;
  return cachedToken;
}

export async function fetchImdsText(path: string): Promise<string> {
  const token = await getToken();

  let res = await fetch(`${IMDS_URI}${path}`, {
    headers: {
      'X-aws-ec2-metadata-token': token,
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (res.status === 401) {
    if (cachedToken === token) {
      cachedToken = null;
      cachedTokenExpiration = 0;
    }

    const refreshedToken = await getToken();
    res = await fetch(`${IMDS_URI}${path}`, {
      headers: {
        'X-aws-ec2-metadata-token': refreshedToken,
      },
      signal: AbortSignal.timeout(5_000),
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch IMDS path ${path}: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

export async function fetchImdsJson(path: string): Promise<unknown> {
  const json = await fetchImdsText(path);
  return JSON.parse(json);
}

export async function fetchInstanceHostname(): Promise<string> {
  return fetchImdsText('/latest/meta-data/local-hostname');
}

export async function fetchInstanceIdentity(): Promise<InstanceIdentity> {
  const json = await fetchImdsJson('/latest/dynamic/instance-identity/document');
  return InstanceIdentitySchema.parse(json);
}

export async function fetchAutoScalingTargetLifecycleState(): Promise<AutoScalingTargetLifecycleState> {
  const state = await fetchImdsText(AUTO_SCALING_TARGET_LIFECYCLE_STATE_PATH);
  return AutoScalingTargetLifecycleStateSchema.parse(state.trim());
}

/**
 * Polls the Auto Scaling target lifecycle state until it matches one of the
 * requested states. The callback is invoked at most once.
 *
 * Polling begins asynchronously, so this function does not delay application
 * startup. Fetch failures are retried and only the first error in each
 * consecutive run of failures is reported.
 */
export async function watchAutoScalingTargetLifecycleState({
  targetStates,
  onTargetState,
  onError,
  pollIntervalMs = 5_000,
  fetchState = fetchAutoScalingTargetLifecycleState,
  signal,
}: {
  targetStates: readonly AutoScalingTargetLifecycleState[];
  onTargetState: (state: AutoScalingTargetLifecycleState) => void;
  onError?: (error: unknown) => void;
  pollIntervalMs?: number;
  fetchState?: () => Promise<AutoScalingTargetLifecycleState>;
  signal?: AbortSignal;
}): Promise<void> {
  const targetStateSet = new Set(targetStates);
  if (signal?.aborted) return;

  let errorReported = false;

  while (!signal?.aborted) {
    let state: AutoScalingTargetLifecycleState | undefined;
    try {
      state = await fetchState();
      errorReported = false;
    } catch (error) {
      if (signal?.aborted) return;
      if (!errorReported) onError?.(error);
      errorReported = true;
    }

    if (signal?.aborted) return;
    if (state !== undefined && targetStateSet.has(state)) {
      onTargetState(state);
      return;
    }

    await sleep(pollIntervalMs, undefined, { ref: false, signal }).catch(() => {});
  }
}
