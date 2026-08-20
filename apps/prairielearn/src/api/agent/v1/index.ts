import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type Request, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  type AgentRunCapabilityClaims,
  AgentToolNameSchema,
  AgentToolRequestSchema,
  AgentToolResponseSchema,
  AppendAgentEventsRequestSchema,
} from '@prairielearn/agent-protocol';
import * as error from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';

import { validateHTML } from '../../../ee/lib/validateHTML.js';
import { verifyAgentRunCapability } from '../../../lib/agent-capability.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { features } from '../../../lib/features/index.js';
import { getAndRenderVariant } from '../../../lib/question-render.js';
import type { IssueRenderData } from '../../../lib/question-render.types.js';
import { getJobOutput } from '../../../mcp/tools/get-job-output.js';
import { ENTITY_SCOPES, listEntities } from '../../../mcp/tools/list-entities.js';
import { queryCourseData } from '../../../mcp/tools/query-course-data.js';
import {
  appendAgentRunEvents,
  beginAgentOperation,
  completeAgentDraftQuestion,
  completeAgentOperation,
  failAgentOperation,
  reclaimAgentOperation,
  releaseAgentDraftQuestion,
  reserveAgentDraftQuestion,
  selectAgentOperation,
  selectAgentOperationResultEvent,
  selectAgentRun,
  selectAgentUserIsAdministrator,
  selectLatestAgentConversationCheckpoint,
} from '../../../models/agent-conversation.js';
import { selectOptionalQuestionByQid, selectQuestionById } from '../../../models/question.js';
import { selectUserById } from '../../../models/user.js';

const router = Router();

export async function resolveAgentCourseFilePath(
  coursePath: string,
  relativePath: string,
): Promise<string | null> {
  const [realCoursePath, realFilePath] = await Promise.all([
    fs.realpath(coursePath),
    fs.realpath(path.resolve(coursePath, relativePath)),
  ]);
  return contains(realCoursePath, realFilePath, false) ? realFilePath : null;
}

function httpError(status: number, message: string): never {
  throw new error.HttpStatusError(status, message);
}

function getBearerToken(authorization: string | undefined): string {
  if (authorization === undefined) return httpError(401, 'Bearer capability is required.');
  const match = /^Bearer (\S+)$/i.exec(authorization);
  return match?.[1] ?? httpError(401, 'Bearer capability is invalid.');
}

async function authorizeRun(req: Request) {
  const runId = z.string().min(1).parse(req.params.run_id);
  let claims: AgentRunCapabilityClaims;
  try {
    claims = await verifyAgentRunCapability(getBearerToken(req.headers.authorization));
  } catch {
    return httpError(401, 'Bearer capability is invalid or expired.');
  }
  if (claims.run_id !== runId) return httpError(403, 'Capability does not match run.');
  if (claims.purpose !== 'run') {
    return httpError(403, 'Capability purpose does not allow callbacks.');
  }
  const run = await selectAgentRun({ courseId: claims.course_id, runId: claims.run_id });
  if (
    run?.conversation_id !== claims.conversation_id ||
    run.capability_jti !== claims.jti ||
    run.authn_user_id !== claims.authn_user_id ||
    run.user_id !== claims.user_id ||
    run.capability_expires_at.getTime() <= Date.now() ||
    run.allowed_tools.length !== claims.allowed_tools.length ||
    run.allowed_tools.some(
      (tool) => !claims.allowed_tools.includes(AgentToolNameSchema.parse(tool)),
    )
  ) {
    return httpError(403, 'Capability no longer authorizes this run.');
  }
  const user = await selectUserById(claims.authn_user_id);
  const isAdministrator = await selectAgentUserIsAdministrator(user.id);
  const requestIp = req.ip ?? req.socket.remoteAddress;
  if (requestIp === undefined) return httpError(400, 'Request IP address is unavailable.');
  const context = await constructCourseOrInstanceContext({
    course_id: claims.course_id,
    course_instance_id: null,
    ip: requestIp,
    is_administrator: isAdministrator,
    overrides: { allow_example_course_override: false },
    req_date: new Date(),
    user,
  });
  if (
    context.authzData === null ||
    !context.authzData.has_course_permission_edit ||
    context.course.example_course
  ) {
    return httpError(403, 'Current course authorization does not allow this operation.');
  }
  if (
    !(await features.enabled('cloud-agent', {
      course_id: context.course.id,
      institution_id: context.course.institution_id,
      user_id: user.id,
    }))
  ) {
    return httpError(403, 'Course agent is no longer enabled.');
  }
  return { claims, course: context.course, run, user };
}

