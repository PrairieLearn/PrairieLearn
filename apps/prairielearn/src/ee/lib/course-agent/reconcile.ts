import { persistCourseAgentSnapshot } from '../../../models/course-agent.js';

import { getEphemeralCourseAgentSnapshot } from './ephemeral-runtime.js';

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
  return snapshot;
}
