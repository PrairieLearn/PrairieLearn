import { randomUUID } from 'node:crypto';

import { JsonToSseTransformStream } from 'ai';

import {
  type CourseAgentAuthoringContext,
  type CourseAgentEvent,
  CourseAgentPushDecisionRequestSchema,
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
  type CourseAgentWorkspaceBackup,
  courseAgentSandboxId,
} from '@prairielearn/course-agent-protocol';

import { config } from '../../../lib/config.js';
import { persistCourseAgentSnapshot } from '../../../models/course-agent.js';

import { publicCourseAgentEvent } from './public-events.js';
import { getCourseAgentStreamContext, getCourseAgentStreamId } from './redis.js';
import { courseAgentUIStream } from './ui-stream.js';
import { getVercelCourseAgentRuntime } from './vercel/index.js';

interface Identity {
  userId: string;
  courseId: string;
  conversationId: string;
  sandboxId: string;
}

interface FakeConversation extends Identity {
  activeRunId: string | null;
  status: 'starting' | 'running' | 'waiting_for_user' | 'failed';
  response: string | null;
  error: string | null;
  events: CourseAgentEvent[];
  workspaceReadme: string;
}

const fakeConversations = new Map<string, FakeConversation>();

export async function startEphemeralCourseAgentRun({
  courseId,
  userId,
  conversationId = randomUUID(),
  runId = randomUUID(),
  prompt,
  course,
  workspaceBackup = null,
  authoringContext,
}: {
  courseId: string;
  userId: string;
  conversationId?: string;
  runId?: string;
  prompt: string;
  course: { repository: string; branch: string; expectedSha: string | null };
  workspaceBackup?: CourseAgentWorkspaceBackup | null;
  authoringContext: CourseAgentAuthoringContext;
}) {
  const sandboxId = courseAgentSandboxId(conversationId);
  const identity = { userId, courseId, conversationId, sandboxId };
  if (config.courseAgentRuntime === 'fake') return startFakeRun({ ...identity, runId, prompt });
  const runtime = await getVercelCourseAgentRuntime();
  const result = await runtime.start(
    CourseAgentStartRunRequestSchema.parse({
      conversationId,
      runId,
      sandboxId,
      prompt,
      course,
      workspaceBackup,
      authoringContext,
      runtimeSettings: { backupTtlSeconds: config.courseAgentVercel.backupTtlSeconds },
    }),
    identity,
  );
  await startCourseAgentEventRelay({ ...identity, runId });
  return result;
}

async function startCourseAgentEventRelay(identity: Identity & { runId: string }) {
  const streamContext = await getCourseAgentStreamContext();
  await streamContext.createNewResumableStream(getCourseAgentStreamId(identity), () =>
    streamEphemeralCourseAgentEvents(identity)
      .pipeThrough(courseAgentUIStream(identity.runId))
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(
        new TransformStream<string, string>({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          },
          async flush() {
            const snapshot = await getEphemeralCourseAgentSnapshot(identity);
            await persistCourseAgentSnapshot({ snapshot, runId: identity.runId });
          },
        }),
      ),
  );
}

