import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  CourseAgentBackupReasonSchema,
  CourseAgentCallbackRequestSchema,
  CourseAgentCapabilitySchema,
  CourseAgentSyncRequestSchema,
  CourseDataQuerySchema,
  CourseDataResourceSchema,
} from '@prairielearn/course-agent-protocol';
import { HttpStatusError } from '@prairielearn/error';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';
import { pullAndUpdateCourse } from '../../lib/course.js';
import type {
  CourseAgentConversation,
  EnumCourseAgentRunStatus,
  EnumCourseAgentRuntimeStatus,
} from '../../lib/db-types.js';
import {
  appendCourseAgentEvent,
  createCourseAgentWorkspaceBackup,
  selectCourseAgentConversationById,
  selectCourseAgentRun,
  updateCourseAgentAssistantMessage,
  updateCourseAgentConversationRuntime,
  updateCourseAgentRun,
} from '../../models/course-agent.js';
import { selectCourseById } from '../../models/course.js';
import {
  CourseDataQueryLimitError,
  CourseDataQueryValidationError,
  describeCourseDataResource,
  executeCourseDataQuery,
  listCourseDataResources,
} from '../lib/course-agent/course-data.js';

const router = Router();

function capabilitySecret() {
  if (!config.courseAgentCapabilitySecret) {
    throw new HttpStatusError(503, 'Course-agent capability secret is not configured');
  }
  return config.courseAgentCapabilitySecret;
}

function verifyCapability({
  token,
  conversationId,
  runId,
  sandboxId,
}: {
  token: string;
  conversationId: string;
  runId: string;
  sandboxId: string;
}) {
  const capability = parseCapability(token);
  if (
    capability.conversationId !== conversationId ||
    capability.runId !== runId ||
    capability.sandboxId !== sandboxId
  ) {
    throw new HttpStatusError(403, 'Course-agent capability does not match this run');
  }
  return capability;
}

function parseCapability(token: string) {
  const capability = CourseAgentCapabilitySchema.safeParse(
    getCheckedSignedTokenData(token, capabilitySecret()),
  );
  if (!capability.success) throw new HttpStatusError(401, 'Invalid course-agent capability');
  if (new Date(capability.data.expiresAt) <= new Date()) {
    throw new HttpStatusError(401, 'Expired course-agent capability');
  }
  return capability.data;
}

function bearerCapability(req: { get(name: string): string | undefined }) {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpStatusError(401, 'Missing course-agent bearer capability');
  }
  return parseCapability(authorization.slice('Bearer '.length));
}

async function loadCapabilityState({
  conversationId,
  runId,
  sandboxId,
  courseId,
  userId,
}: {
  conversationId: string;
  runId: string;
  sandboxId: string;
  courseId: string;
  userId: string;
}) {
  const conversation = await selectCourseAgentConversationById(conversationId);
  const run = await selectCourseAgentRun({ conversationId, runId });
  if (
    !conversation ||
    !run ||
    conversation.sandbox_id !== sandboxId ||
    conversation.course_id !== courseId ||
    conversation.user_id !== userId
  ) {
    throw new HttpStatusError(404, 'Course-agent run not found');
  }
  return { conversation, run };
}

async function loadDataCapabilityState(req: { get(name: string): string | undefined }) {
  const capability = bearerCapability(req);
  const state = await loadCapabilityState({
    conversationId: capability.conversationId,
    runId: capability.runId,
    sandboxId: capability.sandboxId,
    courseId: capability.courseId,
    userId: capability.userId,
  });
  if (['completed', 'failed', 'canceled'].includes(state.run.status)) {
    throw new HttpStatusError(409, 'Course-agent run is no longer active');
  }
  return { capability, ...state };
}

async function setConversationRuntime({
  conversation,
  runtimeStatus,
  lastError = null,
  idleDeadlineAt = null,
}: {
  conversation: CourseAgentConversation;
  runtimeStatus: EnumCourseAgentRuntimeStatus;
  lastError?: string | null;
  idleDeadlineAt?: Date | null;
}) {
  await updateCourseAgentConversationRuntime({
    conversationId: conversation.id,
    runtimeStatus,
    containerId: runtimeStatus === 'offline' ? null : conversation.sandbox_id,
    coursePath: conversation.course_path,
    lastActivityAt: new Date(),
    idleDeadlineAt,
    lastError,
  });
}

const AgentCompletedDataSchema = z.object({ response: z.string() });
const GitCompletedDataSchema = z.object({ sha: z.string() });
const BackupCompletedDataSchema = z.object({
  backup_handle: z.unknown(),
  reason: CourseAgentBackupReasonSchema,
  size_bytes: z.number().int().nonnegative().nullable().default(null),
  expires_at: z.iso.datetime().nullable().default(null),
  course_commit_sha: z.string().nullable().default(null),
  workspace_manifest_version: z.number().int().positive().default(1),
});
const RunFailedDataSchema = z.object({
  code: z.string().default('agent_run_failed'),
  message: z.string(),
});
const RunCompletedDataSchema = z.object({
  response: z.string(),
  idle_deadline_at: z.iso.datetime().nullable().optional(),
});

