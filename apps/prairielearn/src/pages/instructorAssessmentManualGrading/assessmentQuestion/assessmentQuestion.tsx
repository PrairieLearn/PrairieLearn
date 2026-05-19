import { Readable } from 'node:stream';

import { JsonToSseTransformStream, UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { Router } from 'express';
import z from 'zod';

import * as error from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import {
  WorkflowConflictError,
  cancelWorkflow,
  continueWorkflow,
  getActiveWorkflowRun,
  getWorkflowRun,
  startWorkflow,
} from '@prairielearn/workflows';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { prepareAgentMessages } from '../../../ee/lib/ai-grading/ai-grading-agent.js';
import { getAvailableAiGradingProviders } from '../../../ee/lib/ai-grading/ai-grading-credentials.js';
import {
  calculateAiGradingStats,
  fillInstanceQuestionColumnEntries,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  getAiGradingStreamContext,
  registerSseStream,
  takeSseStream,
} from '../../../ee/lib/ai-grading/redis.js';
import {
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import {
  cancelLatestStreamingAiGradingMessage,
  deleteAiGradingMessages,
  deleteAiGradingMessagesByIds,
  selectAiGradingMessages,
  selectLatestStreamingAiGradingMessage,
} from '../../../ee/models/ai-grading-message.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import {
  StaffAiGradingMessageSchema,
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { getAssessmentQuestionTrpcUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getUrl } from '../../../lib/url.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestionManualGrading } from './AssessmentQuestionManualGrading.html.js';
import { selectInstanceQuestionsForManualGrading } from './queries.js';

const router = Router();
const CHAT_STREAM_RETRY_INTERVAL_MS = 100;
const CHAT_STREAM_RETRY_TIMEOUT_MS = 3000;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    const courseStaff = z.array(StaffUserSchema).parse(
      await selectCourseInstanceGraderStaff({
        courseInstance: res.locals.course_instance,
        authzData: res.locals.authz_data,
        requiredRole: ['Student Data Viewer'],
      }),
    );
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const aiGradingModelSelectionEnabled = await features.enabledFromLocals(
      'ai-grading-model-selection',
      res.locals,
    );
    const aiRubricAgentEnabled = await features.enabledFromLocals(
      'ai-rubric-grading-agent',
      res.locals,
    );

    const rubric_data = await manualGrading.selectRubricData({
      assessment_question: res.locals.assessment_question,
    });

    const instanceQuestionGroups = z.array(StaffInstanceQuestionGroupSchema).parse(
      await selectInstanceQuestionGroups({
        assessmentQuestionId: res.locals.assessment_question.id,
      }),
    );

    const unfilledInstanceQuestionInfo = await selectInstanceQuestionsForManualGrading({
      assessment: res.locals.assessment,
      assessment_question: res.locals.assessment_question,
    });

    const instanceQuestionsInfo = await fillInstanceQuestionColumnEntries(
      unfilledInstanceQuestionInfo,
      res.locals.assessment_question,
    );

    const {
      authz_data,
      urlPrefix,
      __csrf_token,
      course_instance,
      course,
      question,
      assessment_question,
      assessment,
      num_open_instances,
      number_in_alternative_group,
    } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });
    const hasCourseInstancePermissionEdit = authz_data.has_course_instance_permission_edit ?? false;
    const search = getUrl(req).search;

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentQuestionTrpcUrl({
          courseInstanceId: res.locals.course_instance.id,
          assessmentId: res.locals.assessment.id,
          assessmentQuestionId: res.locals.assessment_question.id,
        }),
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    const chatCsrfToken = aiRubricAgentEnabled
      ? generatePrefixCsrfToken(
          {
            url: req.originalUrl.split('?')[0] + '/chat',
            authn_user_id: res.locals.authn_user.id,
          },
          config.secretKey,
        )
      : '';

    const availableAiGradingProviders = aiGradingEnabled
      ? await getAvailableAiGradingProviders(course_instance)
      : [];

    const initialChatMessages = aiRubricAgentEnabled
      ? z
          .array(StaffAiGradingMessageSchema)
          .parse(await selectAiGradingMessages(assessment_question.id))
      : [];

    const initialWorkflowSync = await run(async () => {
      if (!aiRubricAgentEnabled) return null;
      const wf = await getActiveWorkflowRun('ai_grading', {
        assessment_question_id: assessment_question.id,
      });
      if (!wf) return { workflowRunId: null, version: 0 };
      return {
        workflowRunId: wf.id,
        version: (wf.state as { version?: number }).version ?? 0,
      };
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Manual Grading',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'manual_grading',
        },
        options: {
          fullWidth: true,
          pageNote: `Question ${number_in_alternative_group}`,
        },
        headContent: aiRubricAgentEnabled
          ? html`
              <meta
                name="mathjax-fonts-path"
                content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
              />
              ${compiledScriptTag('mathjaxSetup.ts')}
              <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
            `
          : undefined,
        content: (
          <>
            <AssessmentOpenInstancesAlert
              numOpenInstances={num_open_instances}
              assessmentId={assessment.id}
              urlPrefix={urlPrefix}
            />

            <Hydrate>
              <AssessmentQuestionManualGrading
                hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
                search={search}
                instanceQuestionsInfo={instanceQuestionsInfo}
                course={course}
                courseInstance={course_instance}
                urlPrefix={urlPrefix}
                csrfToken={__csrf_token}
                trpcCsrfToken={trpcCsrfToken}
                assessment={assessment}
                assessmentQuestion={assessment_question}
                questionQid={question.qid!}
                aiGradingEnabled={aiGradingEnabled}
                aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                initialAiGradingMode={
                  aiGradingEnabled &&
                  assessment_question.ai_grading_mode &&
                  (assessment_question.max_manual_points ?? 0) > 0
                }
                rubricData={rubric_data}
                instanceQuestionGroups={instanceQuestionGroups}
                courseStaff={courseStaff}
                aiGradingStats={
                  aiGradingEnabled && assessment_question.ai_grading_mode
                    ? await calculateAiGradingStats(assessment_question)
                    : null
                }
                numOpenInstances={num_open_instances}
                isDevMode={process.env.NODE_ENV === 'development'}
                questionTitle={question.title ?? ''}
                questionNumber={Number(number_in_alternative_group)}
                availableAiGradingProviders={availableAiGradingProviders}
                aiRubricAgentEnabled={aiRubricAgentEnabled}
                chatCsrfToken={chatCsrfToken}
                initialChatMessages={initialChatMessages}
                initialWorkflowSync={initialWorkflowSync}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.get(
  '/next_ungraded',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    if (
      req.query.prior_instance_question_id != null &&
      typeof req.query.prior_instance_question_id !== 'string'
    ) {
      throw new error.HttpStatusError(400, 'prior_instance_question_id must be a single value');
    }

    req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;
    req.session.show_submissions_assigned_to_me_only =
      req.session.show_submissions_assigned_to_me_only ?? true;

    const use_instance_question_groups = await run(async () => {
      const aiGradingMode =
        (await features.enabledFromLocals('ai-grading', res.locals)) &&
        res.locals.assessment_question.ai_grading_mode;
      if (!aiGradingMode) {
        return false;
      }
      return await selectAssessmentQuestionHasInstanceQuestionGroups({
        assessmentQuestionId: res.locals.assessment_question.id,
      });
    });

    res.redirect(
      await manualGrading.nextInstanceQuestionUrl({
        urlPrefix: res.locals.urlPrefix,
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
        user_id: res.locals.authz_data.user.id,
        prior_instance_question_id: req.query.prior_instance_question_id ?? null,
        skip_graded_submissions: true,
        show_submissions_assigned_to_me_only: req.session.show_submissions_assigned_to_me_only,
        use_instance_question_groups,
      }),
    );
  }),
);

