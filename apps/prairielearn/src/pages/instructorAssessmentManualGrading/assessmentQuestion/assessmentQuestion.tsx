import { Router } from 'express';
import z from 'zod';

import * as error from '@prairielearn/error';
import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';
import { generateSignedToken } from '@prairielearn/signed-token';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import {
  AI_GRADING_MODEL_IDS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import {
  calculateAiGradingStats,
  fillInstanceQuestionColumnEntries,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  deleteAiGradingJobs,
  setAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import {
  deleteAiInstanceQuestionGroups,
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import {
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getUrl } from '../../../lib/url.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestionManualGrading } from './AssessmentQuestionManualGrading.html.js';
import { InstanceQuestionRowSchema } from './assessmentQuestion.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

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

    const unfilledInstanceQuestionInfo = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );

    const instanceQuestionsInfo = await fillInstanceQuestionColumnEntries(
      unfilledInstanceQuestionInfo,
      res.locals.assessment_question,
    );

    const ongoingJobSequenceTokens = await run(async () => {
      if (!aiGradingEnabled) {
        return null;
      }

      const ongoingJobSequenceIds = await queryRows(
        sql.select_ai_grading_job_sequence_ids_for_assessment_question,
        {
          assessment_question_id: res.locals.assessment_question.id,
        },
        z.string(),
      );

      const jobSequenceTokens = ongoingJobSequenceIds.reduce(
        (acc, jobSequenceId) => {
          acc[jobSequenceId] = generateSignedToken({ jobSequenceId }, config.secretKey);
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
                assessment={assessment}
                assessmentQuestion={assessment_question}
                questionQid={question.qid!}
                aiGradingEnabled={aiGradingEnabled}
                aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                initialAiGradingMode={aiGradingEnabled && assessment_question.ai_grading_mode}
                rubricData={rubric_data}
                instanceQuestionGroups={instanceQuestionGroups}
                courseStaff={courseStaff}
                aiGradingStats={
                  aiGradingEnabled && assessment_question.ai_grading_mode
                    ? await calculateAiGradingStats(assessment_question)
                    : null
                }
                ongoingJobSequenceTokens={ongoingJobSequenceTokens}
                numOpenInstances={num_open_instances}
                isDevMode={process.env.NODE_ENV === 'development'}
                questionTitle={question.title ?? ''}
                questionNumber={Number(number_in_alternative_group)}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.get(
  '/instances.json',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (req.accepts('html')) {
      throw new error.HttpStatusError(406, 'Not Acceptable');
    }

    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const instance_questions = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );

    res.send({
      instance_questions: await fillInstanceQuestionColumnEntries(
        instance_questions,
        res.locals.assessment_question,
      ),
    });
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
        user_id: res.locals.authz_data.user.user_id,
        prior_instance_question_id: req.query.prior_instance_question_id ?? null,
        skip_graded_submissions: true,
        use_instance_question_groups,
      }),
    );
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

    if (req.body.__action === 'set_ai_grading_mode') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      if (typeof req.body.value !== 'boolean') {
        throw new error.HttpStatusError(400, 'value must be a boolean');
      }

      await setAiGradingMode(res.locals.assessment_question.id, req.body.value);
      res.sendStatus(204);
    } else if (req.body.__action === 'batch_action') {
      if (req.body.batch_action === 'ai_grade_assessment_selected') {
        if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
          throw new error.HttpStatusError(403, 'Access denied (feature not available)');
        }

        const model_id = req.body.model_id as AiGradingModelId | undefined;
        if (!model_id) {
          throw new error.HttpStatusError(400, 'No AI grading model specified');
        }

        const aiGradingModelSelectionEnabled = await features.enabledFromLocals(
          'ai-grading-model-selection',
          res.locals,
        );

        if (!aiGradingModelSelectionEnabled && model_id !== DEFAULT_AI_GRADING_MODEL) {
          throw new error.HttpStatusError(
            403,
            `AI grading model selection not available. Must use default model: ${DEFAULT_AI_GRADING_MODEL}`,
          );
        }

        if (!AI_GRADING_MODEL_IDS.includes(model_id)) {
          throw new error.HttpStatusError(400, 'Invalid AI grading model specified');
        }

        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];

        const job_sequence_id = await aiGrade({
          question: res.locals.question,
          course: res.locals.course,
          course_instance: res.locals.course_instance,
          assessment: res.locals.assessment,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          model_id,
          mode: 'selected',
          instance_question_ids,
        });

        res.send({ job_sequence_id });
        return;
      } else if (req.body.batch_action === 'ai_instance_question_group_selected') {
        if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
          throw new error.HttpStatusError(403, 'Access denied (feature not available)');
        }

        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];

        if (typeof req.body.closed_instance_questions_only !== 'boolean') {
          throw new error.HttpStatusError(400, 'closed_instance_questions_only must be a boolean');
        }

        const job_sequence_id = await aiInstanceQuestionGrouping({
          question: res.locals.question,
          course: res.locals.course,
          course_instance_id: res.locals.course_instance.id,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          instance_question_ids,
          closed_instance_questions_only: req.body.closed_instance_questions_only,
          ungrouped_instance_questions_only: false,
        });

        res.send({ job_sequence_id });
        return;
      } else {
        const action_data = req.body.batch_action_data ?? {};
        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        if (action_data?.assigned_grader != null) {
          const courseStaff = await selectCourseInstanceGraderStaff({
            courseInstance: res.locals.course_instance,
            authzData: res.locals.authz_data,
            requiredRole: ['Student Data Editor'],
          });
          if (!courseStaff.some((staff) => idsEqual(staff.user_id, action_data.assigned_grader))) {
            throw new error.HttpStatusError(
              400,
              'Assigned grader does not have Student Data Editor permission',
            );
          }
        }
        await execute(sql.update_instance_questions, {
          assessment_question_id: res.locals.assessment_question.id,
          instance_question_ids,
          update_requires_manual_grading: 'requires_manual_grading' in action_data,
          requires_manual_grading: !!action_data?.requires_manual_grading,
          update_assigned_grader: 'assigned_grader' in action_data,
          assigned_grader: action_data?.assigned_grader,
        });
        res.sendStatus(204);
      }
    } else if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at ? new Date(req.body.modified_at) : null, // check_modified_at
        {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
          score_perc: req.body.score_perc,
        },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.sendStatus(204);
      }
    } else if (
      ['ai_grade_assessment', 'ai_grade_assessment_graded', 'ai_grade_assessment_all'].includes(
        req.body.__action,
      )
    ) {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const model_id = req.body.model_id as AiGradingModelId | undefined;
      if (!model_id) {
        throw new error.HttpStatusError(400, 'No AI grading model specified');
      }

      const aiGradingModelSelectionEnabled = await features.enabledFromLocals(
        'ai-grading-model-selection',
        res.locals,
      );

      if (!aiGradingModelSelectionEnabled && model_id !== DEFAULT_AI_GRADING_MODEL) {
        throw new error.HttpStatusError(
          403,
          `AI grading model selection not available. Must use default model: ${DEFAULT_AI_GRADING_MODEL}`,
        );
      }

      if (!AI_GRADING_MODEL_IDS.includes(model_id)) {
        throw new error.HttpStatusError(400, 'Invalid AI grading model specified');
      }

      const job_sequence_id = await aiGrade({
        question: res.locals.question,
        course: res.locals.course,
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        model_id,
        mode: run(() => {
          if (req.body.__action === 'ai_grade_assessment_graded') return 'human_graded';
          if (req.body.__action === 'ai_grade_assessment_all') return 'all';
          throw new Error(`Unknown action: ${req.body.__action}`);
        }),
      });

      res.json({ job_sequence_id });
    } else if (req.body.__action === 'ai_instance_question_group_assessment_all') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const job_sequence_id = await aiInstanceQuestionGrouping({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        closed_instance_questions_only: req.body.closed_instance_questions_only,
        ungrouped_instance_questions_only: false,
      });

      res.json({ job_sequence_id });
      return;
    } else if (req.body.__action === 'ai_instance_question_group_assessment_ungrouped') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const job_sequence_id = await aiInstanceQuestionGrouping({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        closed_instance_questions_only: req.body.closed_instance_questions_only,
        ungrouped_instance_questions_only: true,
      });

      res.json({ job_sequence_id });
    } else if (req.body.__action === 'delete_ai_grading_jobs') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const iqs = await deleteAiGradingJobs({
        assessment_question_ids: [res.locals.assessment_question.id],
        authn_user_id: res.locals.authn_user.user_id,
      });

      res.json({ num_deleted: iqs.length });
    } else if (req.body.__action === 'delete_ai_instance_question_groupings') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const num_deleted = await deleteAiInstanceQuestionGroups({
        assessment_question_id: res.locals.assessment_question.id,
      });

      res.json({ num_deleted });
      return;
    } else if (req.body.__action === 'modify_rubric_settings') {
      try {
        await manualGrading.updateAssessmentQuestionRubric(
          res.locals.assessment,
          res.locals.assessment_question.id,
          req.body.use_rubric,
          req.body.replace_auto_points,
          req.body.starting_points,
          req.body.min_points,
          req.body.max_extra_points,
          req.body.rubric_items,
          req.body.tag_for_manual_grading,
          req.body.grader_guidelines,
          res.locals.authn_user.user_id,
        );
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
