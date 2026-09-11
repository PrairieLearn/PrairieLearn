import { doWithLock } from '@prairielearn/named-locks';

import { persistCourseAgentSnapshot } from '../../../models/course-agent.js';

import {
  getEphemeralCourseAgentSnapshot,
  respondToCourseAgentRender,
} from './ephemeral-runtime.js';
import { renderCourseAgentQuestion } from './render-question.js';

export async function reconcileCourseAgentConversation(identity: {
  conversationId: string;
  courseId: string;
  userId: string;
  sandboxId: string;
  runId: string;
}) {
  const snapshot = await getEphemeralCourseAgentSnapshot(identity);
  const latestUser = snapshot.events.filter((event) => event.type === 'user.message').at(-1);
  const runId = typeof latestUser?.data.runId === 'string' ? latestUser.data.runId : identity.runId;
  await persistCourseAgentSnapshot({ snapshot, runId });
  if (
    snapshot.pendingRender &&
    !snapshot.pendingRender.result &&
    snapshot.pendingRender.expiresAt > Date.now()
  ) {
    await doWithLock(
      `course-agent-render:${snapshot.pendingRender.id}`,
      { timeout: 0, autoRenew: true },
      async () => {
        const current = await getEphemeralCourseAgentSnapshot(identity);
        const pending = current.pendingRender;
        if (
          !pending ||
          pending.id !== snapshot.pendingRender?.id ||
          pending.result ||
          pending.expiresAt <= Date.now() ||
          pending.runId !== current.activeRunId
        ) {
          return;
        }
        const result = await renderCourseAgentQuestion(identity, pending);
        await respondToCourseAgentRender(identity, pending.id, pending.runId, result);
      },
    );
  }
  return snapshot;
}
