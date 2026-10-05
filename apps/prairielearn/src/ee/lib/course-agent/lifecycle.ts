import type { ChatProvider, ChatSnapshot } from '@prairielearn/course-agent-contract';

import type { CourseAgentConversation } from '../../../lib/db-types.js';
import {
  rejectOperation,
  reserveContinuation,
  saveOperationStatuses,
  selectActiveOperations,
} from '../../../models/course-agent-conversation.js';

/** Refresh dispatch acknowledgments while connected or before sending new work. */
export async function reconcileOperations(
  conversation: CourseAgentConversation,
  chat: ChatProvider,
  snapshot: ChatSnapshot,
) {
  const stored = await selectActiveOperations(conversation.id);
  const absent = stored.filter((row) => !snapshot.executions?.[row.operation_id]);
  // Terminal receipts are archived in the DO; the live state contains only a
  // bounded window. Fetch pending identities explicitly rather than inferring
  // rejection from their absence in that window.
  for (let offset = 0; offset < absent.length; offset += 100) {
    const ids = absent.slice(offset, offset + 100).map((row) => row.operation_id);
    const saved = await chat.getSnapshot(AbortSignal.timeout(10000), ids);
    snapshot = { ...snapshot, executions: { ...snapshot.executions, ...saved.executions } };
  }
  const missing = stored.filter((row) => {
    const receipt = snapshot.executions?.[row.operation_id];
    return (
      row.status === 'admitted' &&
      (!receipt || (receipt.dispatchId && receipt.dispatchId !== row.dispatch_id)) &&
      row.admitted_at.getTime() < Date.now() - 2 * 60_000
    );
  });
  for (let offset = 0; offset < missing.length; offset += 100) {
    const batch = missing.slice(offset, offset + 100);
    // A delayed HTTP request could still arrive. Release its reservation only
    // after the DO durably fences that specific dispatch and acknowledges it.
    const { rejected } = await chat.reconcileAdmissions(
      batch.map((row) => ({ id: row.operation_id, dispatchId: row.dispatch_id })),
      AbortSignal.timeout(10000),
    );
    for (const row of batch) {
      if (rejected.includes(row.dispatch_id)) {
        await rejectOperation(conversation.id, row.operation_id, row.dispatch_id);
      }
    }
  }
  const updates: Parameters<typeof saveOperationStatuses>[1] = [];
  for (const row of stored) {
    const receipt = snapshot.executions?.[row.operation_id];
    if (!receipt || (receipt.dispatchId && receipt.dispatchId !== row.dispatch_id)) continue;
    updates.push({
      operation_id: row.operation_id,
      dispatch_id: row.dispatch_id,
      status: receipt.status,
    });
  }
  if (updates.length > 0) await saveOperationStatuses(conversation.id, updates);
}

/** Warm tool results continue the original turn; a restored sandbox needs a new dispatch. */
export async function admitResult(
  conversation: CourseAgentConversation,
  id: string,
  snapshot: ChatSnapshot,
) {
  if (Object.values(snapshot.executions ?? {}).some((receipt) => receipt.status === 'running'))
    {return undefined;}
  return reserveContinuation(conversation, id);
}