const ListEntitiesInputSchema = z.object({ scope: z.enum(ENTITY_SCOPES) });
const ReadCourseFileInputSchema = z.object({ path: z.string().min(1).max(4096) });
const QueryCourseDataInputSchema = z.object({ query: z.string().min(1).max(100_000) });
const DraftQuestionFileSchema = z.object({
  content: z.string().max(1_000_000),
  path: z.string().min(1).max(255),
});
const RenderQuestionInputSchema = z
  .object({
    files: z.array(DraftQuestionFileSchema).min(1).max(30),
    qid: z.string().min(1).max(255),
    variant_seed: z.string().optional(),
  })
  .refine(
    ({ files }) =>
      files.reduce((total, file) => total + Buffer.byteLength(file.content), 0) <= 1_000_000,
    'Draft question files may not exceed 1 MiB.',
  );
const GetJobOutputInputSchema = z.object({ job_sequence_id: z.string().min(1) });

async function executeTool({
  toolName,
  input,
  course,
  user,
  runId,
  conversationId,
}: {
  toolName: z.infer<typeof AgentToolNameSchema>;
  input: Record<string, unknown>;
  course: Awaited<ReturnType<typeof authorizeRun>>['course'];
  user: Awaited<ReturnType<typeof authorizeRun>>['user'];
  runId: string;
  conversationId: string;
}): Promise<Record<string, unknown>> {
  if (toolName === 'list_entities') {
    const { scope } = ListEntitiesInputSchema.parse(input);
    return { entities: await listEntities({ course, scope }) };
  }
  if (toolName === 'read_course_file') {
    const parsed = ReadCourseFileInputSchema.parse(input);
    const realFilePath = await resolveAgentCourseFilePath(course.path, parsed.path);
    if (realFilePath === null) {
      return httpError(400, 'Invalid course path.');
    }
    const stat = await fs.stat(realFilePath);
    if (!stat.isFile() || stat.size > 1_000_000) {
      return httpError(400, 'Course file is unavailable or too large.');
    }
    return { content: await fs.readFile(realFilePath, 'utf8'), path: parsed.path, size: stat.size };
  }
  if (toolName === 'query_course_data') {
    if (
      !config.devMode ||
      !(await features.enabled('cloud-agent-arbitrary-sql', {
        course_id: course.id,
        institution_id: course.institution_id,
        user_id: user.id,
      }))
    ) {
      return { available: false, reason: 'Arbitrary SQL is only available in local development.' };
    }
    const parsed = QueryCourseDataInputSchema.parse(input);
    return { available: true, ...(await queryCourseData(parsed.query)) };
  }
  if (toolName === 'render_question') {
    const parsed = RenderQuestionInputSchema.parse(input);
    if (config.chunksConsumer) {
      return {
        issues: [
          {
            message: 'Draft rendering is unavailable on chunk-consumer PrairieLearn servers.',
            type: 'unavailable',
          },
        ],
        rendered: false,
      };
    }
    const allowedAssetExtensions = new Set([
      '.css',
      '.csv',
      '.gif',
      '.jpeg',
      '.jpg',
      '.js',
      '.json',
      '.png',
      '.svg',
      '.txt',
      '.webp',
    ]);
    for (const file of parsed.files) {
      const allowedSource = ['info.json', 'question.html', 'question.py', 'server.py'].includes(
        file.path,
      );
      if (
        !contains('/question', path.resolve('/question', file.path), false) ||
        (!allowedSource && !allowedAssetExtensions.has(path.extname(file.path).toLowerCase()))
      ) {
        return httpError(400, `Draft file path is not allowed: ${file.path}`);
      }
    }
    const questionHtml = parsed.files.find((file) => file.path === 'question.html')?.content;
    if (questionHtml === undefined) return httpError(400, 'Draft must include question.html.');
    const htmlValidation = await validateHTML(
      questionHtml,
      parsed.files.some((file) => ['question.py', 'server.py'].includes(file.path)),
    );
    if (htmlValidation.errors.length > 0) {
      return {
        issues: htmlValidation.errors.map((message) => ({ message, type: 'validation' })),
        rendered: false,
        warnings: htmlValidation.warnings,
      };
    }
    let question = await selectOptionalQuestionByQid({ course_id: course.id, qid: parsed.qid });
    if (question === null) {
      const { reservation, created: reservationCreated } = await reserveAgentDraftQuestion({
        conversationId,
        requestedQid: parsed.qid,
      });
      if (!reservationCreated) {
        if (reservation.question_id === null) {
          return httpError(409, 'Draft question creation is already in progress.');
        }
        question = await selectQuestionById(reservation.question_id);
      } else {
        const files = Object.fromEntries(
          parsed.files
            .filter((file) => file.path !== 'info.json')
            .map((file) => [file.path === 'question.py' ? 'server.py' : file.path, file.content]),
        );
        const created = await getCourseFilesClient()
          .createQuestion.mutate({
            authn_user_id: user.id,
            course_id: course.id,
            files,
            has_course_permission_edit: true,
            is_draft: true,
            user_id: user.id,
          })
          .catch(async (creationError: unknown) => {
            await releaseAgentDraftQuestion(reservation.id);
            throw creationError;
          });
        if (created.status === 'error') {
          await releaseAgentDraftQuestion(reservation.id);
          return httpError(500, `Failed to create draft question (${created.job_sequence_id}).`);
        }
        try {
          await completeAgentDraftQuestion({
            questionId: created.question_id,
            reservationId: reservation.id,
            userId: user.id,
          });
        } catch (completionError) {
          const cleanup = await getCourseFilesClient()
            .batchDeleteQuestions.mutate({
              authn_user_id: user.id,
              course_id: course.id,
              has_course_permission_edit: true,
              question_ids: [created.question_id],
              user_id: user.id,
            })
            .catch(async (cleanupError: unknown) => {
              await releaseAgentDraftQuestion(reservation.id);
              throw new AggregateError(
                [completionError, cleanupError],
                'Failed to register or clean up an agent draft question.',
              );
            });
          await releaseAgentDraftQuestion(reservation.id);
          if (cleanup.status === 'error') {
            throw new AggregateError(
              [completionError],
              `Failed to register or clean up an agent draft question (${cleanup.job_sequence_id}).`,
              { cause: completionError },
            );
          }
          throw completionError;
        }
        question = await selectQuestionById(created.question_id);
      }
    }
    const draftRoot = await fs.mkdtemp(path.join(os.tmpdir(), `pl-agent-render-${runId}-`));
    const draftQuestionPath = path.join(draftRoot, 'questions', question.directory ?? parsed.qid);
    await fs.mkdir(draftQuestionPath, { recursive: true });
    try {
      for (const file of parsed.files) {
        const relativePath = file.path === 'question.py' ? 'server.py' : file.path;
        const targetPath = path.resolve(draftQuestionPath, relativePath);
        if (!contains(draftQuestionPath, targetPath, false)) {
          return httpError(400, 'Draft file path is invalid.');
        }
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, file.content, { encoding: 'utf8', flag: 'wx' });
      }
      const draftCourse = { ...course, path: draftRoot };
      const locals = {
        authn_user: user,
        course: draftCourse,
        is_administrator: false,
        issues: [] as IssueRenderData[],
        question,
        urlPrefix: '',
        user,
      };
      const rendered = await getAndRenderVariant(null, parsed.variant_seed ?? null, locals, {
        issuesLoadExtraData: true,
      });
      return {
        issues: rendered.issues,
        preview: {
          content_type: 'text/html',
          extra_headers_html: rendered.extraHeadersHtml,
          html: rendered.questionHtml,
        },
        rendered: true,
        validation_warnings: htmlValidation.warnings,
        variant_id: rendered.variant.id,
        variant_seed: rendered.variant.variant_seed,
      };
    } finally {
      await fs.rm(draftRoot, { force: true, recursive: true });
    }
  }
  const parsed = GetJobOutputInputSchema.parse(input);
  return { ...(await getJobOutput({ course, jobSequenceId: parsed.job_sequence_id })) };
}

