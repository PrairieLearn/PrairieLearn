const conversationIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

export type ConversationRunState =
  | {
      status: 'idle';
    }
  | {
      status: 'running';
      runId: string;
      updatedAt: string;
    }
  | {
      status: 'complete';
      runId: string;
      updatedAt: string;
      checkpointKey: string;
    }
  | {
      status: 'failed';
      runId: string;
      updatedAt: string;
      error: string;
    };

export function parseConversationId(value: unknown): string {
  if (typeof value !== 'string' || !conversationIdPattern.test(value)) {
    throw new Error('conversation_id must contain 1-80 letters, numbers, underscores, or hyphens');
  }

  return value;
}

export function parseRunId(value: unknown): string {
  if (typeof value !== 'string' || !conversationIdPattern.test(value)) {
    throw new Error('run_id must contain 1-80 letters, numbers, underscores, or hyphens');
  }

  return value;
}