router.post(
  '/chat',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!(await features.enabledFromLocals('ai-rubric-grading-agent', res.locals))) {
      throw new error.HttpStatusError(403, 'AI rubric grading agent is not enabled');
    }
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const { assessment, assessment_question, question, urlPrefix, authz_data } = extractPageContext(
      res.locals,
      {
        pageType: 'assessmentQuestion',
        accessType: 'instructor',
      },
    );

    const phase = req.body.phase as 'generate' | 'edit' | undefined;
    if (!phase || !['generate', 'edit'].includes(phase)) {
      throw new error.HttpStatusError(400, 'Invalid or missing phase');
    }

    const userMessage =
      phase === 'generate'
        ? 'Generate a new rubric.'
        : typeof req.body.message === 'string'
          ? req.body.message.trim()
          : '';
    if (phase === 'edit' && userMessage.length === 0) {
      throw new error.HttpStatusError(400, 'No message provided');
    }

    // Get or create workflow
    let workflowRun = await getActiveWorkflowRun('ai_grading', {
      assessment_question_id: assessment_question.id,
    });

    let isNewWorkflow = false;
    if (!workflowRun) {
      workflowRun = await startWorkflow('ai_grading', {
        context: {
          assessment_question_id: assessment_question.id,
          assessment_id: assessment.id,
          course_id: res.locals.course.id,
          course_instance_id: res.locals.course_instance.id,
          question_id: question.id,
          url_prefix: urlPrefix,
          authn_user_id: res.locals.authn_user.id,
          user_id: res.locals.user.id,
          has_course_instance_permission_edit:
            authz_data.has_course_instance_permission_edit ?? false,
        },
        initialState: { step: 'awaiting_input' },
        phase: 'rubric_setup',
      });
      isNewWorkflow = true;

      // startWorkflow returns with status 'running'. The first takeStep
      // transitions it to 'waiting_for_input' asynchronously (a single DB
      // round-trip). Wait for that before calling continueWorkflow.
      const deadline = Date.now() + 5000;
      let ready = false;
      while (Date.now() < deadline) {
        const freshRun = await getWorkflowRun(workflowRun.id);
        if (freshRun.status === 'waiting_for_input') {
          workflowRun = freshRun;
          ready = true;
          break;
        }
        if (freshRun.status !== 'running') {
          throw new Error(
            `Workflow ${workflowRun.id} entered unexpected status: ${freshRun.status}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!ready) {
        throw new Error(
          `Workflow ${workflowRun.id} did not reach 'waiting_for_input' within timeout`,
        );
      }
    }

    // The rubric assistant is designed for single-user use. We use the workflow's
    // atomic state transition as a concurrency lock: continueWorkflow fails if the
    // workflow isn't in 'waiting_for_input' (i.e., another user already started the
    // agent). We also check a version counter so that stale clients (whose page
    // loaded before another user made changes) are rejected before inserting messages.
    // The second user's chat may be briefly inconsistent — this is acceptable since
    // multi-user simultaneous editing is not the current intended use case.
    if (!isNewWorkflow) {
      if (workflowRun.status !== 'waiting_for_input') {
        res.status(409).json({
          error: 'The rubric assistant is out of sync. Please reload to continue.',
        });
        return;
      }

      // Version/workflow-run consistency check: the client sends the workflow run ID
      // and version it knows about. If they don't match, the client is stale.
      const clientWorkflowRunId =
        typeof req.body.workflow_run_id === 'string' ? req.body.workflow_run_id : null;
      const clientVersion =
        typeof req.body.workflow_version === 'number' ? req.body.workflow_version : null;
      const serverVersion = (workflowRun.state as { version?: number }).version ?? 0;

      if (
        (clientWorkflowRunId !== null && clientWorkflowRunId !== workflowRun.id) ||
        (clientVersion !== null && clientVersion !== serverVersion)
      ) {
        res.status(409).json({
          error: 'The rubric assistant is out of sync. Please reload to continue.',
        });
        return;
      }
    }

    // Insert messages into DB to get message_id (needed as Redis stream key)
    const { messageRow, userMessageId } = await prepareAgentMessages({
      phase,
      userMessage,
      assessmentQuestionId: assessment_question.id,
      authnUserId: res.locals.authn_user.id,
      workflowRunId: workflowRun.id,
    });

    // Create SSE stream and register with Redis BEFORE continuing the workflow.
    // This avoids a race condition: continueWorkflow starts takeStep async,
    // so the stream must exist before we try to resume it.
    const sseStream = new JsonToSseTransformStream();
    registerSseStream(messageRow.id, sseStream);
    const streamContext = await getAiGradingStreamContext();
    await streamContext.createNewResumableStream(messageRow.id, () => sseStream.readable);

    const currentVersion = (workflowRun.state as { version?: number }).version ?? 0;
    const nextVersion = currentVersion + 1;

    try {
      await continueWorkflow(workflowRun.id, {
        step: 'agent_running',
        phase,
        user_message: userMessage,
        message_id: messageRow.id,
        version: nextVersion,
      });
    } catch (err) {
      // Clean up the pre-registered SSE stream so the Redis resumable stream
      // doesn't sit orphaned until TTL expiry.
      const orphanedStream = takeSseStream(messageRow.id);
      if (orphanedStream) {
        orphanedStream.writable.close().catch(() => {});
      }
      // Roll back the just-inserted user + assistant messages so they don't
      // pollute history when the workflow couldn't actually be continued.
      await deleteAiGradingMessagesByIds(assessment_question.id, [userMessageId, messageRow.id]);
      if (err instanceof WorkflowConflictError) {
        res.status(409).json({
          error: 'The rubric assistant is out of sync. Please reload to continue.',
        });
        return;
      }
      throw err;
    }

    // Resume the Redis stream (already registered above, so this won't be null)
    const stream = await streamContext.resumeExistingStream(messageRow.id);

    if (!stream) {
      res.status(204).send();
      return;
    }

    Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    Readable.fromWeb(stream as never).pipe(res);
  }),
);

router.get(
  '/chat/stream',
  typedAsyncHandler<'instructor-assessment-question'>(async (_req, res) => {
    if (!(await features.enabledFromLocals('ai-rubric-grading-agent', res.locals))) {
      throw new error.HttpStatusError(403, 'AI rubric grading agent is not enabled');
    }
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    const streamContext = await getAiGradingStreamContext();
    const startTime = Date.now();
    while (true) {
      const latestMessage = await selectLatestStreamingAiGradingMessage(assessment_question.id);

      if (!latestMessage) {
        res.status(204).send();
        return;
      }

      const stream = await streamContext.resumeExistingStream(latestMessage.id);
      if (stream === null) {
        res.status(204).send();
        return;
      }
      if (stream !== undefined) {
        Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        Readable.fromWeb(stream as never).pipe(res);
        return;
      }

      if (Date.now() - startTime >= CHAT_STREAM_RETRY_TIMEOUT_MS) {
        res.status(204).send();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, CHAT_STREAM_RETRY_INTERVAL_MS));
    }
  }),
);

router.get(
  '/chat/messages',
  typedAsyncHandler<'instructor-assessment-question'>(async (_req, res) => {
    if (!(await features.enabledFromLocals('ai-rubric-grading-agent', res.locals))) {
      throw new error.HttpStatusError(403, 'AI rubric grading agent is not enabled');
    }
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    const messages = z
      .array(StaffAiGradingMessageSchema)
      .parse(await selectAiGradingMessages(assessment_question.id));
    res.json({ messages });
  }),
);

router.post(
  '/chat/cancel',
  typedAsyncHandler<'instructor-assessment-question'>(async (_req, res) => {
    if (!(await features.enabledFromLocals('ai-rubric-grading-agent', res.locals))) {
      throw new error.HttpStatusError(403, 'AI rubric grading agent is not enabled');
    }
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    await cancelLatestStreamingAiGradingMessage(assessment_question.id);
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/chat/clear',
  typedAsyncHandler<'instructor-assessment-question'>(async (_req, res) => {
    if (!(await features.enabledFromLocals('ai-rubric-grading-agent', res.locals))) {
      throw new error.HttpStatusError(403, 'AI rubric grading agent is not enabled');
    }
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    const activeWorkflow = await getActiveWorkflowRun('ai_grading', {
      assessment_question_id: assessment_question.id,
    });
    if (activeWorkflow) {
      // If the workflow is actively running (agent is executing), reject the
      // clear. Cooperative cancellation means a running step could still mutate
      // rubric state after we delete messages, leaving an inconsistent state.
      if (activeWorkflow.status === 'running') {
        res.status(409).json({
          error:
            'Cannot reset while the rubric assistant is running. Please cancel or wait for it to finish first.',
        });
        return;
      }
      await cancelWorkflow(activeWorkflow.id);
    }

    await deleteAiGradingMessages(assessment_question.id);
    res.sendStatus(200);
  }),
);

router.get(
  '/chat/rubric_data',
  typedAsyncHandler<'instructor-assessment-question'>(async (_req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const rubric_data = await manualGrading.selectRubricData({
      assessment_question,
    });

    res.json({
      rubric_data,
      aiGradingStats:
        aiGradingEnabled && assessment_question.ai_grading_mode
          ? await calculateAiGradingStats(assessment_question)
          : null,
    });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    // TODO: parse req.body with Zod
    if (req.accepts('html') && req.body.__action !== 'modify_rubric_settings') {
      throw new error.HttpStatusError(406, 'Not Acceptable');
    }

    if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore({
        assessment: res.locals.assessment,
        instance_question_id: req.body.instance_question_id,
        submission_id: null,
        check_modified_at: req.body.modified_at ? new Date(req.body.modified_at) : null,
        score: {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
          score_perc: req.body.score_perc,
        },
        authn_user_id: res.locals.authn_user.id,
      });
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.sendStatus(204);
      }
    } else if (req.body.__action === 'modify_rubric_settings') {
      try {
        await manualGrading.updateAssessmentQuestionRubric({
          assessment: res.locals.assessment,
          assessment_question_id: res.locals.assessment_question.id,
          use_rubric: req.body.use_rubric,
          replace_auto_points: req.body.replace_auto_points,
          starting_points: req.body.starting_points,
          min_points: req.body.min_points,
          max_extra_points: req.body.max_extra_points,
          rubric_items: req.body.rubric_items,
          tag_for_manual_grading: req.body.tag_for_manual_grading,
          grader_guidelines: req.body.grader_guidelines,
          authn_user_id: res.locals.authn_user.id,
        });
        res.redirect(req.originalUrl);
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