router.post(
  '/runs/:run_id/events',
  asyncHandler(async (req, res) => {
    const { run, course } = await authorizeRun(req);
    const input = AppendAgentEventsRequestSchema.parse(req.body);
    let terminalEvent: (typeof input.events)[number] | undefined;
    for (const event of input.events) {
      if (['run_started', 'run_cancelled', 'run_failed', 'run_completed'].includes(event.type)) {
        terminalEvent = event;
      }
    }
    const status =
      terminalEvent === undefined
        ? null
        : terminalEvent.type === 'run_cancelled'
          ? 'canceled'
          : terminalEvent.type === 'run_completed'
            ? 'completed'
            : terminalEvent.type === 'run_failed'
              ? 'failed'
              : 'running';
    const eventError =
      terminalEvent?.type === 'run_failed'
        ? z.string().max(10_000).catch('Agent run failed.').parse(terminalEvent.data.error)
        : null;
    const claudeSessionId =
      terminalEvent?.type === 'run_completed'
        ? z.string().min(1).max(1024).parse(terminalEvent.data.session_id)
        : null;
    const events = await appendAgentRunEvents({
      claudeSessionId,
      courseId: course.id,
      error: eventError,
      events: input.events,
      run,
      terminalStatus: status,
    });
    res.json({ events });
  }),
);

