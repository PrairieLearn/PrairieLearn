export interface LocalSmokeCheckpoint {
  version: 1;
  conversationId: string;
  runId: string;
  command: readonly string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  createdAt: string;
}

export function localSmokeCheckpointKey(conversationId: string, runId: string): string {
  return `conversations/${conversationId}/runs/${runId}/local-smoke.json`;
}

export function serializeCheckpoint(checkpoint: LocalSmokeCheckpoint): string {
  return JSON.stringify(checkpoint);
}

export function parseCheckpoint(value: string): LocalSmokeCheckpoint {
  const checkpoint: unknown = JSON.parse(value);

  if (
    typeof checkpoint !== 'object' ||
    checkpoint === null ||
    !('version' in checkpoint) ||
    checkpoint.version !== 1 ||
    !('conversationId' in checkpoint) ||
    typeof checkpoint.conversationId !== 'string' ||
    !('runId' in checkpoint) ||
    typeof checkpoint.runId !== 'string' ||
    !('command' in checkpoint) ||
    !Array.isArray(checkpoint.command) ||
    !checkpoint.command.every((part) => typeof part === 'string') ||
    !('stdout' in checkpoint) ||
    typeof checkpoint.stdout !== 'string' ||
    !('stderr' in checkpoint) ||
    typeof checkpoint.stderr !== 'string' ||
    !('exitCode' in checkpoint) ||
    typeof checkpoint.exitCode !== 'number' ||
    !('createdAt' in checkpoint) ||
    typeof checkpoint.createdAt !== 'string'
  ) {
    throw new Error('Invalid local smoke checkpoint');
  }

  return checkpoint as LocalSmokeCheckpoint;
}
