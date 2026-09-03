import { createHash, randomUUID } from 'node:crypto';

import {
  type CourseAgentEvent,
  CourseAgentPushDecisionRequestSchema,
  CourseAgentSnapshotSchema,
  CourseAgentStartRunResponseSchema,
  type CourseAgentUsage,
  type CourseAgentWorkspaceBackup,
  courseAgentSandboxId,
} from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';

import { getCourseAgentStreamContext, getCourseAgentStreamId } from './redis.js';

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
  usage: CourseAgentUsage;
}

const fakeConversations = new Map<string, FakeConversation>();

function capabilitySecret() {
  if (!config.courseAgentCapabilitySecret) {
    throw new Error('Course-agent capability secret is not configured');
  }
  return config.courseAgentCapabilitySecret;
}

function promptDigest(prompt: string) {
  return createHash('sha256').update(prompt).digest('hex');
}

function expiresAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

function runtimeSettings() {
  return {
    idleTimeoutSeconds: config.courseAgentSandbox.idleTimeoutSeconds,
    backupTtlSeconds: config.courseAgentSandbox.backupTtlSeconds,
    turnTimeoutSeconds: config.courseAgentSandbox.turnTimeoutSeconds,
  };
}

export async function startEphemeralCourseAgentRun({
  courseId,
  userId,
  conversationId = randomUUID(),
  runId = randomUUID(),
  prompt,
  course,
  workspaceBackup = null,
}: {
  courseId: string;
  userId: string;
  conversationId?: string;
  runId?: string;
  prompt: string;
  course: { repository: string; branch: string; expectedSha: string | null };
  workspaceBackup?: CourseAgentWorkspaceBackup | null;
}) {
  if (config.courseAgentRuntime === 'disabled') {
    throw new Error('Course-agent runtime is disabled');
  }
  const sandboxId = courseAgentSandboxId(conversationId);
  const identity = { userId, courseId, conversationId, sandboxId };
  if (config.courseAgentRuntime === 'fake') {
    return startFakeRun({ ...identity, runId, prompt });
  }
  const capability = generateSignedToken(
    {
      type: 'course-agent-run',
      ...identity,
      runId,
      promptDigest: promptDigest(prompt),
      repository: course.repository,
      branch: course.branch,
      expectedSha: course.expectedSha,
      runtimeSettings: runtimeSettings(),
      expiresAt: expiresAt(),
    },
    capabilitySecret(),
  );
  const response = await fetch(new URL('/v1/runs', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capability,
      conversationId,
      runId,
      sandboxId,
      prompt,
      course,
      workspaceBackup,
      runtimeSettings: runtimeSettings(),
    }),
  });
  if (!response.ok) throw new Error(`Course-agent Worker rejected the run (${response.status})`);
  const result = CourseAgentStartRunResponseSchema.parse(await response.json());
  await startCourseAgentEventRelay({ ...identity, runId });
  return result;
}

async function startCourseAgentEventRelay(identity: Identity & { runId: string }) {
  const capability = generateSignedToken(
    { type: 'course-agent-inspect', ...identity, expiresAt: expiresAt() },
    capabilitySecret(),
  );
  const response = await fetch(new URL('/v1/stream', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability, ...identity }),
  });
  const body = response.body;
  if (!response.ok || !body) {
    throw new Error(`Course-agent Worker stream failed (${response.status})`);
  }
  const streamContext = await getCourseAgentStreamContext();
  await streamContext.createNewResumableStream(getCourseAgentStreamId(identity), () =>
    body.pipeThrough(new TextDecoderStream()),
  );
}

export async function getEphemeralCourseAgentSnapshot(identity: Identity) {
  if (config.courseAgentRuntime === 'fake') return getFakeSnapshot(identity);
  const capability = generateSignedToken(
    { type: 'course-agent-inspect', ...identity, expiresAt: expiresAt() },
    capabilitySecret(),
  );
  const response = await fetch(new URL('/v1/snapshot', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability, ...identity }),
  });
  if (!response.ok) throw new Error(`Course-agent Worker snapshot failed (${response.status})`);
  return CourseAgentSnapshotSchema.parse(await response.json());
}

export async function respondToCourseAgentPushApproval({
  approvalId,
  decision,
  result,
  ...identity
}: Identity & {
  approvalId: string;
  decision: 'publishing' | 'denied' | 'completed' | 'failed';
  result?: Record<string, unknown> | null;
}) {
  if (config.courseAgentRuntime === 'fake') return { accepted: true as const };
  const capability = generateSignedToken(
    { type: 'course-agent-inspect', ...identity, expiresAt: expiresAt() },
    capabilitySecret(),
  );
  const body = CourseAgentPushDecisionRequestSchema.parse({
    capability,
    ...identity,
    approvalId,
    decision,
    result: result ?? null,
  });
  const response = await fetch(new URL('/v1/push-decisions', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Course-agent Worker rejected the push decision (${response.status})`);
  }
  return { accepted: true as const };
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
  if (!existing) {
    append('sandbox.starting', { sandboxId: identity.sandboxId });
    append('workspace.seeded', { path: '/workspace/README.md' });
    append('sandbox.ready', { workspacePath: '/workspace' });
  }
  append('user.message', { text: prompt });
  append('agent.started', { model: 'fake' });
  append('tool.started', { operationId: runId, tool: 'Edit' });
  append('tool.completed', { operationId: runId });
  const response = `Updated /workspace/README.md for: ${prompt}`;
  append('assistant.delta', { text: response });
  append('agent.completed', { response });
  fakeConversations.set(identity.conversationId, {
    ...identity,
    activeRunId: null,
    status: 'waiting_for_user',
    response,
    error: null,
    events,
    workspaceReadme,
    usage: {
      provider: 'fake',
      model: 'fake',
      inputTokens: 80,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 40,
      reasoningTokens: null,
      normalizedTotalTokens: 120,
      providerCostMilliDollars: null,
      estimatedCostMilliDollars: 1,
      finalizedAt: new Date().toISOString(),
    },
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
    response: conversation.response,
    error: conversation.error,
    events: conversation.events,
    usage: conversation.usage,
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