router.get(
  '/data/resources',
  asyncHandler(async (req, res) => {
    await loadDataCapabilityState(req);
    res.status(200).json({ resources: listCourseDataResources() });
  }),
);

router.get(
  '/data/resources/:resource',
  asyncHandler(async (req, res) => {
    await loadDataCapabilityState(req);
    const resource = CourseDataResourceSchema.safeParse(req.params.resource);
    if (!resource.success) throw new HttpStatusError(400, 'Unknown course-data resource');
    res.status(200).json(describeCourseDataResource(resource.data));
  }),
);

router.post(
  '/data/query',
  asyncHandler(async (req, res) => {
    const { capability } = await loadDataCapabilityState(req);
    const query = CourseDataQuerySchema.safeParse(req.body);
    if (!query.success) throw new HttpStatusError(400, 'Invalid course-data query');
    try {
      res.status(200).json(
        await executeCourseDataQuery({
          courseId: capability.courseId,
          conversationId: capability.conversationId,
          runId: capability.runId,
          sandboxId: capability.sandboxId,
          query: query.data,
        }),
      );
    } catch (error) {
      if (error instanceof CourseDataQueryValidationError) {
        throw new HttpStatusError(400, error.message);
      }
      if (error instanceof CourseDataQueryLimitError) {
        throw new HttpStatusError(413, error.message);
      }
      throw error;
    }
  }),
);

function runStatusForEvent(eventType: string): EnumCourseAgentRunStatus | null {
  switch (eventType) {
    case 'sandbox.requested':
    case 'sandbox.booting':
    case 'workspace.created':
    case 'workspace.restore.started':
    case 'workspace.restore.completed':
    case 'git.clone.started':
    case 'git.clone.completed':
    case 'git.fetch.started':
    case 'git.fetch.completed':
      return 'preparing';
    case 'agent.started':
    case 'tool.started':
    case 'tool.completed':
    case 'tool.failed':
      return 'running';
    case 'agent.completed':
    case 'git.commit.started':
    case 'git.commit.completed':
    case 'git.push.started':
    case 'git.push.completed':
      return 'finalizing';
    case 'workspace.backup.started':
    case 'workspace.backup.completed':
      return 'checkpointing';
    default:
      return null;
  }
}

router.post(
  '/event',
  asyncHandler(async (req, res) => {
    const body = CourseAgentCallbackRequestSchema.parse(req.body);
    const capability = verifyCapability({
      token: body.capability,
      conversationId: body.conversationId,
      runId: body.runId,
      sandboxId: body.sandboxId,
    });
    const { conversation, run } = await loadCapabilityState({
      ...body,
      courseId: capability.courseId,
      userId: capability.userId,
    });
    const insertedEvent = await appendCourseAgentEvent({
      conversationId: body.conversationId,
      runId: body.runId,
      eventType: body.event.type,
      data: body.event.data,
      externalEventId: body.event.eventId,
    });
    if (!insertedEvent) {
      res.status(200).json({ accepted: true, duplicate: true });
      return;
    }

    const runStatus = runStatusForEvent(body.event.type);
    if (runStatus && !['completed', 'failed', 'canceled'].includes(run.status)) {
      await updateCourseAgentRun({
        runId: body.runId,
        status: runStatus,
        markStarted: runStatus === 'running',
      });
    }

    switch (body.event.type) {
      case 'sandbox.requested':
      case 'sandbox.booting':
        await setConversationRuntime({ conversation, runtimeStatus: 'booting' });
        break;
      case 'workspace.restore.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'restoring' });
        break;
      case 'git.clone.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'cloning' });
        break;
      case 'sandbox.ready':
        await setConversationRuntime({ conversation, runtimeStatus: 'ready' });
        break;
      case 'sandbox.destroying':
        await setConversationRuntime({ conversation, runtimeStatus: 'destroying' });
        break;
      case 'sandbox.destroyed':
        await setConversationRuntime({ conversation, runtimeStatus: 'offline' });
        break;
      case 'agent.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'running' });
        break;
      case 'agent.completed': {
        const data = AgentCompletedDataSchema.parse(body.event.data);
        await updateCourseAgentAssistantMessage({
          conversationId: body.conversationId,
          runId: body.runId,
          status: 'streaming',
          parts: [{ type: 'text', text: data.response }],
        });
        await setConversationRuntime({ conversation, runtimeStatus: 'finalizing' });
        break;
      }
      case 'git.commit.started':
      case 'git.push.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'finalizing' });
        break;
      case 'git.commit.completed': {
        const data = GitCompletedDataSchema.parse(body.event.data);
        await updateCourseAgentRun({
          runId: body.runId,
          status: 'finalizing',
          commitSha: data.sha,
        });
        break;
      }
      case 'git.push.completed': {
        const data = GitCompletedDataSchema.parse(body.event.data);
        await updateCourseAgentRun({
          runId: body.runId,
          status: 'finalizing',
          pushedSha: data.sha,
        });
        break;
      }
      case 'sync.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'syncing' });
        break;
      case 'workspace.backup.started':
        await setConversationRuntime({ conversation, runtimeStatus: 'checkpointing' });
        break;
      case 'workspace.backup.completed': {
        const data = BackupCompletedDataSchema.parse(body.event.data);
        await createCourseAgentWorkspaceBackup({
          conversationId: body.conversationId,
          runId: body.runId,
          sandboxId: body.sandboxId,
          backupHandle: data.backup_handle,
          workspaceManifestVersion: data.workspace_manifest_version,
          courseCommitSha: data.course_commit_sha,
          reason: data.reason,
          sizeBytes: data.size_bytes,
          expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        });
        break;
      }
      case 'run.completed': {
        const data = RunCompletedDataSchema.parse(body.event.data);
        await updateCourseAgentRun({
          runId: body.runId,
          status: 'completed',
          markCompleted: true,
        });
        await updateCourseAgentAssistantMessage({
          conversationId: body.conversationId,
          runId: body.runId,
          status: 'completed',
          parts: [{ type: 'text', text: data.response }],
        });
        await setConversationRuntime({
          conversation,
          runtimeStatus: 'ready',
          idleDeadlineAt: data.idle_deadline_at ? new Date(data.idle_deadline_at) : null,
        });
        break;
      }
      case 'run.failed': {
        const data = RunFailedDataSchema.parse(body.event.data);
        await updateCourseAgentRun({
          runId: body.runId,
          status: 'failed',
          errorCode: data.code,
          errorMessage: data.message,
          markCompleted: true,
        });
        await updateCourseAgentAssistantMessage({
          conversationId: body.conversationId,
          runId: body.runId,
          status: 'errored',
          parts: [{ type: 'text', text: data.message }],
        });
        await setConversationRuntime({
          conversation,
          runtimeStatus: 'error',
          lastError: data.message,
        });
        break;
      }
    }

    res.status(200).json({ accepted: true, duplicate: false });
  }),
);

