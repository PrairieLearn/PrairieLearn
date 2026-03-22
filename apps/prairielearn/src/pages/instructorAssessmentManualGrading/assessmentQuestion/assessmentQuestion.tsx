import * as trpcExpress from '@trpc/server/adapters/express';
import { JsonToSseTransformStream, type ModelMessage } from 'ai';
import { Router } from 'express';
import z from 'zod';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { cancelWorkflow, getActiveWorkflowRun, startWorkflow } from '@prairielearn/workflows';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import {
  type createRubricAgent,
  editRubric,
  finalizeAssistantMessage,
  generateRubric,
} from '../../../ee/lib/ai-grading/ai-grading-agent.js';
import { getAvailableAiGradingProviders } from '../../../ee/lib/ai-grading/ai-grading-credentials.js';
import {
  calculateAiGradingStats,
  fillInstanceQuestionColumnEntries,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import {
  deleteAiGradingMessages,
  selectAiGradingMessages,
} from '../../../ee/models/ai-grading-message.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import {
  StaffAiGradingMessageSchema,
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { getAssessmentQuestionTrpcUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { generateJobSequenceToken } from '../../../lib/generateJobSequenceToken.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { type ServerJob, createServerJob, getJobSequenceIds } from '../../../lib/server-jobs.js';
import { handleTrpcError } from '../../../lib/trpc.js';
import { getUrl } from '../../../lib/url.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestionManualGrading } from './AssessmentQuestionManualGrading.html.js';
import { selectInstanceQuestionsForManualGrading } from './queries.js';

const router = Router();

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

    const initialOngoingJobSequenceTokens = await run(async () => {
      if (!aiGradingEnabled) {
        return null;
      }

      const ongoingJobSequenceIds = await getJobSequenceIds({
        assessment_question_id: res.locals.assessment_question.id,
        status: 'Running',
        type: 'ai_grading',
      });

      const jobSequenceTokens = ongoingJobSequenceIds.reduce(
        (acc, jobSequenceId) => {
          acc[jobSequenceId] = generateJobSequenceToken(jobSequenceId);
          return acc;
        },
        {} as Record<string, string>,
      );

      return jobSequenceTokens;
    });

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

    const chatCsrfToken = generatePrefixCsrfToken(
      {
        url: req.originalUrl.split('?')[0] + '/chat',
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    const availableAiGradingProviders = aiGradingEnabled
      ? await getAvailableAiGradingProviders(course_instance)
      : [];

    const initialChatMessages = aiGradingEnabled
      ? z
          .array(StaffAiGradingMessageSchema)
          .parse(await selectAiGradingMessages(assessment_question.id))
      : [];

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
                initialOngoingJobSequenceTokens={initialOngoingJobSequenceTokens}
                numOpenInstances={num_open_instances}
                isDevMode={process.env.NODE_ENV === 'development'}
                questionTitle={question.title ?? ''}
                questionNumber={Number(number_in_alternative_group)}
                availableAiGradingProviders={availableAiGradingProviders}
                chatCsrfToken={chatCsrfToken}
                initialChatMessages={initialChatMessages}
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
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
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

    const userMessage = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (phase === 'edit' && userMessage.length === 0) {
      throw new error.HttpStatusError(400, 'No message provided');
    }

    // Look up the active workflow run for this assessment question (if any).
    // The workflow is used for state tracking and message association.
    // It does NOT drive the AI calls — the route handler does that directly.
    const workflowRun = await getActiveWorkflowRun('ai_grading', {
      assessment_question_id: assessment_question.id,
    });

    const workflowRunId = workflowRun?.id ?? null;

    const serverJob = await createServerJob({
      courseId: res.locals.course.id,
      courseInstanceId: res.locals.course_instance.id,
      assessmentId: assessment.id,
      assessmentQuestionId: assessment_question.id,
      userId: res.locals.user.id,
      authnUserId: res.locals.authn_user.id,
      type: 'ai_grading',
      description: phase === 'generate' ? 'Generate rubric with AI' : 'Edit rubric with AI',
      reportErrorsToSentry: true,
    });

    const agentContext = {
      assessment,
      assessmentQuestion: assessment_question,
      course: res.locals.course,
      question,
      urlPrefix,
      authnUserId: res.locals.authn_user.id,
      hasCourseInstancePermissionEdit: authz_data.has_course_instance_permission_edit ?? false,
    };

    const sseStream = new JsonToSseTransformStream();

    const runAgent = async (
      agent: ReturnType<typeof createRubricAgent>,
      messageId: string,
      modelId: string,
      promptArg: { prompt: string } | { messages: ModelMessage[] },
      job: ServerJob,
    ) => {
      const agentRes = await agent.stream(promptArg);

      let finalParts: unknown[] = [];
      const errorState = { hasError: false };

      const uiStream = agentRes.toUIMessageStream({
        generateMessageId: () => messageId,
        messageMetadata: ({ part }) => {
          if (part.type === 'start') {
            return {
              job_sequence_id: serverJob.jobSequenceId,
              status: 'streaming',
              phase,
              workflow_run_id: workflowRunId,
            };
          }
          if (part.type === 'finish') {
            return {
              job_sequence_id: serverJob.jobSequenceId,
              status: errorState.hasError ? 'errored' : 'completed',
              phase,
              rubric_modified: true,
              workflow_run_id: workflowRunId,
            };
          }
        },
        onFinish: async ({ responseMessage }) => {
          finalParts = responseMessage.parts;
        },
        onError(err): string {
          errorState.hasError = true;
          if (err instanceof Error) {
            job.error(err.message);
          }
          return String(err);
        },
      });

      await uiStream.pipeTo(sseStream.writable);

      const totalUsage = await agentRes.totalUsage.then(
        (usage) => usage,
        () => ({ inputTokens: 0, outputTokens: 0 }),
      );

      job.info('Total usage: ' + JSON.stringify(totalUsage));

      const finalStatus = errorState.hasError ? 'errored' : 'completed';

      await finalizeAssistantMessage({
        messageId,
        status: finalStatus,
        parts: finalParts,
        modelId,
        usage: {
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
        },
      });
    };

    const promise = serverJob.execute(async (job) => {
      job.info(`AI grading chat request — phase: ${phase}, workflow: ${workflowRunId}`);

      if (phase === 'generate') {
        const { agent, messageRow, modelId } = await generateRubric(
          agentContext,
          job,
          serverJob.jobSequenceId,
          workflowRunId,
        );

        await runAgent(agent, messageRow.id, modelId, { prompt: 'Generate a new rubric.' }, job);

        // Create a workflow at rubric_ready if one doesn't exist yet.
        if (!workflowRunId) {
          await startWorkflow({
            type: 'ai_grading',
            context: { assessment_question_id: assessment_question.id },
            initialState: { step: 'rubric_ready', rubric_exists: true },
            initialPhase: 'rubric_setup',
          });
        }
      } else {
        const persistedMessages = await selectAiGradingMessages(assessment_question.id);
        job.info('Instruction: ' + userMessage);

        const { agent, messageRow, modelId, messages } = await editRubric(
          agentContext,
          userMessage,
          persistedMessages,
          job,
          serverJob.jobSequenceId,
          workflowRunId,
        );

        await runAgent(agent, messageRow.id, modelId, { messages }, job);
      }
    });

    // Don't await the promise — pipe the SSE stream to the response immediately.
    void promise;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = sseStream.readable.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    void pump();
  }),
);

router.post(
  '/chat/clear',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const { assessment_question } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });

    // Cancel active workflow if one exists
    const activeWorkflow = await getActiveWorkflowRun('ai_grading', {
      assessment_question_id: assessment_question.id,
    });
    if (activeWorkflow) {
      await cancelWorkflow(activeWorkflow.id);
    }

    await deleteAiGradingMessages(assessment_question.id);
    res.sendStatus(200);
  }),
);

router.get(
  '/chat/rubric_data',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
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

    const workflowRun = await getActiveWorkflowRun('ai_grading', {
      assessment_question_id: assessment_question.id,
    });

    res.json({
      rubric_data,
      workflow_status: workflowRun
        ? {
            id: workflowRun.id,
            status: workflowRun.status,
            phase: workflowRun.phase,
            state: workflowRun.state,
          }
        : null,
      aiGradingStats:
        aiGradingEnabled && assessment_question.ai_grading_mode
          ? await calculateAiGradingStats(assessment_question)
          : null,
    });
  }),
);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: manualGradingAssessmentQuestionRouter,
    createContext,
    onError: handleTrpcError,
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
