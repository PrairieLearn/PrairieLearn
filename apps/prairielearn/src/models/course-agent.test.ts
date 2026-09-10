import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  createCourseAgentTurn,
  persistCourseAgentSnapshot,
  selectCourseAgentConversationsToReconcile,
  selectOptionalCourseAgentConversation,
} from './course-agent.js';

beforeAll(async () => {
  await helperDb.before();
  await helperCourse.syncCourse();
});
afterAll(helperDb.after);

it('persists raw lifecycle values, rejects stale revisions, and reconciles without a browser', async () => {
  await helperDb.runInTransactionAndRollback(async () => {
    const user = await getOrCreateUser({
      uid: 'agent-test@example.com',
      email: 'agent-test@example.com',
      name: 'Agent test',
      uin: 'agent-test',
    });
    const conversationId = randomUUID();
    const runId = randomUUID();
    const sandboxId = `course-agent-${conversationId}`;
    const identity = { conversationId, courseId: '1', userId: user.id };
    await createCourseAgentTurn({
      conversation: {
        id: conversationId,
        course_id: '1',
        user_id: user.id,
        title: 'Lifecycle test',
        sandbox_id: sandboxId,
        runtime_status: 'starting',
      },
      runId,
      prompt: 'Make a question',
      promptDigest: 'digest',
    });
    expect(await selectOptionalCourseAgentConversation(identity)).toMatchObject({
      lifecycle_revision: 0,
      sandbox_generation: 0,
      idle_expires_at: null,
      conversation_state: 'working',
    });
    const snapshot = CourseAgentSnapshotSchema.parse({
      conversationId,
      sandboxId,
      activeRunId: null,
      status: 'waiting_for_user',
      conversationState: 'waiting_for_user',
      sandboxState: 'ready',
      revision: 10,
      sandboxGeneration: 1,
      idleExpiresAt: 1800000000000,
      response: 'Done',
      error: null,
      events: [
        {
          sequence: 0,
          type: 'user.message',
          occurredAt: new Date().toISOString(),
          data: { runId, text: 'Make a question' },
        },
      ],
    });
    await persistCourseAgentSnapshot({ snapshot, runId });
    await persistCourseAgentSnapshot({
      snapshot: { ...snapshot, revision: 9, conversationState: 'working', status: 'running' },
      runId,
    });
    expect(await selectOptionalCourseAgentConversation(identity)).toMatchObject({
      lifecycle_revision: 10,
      conversation_state: 'waiting_for_user',
      sandbox_state: 'ready',
      idle_expires_at: new Date(1800000000000),
    });
    expect(await selectCourseAgentConversationsToReconcile()).toHaveLength(1);
    await persistCourseAgentSnapshot({
      snapshot: {
        ...snapshot,
        revision: 11,
        sandboxState: 'offline',
        status: 'offline',
        idleExpiresAt: null,
      },
      runId,
    });
    expect(await selectCourseAgentConversationsToReconcile()).toHaveLength(0);
    await persistCourseAgentSnapshot({
      snapshot: {
        ...snapshot,
        revision: 12,
        conversationState: 'waiting_for_approval',
        sandboxState: 'offline',
        status: 'offline',
        idleExpiresAt: null,
      },
      runId,
    });
    expect(await selectCourseAgentConversationsToReconcile()).toHaveLength(1);
  });
});