router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const body = CourseAgentSyncRequestSchema.parse(req.body);
    const capability = verifyCapability({
      token: body.capability,
      conversationId: body.conversationId,
      runId: body.runId,
      sandboxId: body.sandboxId,
    });
    const { conversation, run } = await loadCapabilityState({
      ...body,
      courseId: capability.courseId,
      userId: capability.userId,
    });
    if (run.sync_job_sequence_id) {
      res.status(200).json({ jobSequenceId: run.sync_job_sequence_id, duplicate: true });
      return;
    }

    await appendCourseAgentEvent({
      conversationId: body.conversationId,
      runId: body.runId,
      eventType: 'sync.started',
      data: { pushed_sha: body.pushedSha },
      externalEventId: `sync-start-${body.runId}`,
    });
    await updateCourseAgentRun({
      runId: body.runId,
      status: 'syncing',
      pushedSha: body.pushedSha,
    });
    await setConversationRuntime({ conversation, runtimeStatus: 'syncing' });

    const course = await selectCourseById(capability.courseId);
    try {
      const { jobSequenceId, jobPromise } = await pullAndUpdateCourse({
        course,
        userId: capability.userId,
        authnUserId: capability.userId,
      });
      await updateCourseAgentRun({
        runId: body.runId,
        status: 'syncing',
        syncJobSequenceId: jobSequenceId,
      });
      await jobPromise;
      await appendCourseAgentEvent({
        conversationId: body.conversationId,
        runId: body.runId,
        eventType: 'sync.completed',
        data: { job_sequence_id: jobSequenceId, pushed_sha: body.pushedSha },
        externalEventId: `sync-complete-${body.runId}`,
      });
      res.status(200).json({ jobSequenceId, duplicate: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateCourseAgentRun({
        runId: body.runId,
        status: 'failed',
        errorCode: 'course_sync_failed',
        errorMessage: message,
        markCompleted: true,
      });
      await updateCourseAgentAssistantMessage({
        conversationId: body.conversationId,
        runId: body.runId,
        status: 'errored',
        parts: [{ type: 'text', text: message }],
      });
      await setConversationRuntime({ conversation, runtimeStatus: 'error', lastError: message });
      await appendCourseAgentEvent({
        conversationId: body.conversationId,
        runId: body.runId,
        eventType: 'run.failed',
        data: { code: 'course_sync_failed', message },
        externalEventId: `sync-failed-${body.runId}`,
      });
      throw new HttpStatusError(502, `Course sync failed: ${message}`);
    }
  }),
);

export default router;
