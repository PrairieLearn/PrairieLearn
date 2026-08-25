import { setTimeout as scheduleTimeout } from 'node:timers';

import { z } from 'zod';

import {
  type CourseAgentCapability,
  type CourseAgentControlCapability,
  type CourseAgentEventType,
  type CourseAgentStartRunRequest,
  CourseAgentStartRunResponseSchema,
  makeCourseWorkspacePath,
  normalizeCourseWorkspaceDirectory,
} from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import type {
  CourseAgentConversation,
  CourseAgentRun,
  EnumCourseAgentRunStatus,
  EnumCourseAgentRuntimeStatus,
} from '../../../lib/db-types.js';
import {
  appendCourseAgentEvent,
  createCourseAgentWorkspaceBackup,
  selectActiveCourseAgentRun,
  selectCourseAgentConversationById,
  selectLatestCourseAgentWorkspaceBackup,
  updateCourseAgentAssistantMessage,
  updateCourseAgentConversationRuntime,
  updateCourseAgentRun,
} from '../../../models/course-agent.js';

const fakeIdleTimers = new Map<string, NodeJS.Timeout>();

interface CourseAgentRunCourse {
  id: string;
  shortName: string;
  repository: string;
  branch: string;
  commitHash: string | null;
}

interface CourseAgentControlCourse {
  id: string;
}

function getCapabilitySecret() {
  if (!config.courseAgentCapabilitySecret) {
    throw new Error('Course agent capability secret is not configured');
  }
  return config.courseAgentCapabilitySecret;
}

function getCallbackOrigin() {
  return config.serverCanonicalHost ?? `${config.serverType}://127.0.0.1:${config.serverPort}`;
}

