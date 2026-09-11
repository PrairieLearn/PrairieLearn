import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  authorizeCourseAgentUsageReceipt,
  recordCourseAgentUsageReceipt,
  selectCourseAgentRunUsages,
  selectOptionalCourseAgentUsageIdentity,
} from './course-agent-run-usage.js';
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

it('records each provider request once across replay and finalizes failed runs', async () => {
  await helperDb.runInTransactionAndRollback(async () => {
    const user = await getOrCreateUser({
      uid: 'usage@example.com',
      email: 'usage@example.com',
      name: 'Usage test',
      uin: 'usage-test',
    });
    const conversationId = randomUUID();
    const runId = randomUUID();
    const sandboxId = `course-agent-${conversationId}`;
    await createCourseAgentTurn({
      conversation: {
        id: conversationId,
        course_id: '1',
        user_id: user.id,
        title: 'Usage test',
        sandbox_id: sandboxId,
        runtime_status: 'starting',
      },
      runId,
      prompt: 'Test',
      promptDigest: 'test',
    });
    const identity = { runId, conversationId, courseId: '1', userId: user.id };
    expect(
      await selectOptionalCourseAgentUsageIdentity({ ...identity, courseId: '9999' }),
    ).toBeNull();
    expect(
      await selectOptionalCourseAgentUsageIdentity({ ...identity, runId: randomUUID() }),
    ).toBeNull();
    const receipt = {
      id: randomUUID(),
      runId,
      model: 'gpt-6-astra',
      usage: {
        input_tokens: 100,
        cache_read_tokens: 60,
        cache_write_tokens: 0,
        output_tokens: 20,
        reasoning_tokens: 15,
      },
      cost: 1.46,
    };
    expect(await recordCourseAgentUsageReceipt(receipt)).toBe(false);
    await authorizeCourseAgentUsageReceipt(receipt.id, runId, receipt.model);
    expect(await recordCourseAgentUsageReceipt(receipt)).toBe(true);
    expect(await recordCourseAgentUsageReceipt(receipt)).toBe(false);
    const second = { ...receipt, id: randomUUID() };
    await authorizeCourseAgentUsageReceipt(second.id, runId, second.model);
    expect(await recordCourseAgentUsageReceipt(second)).toBe(true);
    expect(await selectCourseAgentRunUsages(conversationId)).toMatchObject([
      {
        input_tokens: 200,
        normalized_total_tokens: 240,
        estimated_cost_milli_dollars: 2.92,
        finalized_at: null,
      },
    ]);
    await persistCourseAgentSnapshot({
      runId,
      snapshot: CourseAgentSnapshotSchema.parse({
        conversationId,
        sandboxId,
        activeRunId: null,
        status: 'failed',
        error: 'Interrupted',
        events: [],
        response: null,
        revision: 1,
      }),
    });
    const [final] = await selectCourseAgentRunUsages(conversationId);
    expect(final.finalized_at).toBeInstanceOf(Date);
    expect(final.normalized_total_tokens).toBe(240);
  });
});

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