export function streamEphemeralCourseAgentEvents(identity: Identity & { runId: string }) {
  let sequence = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  return new ReadableStream<CourseAgentEvent>({
    start(controller) {
      const poll = async () => {
        try {
          const snapshot = await getEphemeralCourseAgentSnapshot(identity);
          if (cancelled) return;
          for (const event of snapshot.events) {
            if (event.sequence <= sequence) continue;
            sequence = event.sequence;
            const visible = publicCourseAgentEvent(event);
            if (visible) controller.enqueue(visible);
          }
          if (snapshot.activeRunId !== identity.runId) controller.close();
          else timer = setTimeout(() => void poll(), 100);
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      };
      void poll();
    },
    cancel() {
      cancelled = true;
      clearTimeout(timer);
    },
  });
}

export async function getEphemeralCourseAgentSnapshot(identity: Identity) {
  if (config.courseAgentRuntime === 'fake') return getFakeSnapshot(identity);
  return (await getVercelCourseAgentRuntime()).snapshot(identity);
}

export async function respondToCourseAgentPushApproval({
  approvalId,
  decision,
  result,
  phase,
  ...identity
}: Identity & {
  approvalId: string;
  decision: 'pending' | 'publishing' | 'denied' | 'completed' | 'failed';
  phase?: 'publishing' | 'syncing';
  result?: Record<string, unknown> | null;
}) {
  if (config.courseAgentRuntime === 'fake') return { accepted: true as const };
  const runtime = await getVercelCourseAgentRuntime();
  return runtime.decision(
    CourseAgentPushDecisionRequestSchema.parse({
      ...identity,
      approvalId,
      decision,
      phase,
      result: result ?? null,
    }),
    identity,
  );
}

function startFakeRun({
  runId,
  prompt,
  ...identity
}: Identity & { runId: string; prompt: string }) {
  const existing = fakeConversations.get(identity.conversationId);
  if (existing && !sameIdentity(existing, identity)) throw new Error('Conversation access denied');
  if (existing?.activeRunId) throw new Error('A course-agent run is already active');
  const workspaceReadme = `${existing?.workspaceReadme ?? '# PrairieLearn course-agent workspace\n'}\n- ${prompt}\n`;
  const events = existing?.events ?? [];
  const append = (type: CourseAgentEvent['type'], data: Record<string, unknown> = {}) => {
    events.push({ sequence: events.length, type, occurredAt: new Date().toISOString(), data });
  };
  append('user.message', { text: prompt, runId });
  if (!existing) {
    append('sandbox.starting', { restoring: false });
    append('workspace.seeded', { path: '/workspace/README.md' });
    append('sandbox.ready', { workspacePath: '/workspace' });
  }
  append('agent.started', { model: 'fake' });
  const response = `Updated /workspace/README.md for: ${prompt}`;
  const textId = `${runId}:text`;
  for (const chunk of [
    {
      type: 'tool-input-available',
      toolCallId: runId,
      toolName: 'activity',
      input: { label: 'Edited README.md' },
      providerExecuted: true,
    },
    { type: 'tool-output-available', toolCallId: runId, output: { label: 'Edited README.md' } },
    { type: 'text-start', id: textId },
    { type: 'text-delta', id: textId, delta: response },
    { type: 'text-end', id: textId },
  ]) {
    append('ui.chunk', { chunk });
  }
  append('agent.completed', { response });
  fakeConversations.set(identity.conversationId, {
    ...identity,
    activeRunId: null,
    status: 'waiting_for_user',
    response,
    error: null,
    events,
    workspaceReadme,
  });
  return { accepted: true as const, ...identity, runId };
}

function getFakeSnapshot(identity: Identity) {
  const conversation = fakeConversations.get(identity.conversationId);
  if (!conversation || !sameIdentity(conversation, identity)) {
    throw new Error('Course-agent conversation not found');
  }
  return CourseAgentSnapshotSchema.parse({
    conversationId: identity.conversationId,
    sandboxId: identity.sandboxId,
    activeRunId: conversation.activeRunId,
    status: conversation.status,
    conversationState: conversation.activeRunId
      ? 'working'
      : conversation.error
        ? 'failed'
        : 'waiting_for_user',
    sandboxState: 'ready',
    revision: conversation.events.length,
    sandboxGeneration: 1,
    response: conversation.response,
    error: conversation.error,
    events: conversation.events,
  });
}

function sameIdentity(left: Identity, right: Identity) {
  return (
    left.userId === right.userId &&
    left.courseId === right.courseId &&
    left.conversationId === right.conversationId &&
    left.sandboxId === right.sandboxId
  );
}

export function resetFakeCourseAgentRuntime() {
  fakeConversations.clear();
}