function createRunCapability({
  conversation,
  run,
  course,
  userId,
}: {
  conversation: CourseAgentConversation;
  run: CourseAgentRun;
  course: CourseAgentRunCourse;
  userId: string;
}) {
  const capability: CourseAgentCapability = {
    type: 'course-agent-run',
    userId,
    courseId: course.id,
    conversationId: conversation.id,
    runId: run.id,
    sandboxId: conversation.sandbox_id,
    promptDigest: run.prompt_digest,
    repository: course.repository,
    branch: course.branch,
    callbackOrigin: getCallbackOrigin(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  return generateSignedToken(capability, getCapabilitySecret());
}

function createControlCapability({
  conversation,
  course,
  userId,
  action,
}: {
  conversation: CourseAgentConversation;
  course: CourseAgentControlCourse;
  userId: string;
  action: CourseAgentControlCapability['action'];
}) {
  const capability: CourseAgentControlCapability = {
    type: 'course-agent-control',
    userId,
    courseId: course.id,
    conversationId: conversation.id,
    sandboxId: conversation.sandbox_id,
    action,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  return generateSignedToken(capability, getCapabilitySecret());
}

async function setRuntimeStatus({
  conversationId,
  runId,
  status,
  eventType,
  data = {},
  runStatus,
}: {
  conversationId: string;
  runId: string | null;
  status: EnumCourseAgentRuntimeStatus;
  eventType: CourseAgentEventType;
  data?: Record<string, unknown>;
  runStatus?: EnumCourseAgentRunStatus;
}) {
  const conversation = await selectCourseAgentConversationById(conversationId);
  if (!conversation) throw new Error('Course agent conversation no longer exists');

  const now = new Date();
  await updateCourseAgentConversationRuntime({
    conversationId,
    runtimeStatus: status,
    containerId: conversation.container_id,
    coursePath: conversation.course_path,
    lastActivityAt: now,
    idleDeadlineAt: null,
    lastError: status === 'error' ? conversation.last_error : null,
  });
  if (runId && runStatus) {
    await updateCourseAgentRun({
      runId,
      status: runStatus,
      markStarted: runStatus === 'running',
    });
  }
  await appendCourseAgentEvent({ conversationId, runId, eventType, data });
}

async function checkpointFakeWorkspace({
  conversation,
  run,
  reason,
}: {
  conversation: CourseAgentConversation;
  run: CourseAgentRun | null;
  reason: 'idle_timeout' | 'test_kill' | 'conversation_deleted';
}) {
  await setRuntimeStatus({
    conversationId: conversation.id,
    runId: run?.id ?? null,
    status: 'checkpointing',
    eventType: 'workspace.backup.started',
    data: { reason, workspace_path: conversation.workspace_path },
  });

  const backup = await createCourseAgentWorkspaceBackup({
    conversationId: conversation.id,
    runId: run?.id ?? null,
    sandboxId: conversation.sandbox_id,
    backupHandle: { id: `fake-${conversation.sandbox_id}-${Date.now()}` },
    workspaceManifestVersion: 1,
    courseCommitSha: run?.pushed_sha ?? run?.commit_sha ?? run?.base_commit_sha ?? null,
    reason,
    sizeBytes: 0,
    expiresAt: new Date(Date.now() + config.courseAgentWorkspaceBackupTtlSeconds * 1000),
  });
  await appendCourseAgentEvent({
    conversationId: conversation.id,
    runId: run?.id ?? null,
    eventType: 'workspace.backup.completed',
    data: { backup_id: backup.id, reason },
  });
  return backup;
}

function scheduleFakeIdleDestruction(conversationId: string) {
  const existing = fakeIdleTimers.get(conversationId);
  if (existing) clearTimeout(existing);

  const timer = scheduleTimeout(() => {
    fakeIdleTimers.delete(conversationId);
    void destroyIdleFakeSandbox(conversationId);
  }, config.courseAgentIdleTimeoutSeconds * 1000);
  timer.unref();
  fakeIdleTimers.set(conversationId, timer);
}

async function destroyIdleFakeSandbox(conversationId: string) {
  const conversation = await selectCourseAgentConversationById(conversationId);
  if (conversation?.runtime_status !== 'ready') return;
  if (await selectActiveCourseAgentRun(conversationId)) return;

  await appendCourseAgentEvent({
    conversationId,
    runId: null,
    eventType: 'sandbox.idle_timeout',
    data: {},
  });
  await checkpointFakeWorkspace({ conversation, run: null, reason: 'idle_timeout' });
  await setRuntimeStatus({
    conversationId,
    runId: null,
    status: 'destroying',
    eventType: 'sandbox.destroying',
  });
  const latest = await selectCourseAgentConversationById(conversationId);
  if (!latest) return;
  await updateCourseAgentConversationRuntime({
    conversationId,
    runtimeStatus: 'offline',
    containerId: null,
    coursePath: latest.course_path,
    lastActivityAt: new Date(),
    idleDeadlineAt: null,
    lastError: null,
  });
  await appendCourseAgentEvent({
    conversationId,
    runId: null,
    eventType: 'sandbox.destroyed',
    data: {},
  });
}

async function runFakeCourseAgentTurn({
  conversationId,
  run,
}: {
  conversationId: string;
  run: CourseAgentRun;
}) {
  try {
    let conversation = await selectCourseAgentConversationById(conversationId);
    if (!conversation) throw new Error('Course agent conversation no longer exists');

    if (['unallocated', 'offline', 'error'].includes(conversation.runtime_status)) {
      await setRuntimeStatus({
        conversationId,
        runId: run.id,
        status: 'booting',
        eventType: 'sandbox.booting',
        runStatus: 'preparing',
        data: { sandbox_id: conversation.sandbox_id },
      });
      const backup = await selectLatestCourseAgentWorkspaceBackup(conversationId);
      await setRuntimeStatus({
        conversationId,
        runId: run.id,
        status: backup ? 'restoring' : 'cloning',
        eventType: backup ? 'workspace.restore.started' : 'git.clone.started',
        runStatus: 'preparing',
        data: backup ? { backup_id: backup.id } : { course_path: conversation.course_path },
      });
      await appendCourseAgentEvent({
        conversationId,
        runId: run.id,
        eventType: backup ? 'workspace.restore.completed' : 'git.clone.completed',
        data: backup ? { backup_id: backup.id } : { course_path: conversation.course_path },
      });
      await setRuntimeStatus({
        conversationId,
        runId: run.id,
        status: 'ready',
        eventType: 'sandbox.ready',
        runStatus: 'preparing',
      });
    }

    await setRuntimeStatus({
      conversationId,
      runId: run.id,
      status: 'running',
      eventType: 'agent.started',
      runStatus: 'running',
    });
    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'tool.started',
      data: { tool: 'fake_runtime', operation_id: `fake-${run.id}` },
    });
    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'tool.completed',
      data: { tool: 'fake_runtime', operation_id: `fake-${run.id}` },
    });
    await updateCourseAgentAssistantMessage({
      conversationId,
      runId: run.id,
      status: 'streaming',
      parts: [
        {
          type: 'text',
          text: 'The deterministic local runtime completed this turn. Connect Wrangler to run Claude and publish real course edits.',
        },
      ],
      metadata: { runtime: 'fake' },
    });
    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'agent.completed',
      data: { runtime: 'fake' },
    });

    await setRuntimeStatus({
      conversationId,
      runId: run.id,
      status: 'finalizing',
      eventType: 'git.commit.started',
      runStatus: 'finalizing',
      data: { skipped: true, reason: 'fake_runtime' },
    });
    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'git.commit.completed',
      data: { skipped: true, reason: 'fake_runtime' },
    });

    await updateCourseAgentRun({ runId: run.id, status: 'completed', markCompleted: true });
    await updateCourseAgentAssistantMessage({
      conversationId,
      runId: run.id,
      status: 'completed',
      parts: [
        {
          type: 'text',
          text: 'The deterministic local runtime completed this turn. Connect Wrangler to run Claude and publish real course edits.',
        },
      ],
      metadata: { runtime: 'fake' },
    });
    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'run.completed',
      data: { runtime: 'fake' },
    });

    conversation = await selectCourseAgentConversationById(conversationId);
    if (!conversation) throw new Error('Course agent conversation no longer exists');
    const idleDeadline = new Date(Date.now() + config.courseAgentIdleTimeoutSeconds * 1000);
    await updateCourseAgentConversationRuntime({
      conversationId,
      runtimeStatus: 'ready',
      containerId: conversation.container_id ?? `fake-${conversation.sandbox_id}`,
      coursePath: conversation.course_path,
      lastActivityAt: new Date(),
      idleDeadlineAt: idleDeadline,
      lastError: null,
    });
    scheduleFakeIdleDestruction(conversationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateCourseAgentRun({
      runId: run.id,
      status: 'failed',
      errorCode: 'fake_runtime_failed',
      errorMessage: message,
      markCompleted: true,
    });
    await updateCourseAgentAssistantMessage({
      conversationId,
      runId: run.id,
      status: 'errored',
      parts: [{ type: 'text', text: message }],
      metadata: { runtime: 'fake' },
    });
    const conversation = await selectCourseAgentConversationById(conversationId);
    if (conversation) {
      await updateCourseAgentConversationRuntime({
        conversationId,
        runtimeStatus: 'error',
        containerId: conversation.container_id,
        coursePath: conversation.course_path,
        lastActivityAt: new Date(),
        idleDeadlineAt: null,
        lastError: message,
      });
      await appendCourseAgentEvent({
        conversationId,
        runId: run.id,
        eventType: 'run.failed',
        data: { code: 'fake_runtime_failed', message },
      });
    }
  }
}