router.post(
  '/runs/:run_id/tools/:tool_name',
  asyncHandler(async (req, res) => {
    const { claims, course, run, user } = await authorizeRun(req);
    if (run.status !== 'running') return httpError(409, 'Run is not accepting tool calls.');
    const toolName = AgentToolNameSchema.parse(req.params.tool_name);
    if (!claims.allowed_tools.includes(toolName)) return httpError(403, 'Tool is not allowed.');
    const input = AgentToolRequestSchema.parse(req.body);
    const existingOperation = await selectAgentOperation(input.operation_id);
    if (existingOperation !== null) {
      if (
        existingOperation.run_id !== run.id ||
        existingOperation.tool_name !== toolName ||
        existingOperation.expected_revision !== (input.expected_revision ?? null) ||
        !isDeepStrictEqual(existingOperation.request, input.input)
      ) {
        return httpError(409, 'Operation ID was already used for a different request.');
      }
      const event = await selectAgentOperationResultEvent(input.operation_id);
      if (
        existingOperation.status === 'completed' &&
        existingOperation.response !== null &&
        event !== null
      ) {
        res.json(
          AgentToolResponseSchema.parse({
            checkpoint_revision: existingOperation.commit_sha ?? undefined,
            event_id: event.id,
            operation_id: input.operation_id,
            result: existingOperation.response,
          }),
        );
        return;
      }
      const reclaimed = await reclaimAgentOperation({
        courseId: course.id,
        operation: existingOperation,
        run,
      });
      if (reclaimed === null) return httpError(409, 'Operation is already in progress.');
      try {
        const result = await executeTool({
          course,
          conversationId: run.conversation_id,
          input: input.input,
          runId: run.id,
          toolName,
          user,
        });
        const completed = await completeAgentOperation({
          commitSha: reclaimed.expected_revision,
          courseId: course.id,
          operation: reclaimed,
          result,
          run,
        });
        res.json(
          AgentToolResponseSchema.parse({
            checkpoint_revision: reclaimed.expected_revision ?? undefined,
            event_id: completed.event.id,
            operation_id: input.operation_id,
            result,
          }),
        );
      } catch (toolError) {
        await failAgentOperation({
          courseId: course.id,
          error: toolError instanceof Error ? toolError.message : 'Tool failed.',
          operation: reclaimed,
          run,
        });
        throw toolError;
      }
      return;
    }
    const latestCheckpoint = await selectLatestAgentConversationCheckpoint(run.conversation_id);
    const currentRevision = z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable()
      .catch(run.base_commit_sha)
      .parse(latestCheckpoint?.data.head_sha ?? run.base_commit_sha);
    if (input.expected_revision !== undefined && input.expected_revision !== currentRevision) {
      return httpError(409, 'Expected revision does not match this run.');
    }
    const begun = await beginAgentOperation({
      courseId: course.id,
      expectedRevision: input.expected_revision ?? null,
      operationId: input.operation_id,
      request: input.input,
      run,
      toolName,
    });
    if (!begun.created) {
      if (
        begun.operation.run_id !== run.id ||
        begun.operation.tool_name !== toolName ||
        begun.operation.expected_revision !== (input.expected_revision ?? null) ||
        !isDeepStrictEqual(begun.operation.request, input.input)
      ) {
        return httpError(409, 'Operation ID was already used for a different request.');
      }
      const event = await selectAgentOperationResultEvent(input.operation_id);
      if (
        begun.operation.status !== 'completed' ||
        begun.operation.response === null ||
        event === null
      ) {
        return httpError(409, 'Operation is already in progress or failed.');
      }
      res.json(
        AgentToolResponseSchema.parse({
          checkpoint_revision: begun.operation.commit_sha ?? undefined,
          event_id: event.id,
          operation_id: input.operation_id,
          result: begun.operation.response,
        }),
      );
      return;
    }
    try {
      const result = await executeTool({
        course,
        conversationId: run.conversation_id,
        input: input.input,
        runId: run.id,
        toolName,
        user,
      });
      const completed = await completeAgentOperation({
        commitSha: currentRevision,
        courseId: course.id,
        operation: begun.operation,
        result,
        run,
      });
      res.json(
        AgentToolResponseSchema.parse({
          checkpoint_revision: currentRevision ?? undefined,
          event_id: completed.event.id,
          operation_id: input.operation_id,
          result,
        }),
      );
    } catch (toolError) {
      await failAgentOperation({
        courseId: course.id,
        error: toolError instanceof Error ? toolError.message : 'Tool failed.',
        operation: begun.operation,
        run,
      });
      throw toolError;
    }
  }),
);

export default router;
