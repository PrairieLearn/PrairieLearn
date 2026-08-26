export const SANDBOX_DESTRUCTION_REASONS = [
  'idle_timeout',
  'test_kill',
  'conversation_deleted',
] as const;

export type SandboxDestructionReason = (typeof SANDBOX_DESTRUCTION_REASONS)[number];

export function selectWorkspacePreparation({
  courseCheckoutExists,
  backupAvailable,
}: {
  courseCheckoutExists: boolean;
  backupAvailable: boolean;
}) {
  if (courseCheckoutExists) return 'reuse' as const;
  return backupAvailable ? ('restore' as const) : ('clone' as const);
}

export function courseAgentSandboxOptions(sandboxId: string) {
  return {
    keepAlive: true,
    normalizeId: true,
    labels: { workload: 'prairielearn-course-agent', sandboxId },
  } as const;
}

export async function destroySandboxForLifecycle({
  reason,
  metadata = {},
  sandbox,
  checkpoint,
  emit,
}: {
  reason: SandboxDestructionReason;
  metadata?: Record<string, unknown>;
  sandbox: { destroy(): Promise<void> };
  checkpoint: (reason: SandboxDestructionReason) => Promise<void>;
  emit: (
    event: 'sandbox.destroying' | 'sandbox.destroyed',
    data: Record<string, unknown>,
  ) => Promise<void>;
}) {
  await checkpoint(reason);
  await emit('sandbox.destroying', { reason, ...metadata });
  await sandbox.destroy();
  await emit('sandbox.destroyed', { reason, ...metadata });
}
