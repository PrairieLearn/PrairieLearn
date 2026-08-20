import type { PublishAgentRunRequest, PublishAgentRunResponse } from '@prairielearn/agent-protocol';

export interface PublicationRecord {
  request: PublishAgentRunRequest;
  status: 'pending' | 'completed' | 'failed';
  response?: PublishAgentRunResponse;
  error?: string;
}

export type PublicationReservation =
  | { kind: 'reserve' }
  | { kind: 'replay'; response: PublishAgentRunResponse };

export function isCurrentRun(currentRunId: string, requestedRunId: string | null): boolean {
  return requestedRunId !== null && currentRunId === requestedRunId;
}

export function publicationReservation(
  existing: PublicationRecord | undefined,
  request: PublishAgentRunRequest,
): PublicationReservation {
  if (!existing) return { kind: 'reserve' };
  if (!samePublicationRequest(existing.request, request)) {
    throw new Error('Publication operation ID was already used for another target');
  }
  if (existing.status === 'completed' && existing.response) {
    return { kind: 'replay', response: existing.response };
  }
  if (existing.status === 'failed') throw new Error('Publication operation previously failed');
  throw new Error('Publication operation is already in progress');
}

function samePublicationRequest(
  left: PublishAgentRunRequest,
  right: PublishAgentRunRequest,
): boolean {
  return (
    left.operation_id === right.operation_id &&
    left.target.https_url === right.target.https_url &&
    left.target.branch === right.target.branch &&
    left.target.head_sha === right.target.head_sha
  );
}