export async function dispatchCourseAgentRun({
  conversation,
  run,
  prompt,
  course,
  userId,
}: {
  conversation: CourseAgentConversation;
  run: CourseAgentRun;
  prompt: string;
  course: CourseAgentRunCourse;
  userId: string;
}) {
  const existingTimer = fakeIdleTimers.get(conversation.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    fakeIdleTimers.delete(conversation.id);
  }

  await appendCourseAgentEvent({
    conversationId: conversation.id,
    runId: run.id,
    eventType: 'sandbox.requested',
    data: { runtime: config.courseAgentRuntime },
  });

  if (config.courseAgentRuntime === 'fake') {
    setImmediate(() => void runFakeCourseAgentTurn({ conversationId: conversation.id, run }));
    return;
  }
  if (config.courseAgentRuntime !== 'cloudflare') {
    throw new Error('Course agent runtime is disabled');
  }

  const courseDirectory = normalizeCourseWorkspaceDirectory(course.shortName);
  const latestBackup = await selectLatestCourseAgentWorkspaceBackup(conversation.id);
  const workspaceBackup = latestBackup
    ? z
        .object({ id: z.string(), dir: z.string(), localBucket: z.boolean().optional() })
        .parse(latestBackup.backup_handle)
    : null;
  const request: CourseAgentStartRunRequest = {
    capability: createRunCapability({ conversation, run, course, userId }),
    conversationId: conversation.id,
    runId: run.id,
    sandboxId: conversation.sandbox_id,
    prompt,
    course: {
      id: course.id,
      directory: courseDirectory,
      repository: course.repository,
      branch: course.branch,
      expectedSha: course.commitHash,
    },
    callbackOrigin: getCallbackOrigin(),
    localDevelopment: config.devMode,
    workspaceBackup,
  };

  const response = await fetch(new URL('/v1/runs', config.courseAgentWorkerOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Course agent Worker rejected run: ${response.status} ${await response.text()}`,
    );
  }
  CourseAgentStartRunResponseSchema.parse(await response.json());
}

export async function killCourseAgentSandbox({
  conversation,
  course,
  userId,
  hard,
  reason,
}: {
  conversation: CourseAgentConversation;
  course: CourseAgentControlCourse;
  userId: string;
  hard: boolean;
  reason: 'test_kill' | 'conversation_deleted';
}) {
  if (config.courseAgentRuntime === 'fake') {
    const activeRun = await selectActiveCourseAgentRun(conversation.id);
    if (activeRun && hard) {
      await updateCourseAgentRun({
        runId: activeRun.id,
        status: 'failed',
        errorCode: 'sandbox_test_killed',
        errorMessage: 'Sandbox was destroyed with the test-only hard kill control.',
        markCompleted: true,
      });
      await updateCourseAgentAssistantMessage({
        conversationId: conversation.id,
        runId: activeRun.id,
        status: 'errored',
        parts: [{ type: 'text', text: 'Sandbox was destroyed by the test kill control.' }],
      });
      await appendCourseAgentEvent({
        conversationId: conversation.id,
        runId: activeRun.id,
        eventType: 'run.failed',
        data: { code: 'sandbox_test_killed' },
      });
    }
    if (reason === 'test_kill') {
      await appendCourseAgentEvent({
        conversationId: conversation.id,
        runId: activeRun?.id ?? null,
        eventType: 'sandbox.test_kill_requested',
        data: { hard },
      });
    }
    await checkpointFakeWorkspace({ conversation, run: activeRun, reason });
    await setRuntimeStatus({
      conversationId: conversation.id,
      runId: activeRun?.id ?? null,
      status: 'destroying',
      eventType: 'sandbox.destroying',
      data: { hard, reason },
    });
    await updateCourseAgentConversationRuntime({
      conversationId: conversation.id,
      runtimeStatus: 'offline',
      containerId: null,
      coursePath: conversation.course_path,
      lastActivityAt: new Date(),
      idleDeadlineAt: null,
      lastError: null,
    });
    await appendCourseAgentEvent({
      conversationId: conversation.id,
      runId: activeRun?.id ?? null,
      eventType: 'sandbox.destroyed',
      data: { hard, reason },
    });
    return;
  }

  const response = await fetch(
    new URL(
      `/v1/sandboxes/${encodeURIComponent(conversation.sandbox_id)}/kill`,
      config.courseAgentWorkerOrigin,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capability: createControlCapability({ conversation, course, userId, action: 'kill' }),
        conversationId: conversation.id,
        sandboxId: conversation.sandbox_id,
        hard,
        reason,
      }),
      signal: AbortSignal.timeout(300_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Course agent Worker failed to kill sandbox: ${response.status}`);
  }
}

export function getCourseAgentCoursePath(shortName: string) {
  return makeCourseWorkspacePath(normalizeCourseWorkspaceDirectory(shortName));
}
