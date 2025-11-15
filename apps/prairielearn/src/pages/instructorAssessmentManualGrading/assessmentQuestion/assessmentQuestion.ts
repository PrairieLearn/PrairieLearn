import * as async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  calculateAiGradingStats,
  fillInstanceQuestionColumns,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  deleteAiGradingJobs,
  selectInstanceQuestionsForAssessmentQuestion,
  toggleAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import {
  deleteAiInstanceQuestionGroups,
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { aiCorrectRotation } from '../../../ee/lib/ai-rotation-correction/ai-rotation-correction.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestion } from './assessmentQuestion.html.js';
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
    const courseStaff = await selectCourseInstanceGraderStaff({
      course_instance: res.locals.course_instance,
    });
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const rubric_data = await manualGrading.selectRubricData({
      assessment_question: res.locals.assessment_question,
    });

    const instanceQuestionGroups = await selectInstanceQuestionGroups({
      assessmentQuestionId: res.locals.assessment_question.id,
    });

    res.send(
      AssessmentQuestion({
        resLocals: res.locals,
        courseStaff,
        aiGradingEnabled,
        aiGradingMode: aiGradingEnabled && res.locals.assessment_question.ai_grading_mode,
        aiGradingStats:
          aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
        instanceQuestionGroups,
        rubric_data,
      }),
    );
  }),
);

router.get(
  '/instances.json',
  asyncHandler(async (req, res) => {
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
      instance_questions: await fillInstanceQuestionColumns(
        instance_questions,
        res.locals.assessment_question,
      ),
    });
  }),
);

router.get(
  '/next_ungraded',
  asyncHandler(async (req, res) => {
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
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    // TODO: parse req.body with Zod

    if (req.body.__action === 'batch_action') {
      if (req.body.batch_action === 'ai_grade_assessment_selected') {
        if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
          throw new error.HttpStatusError(403, 'Access denied (feature not available)');
        }

        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        const jobSequenceId = await aiGrade({
          question: res.locals.question,
          course: res.locals.course,
          course_instance: res.locals.course_instance,
          assessment: res.locals.assessment,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'selected',
          instance_question_ids,
        });

        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else if (req.body.batch_action === 'ai_instance_question_group_selected') {
        if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
          throw new error.HttpStatusError(403, 'Access denied (feature not available)');
        }

        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];

        const jobSequenceId = await aiInstanceQuestionGrouping({
          question: res.locals.question,
          course: res.locals.course,
          course_instance_id: res.locals.course_instance.id,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          instance_question_ids,
          closed_instance_questions_only: req.body.closed_instance_questions_only === 'true',
          ungrouped_instance_questions_only: false,
        });

        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        const action_data = req.body.batch_action_data
          ? JSON.parse(req.body.batch_action_data)
          : {};
        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        if (action_data?.assigned_grader != null) {
          const courseStaff = await selectCourseInstanceGraderStaff({
            course_instance: res.locals.course_instance,
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
        res.send({});
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
        res.send({});
      }
    } else if (req.body.__action === 'toggle_ai_grading_mode') {
      await toggleAiGradingMode(res.locals.assessment_question.id);
      res.redirect(req.originalUrl);
    } else if (
      ['ai_grade_assessment', 'ai_grade_assessment_graded', 'ai_grade_assessment_all'].includes(
        req.body.__action,
      )
    ) {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const jobSequenceId = await aiGrade({
        question: res.locals.question,
        course: res.locals.course,
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        mode: run(() => {
          if (req.body.__action === 'ai_grade_assessment_graded') return 'human_graded';
          if (req.body.__action === 'ai_grade_assessment_all') return 'all';
          throw new Error(`Unknown action: ${req.body.__action}`);
        }),
      });

      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'generate_rotation_estimates') {
      const allInstanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
        assessment_question_id: res.locals.assessment_question.id
      });

      const correctedRotations = await async.mapLimit(
        allInstanceQuestions,
        20,
        async (instanceQuestion) => {
          const {finalImageBase64, finalOrientation, rotationHistory} = await aiCorrectRotation({
            course: res.locals.course,
            course_instance_id: res.locals.course_instance.id,
            question: res.locals.question,
            assessment_question: res.locals.assessment_question,
            instance_question: instanceQuestion,
            urlPrefix: res.locals.urlPrefix,
          });

          const instanceQuestionUserEmail = await queryRow(
            sql.select_instance_question_user_email,
            {
              instance_question_id: instanceQuestion.id,
            },
            z.string()
          );

          return {
            instance_question_id: instanceQuestion.id,
            email: instanceQuestionUserEmail,
            finalImageBase64,
            finalOrientation,
            rotationHistory 
          };
        }
      );


      // Export the results as JSON
      res.setHeader('Content-Disposition', 'attachment; filename="rotation_estimates.json"');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(correctedRotations, null, 2));
    } else if (req.body.__action === 'ai_instance_question_group_assessment_all') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const jobSequenceId = await aiInstanceQuestionGrouping({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        closed_instance_questions_only: req.body.closed_instance_questions_only === 'true',
        ungrouped_instance_questions_only: false,
      });

      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'ai_instance_question_group_assessment_ungrouped') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const jobSequenceId = await aiInstanceQuestionGrouping({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        closed_instance_questions_only: req.body.closed_instance_questions_only === 'true',
        ungrouped_instance_questions_only: true,
      });

      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'delete_ai_grading_jobs') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const iqs = await deleteAiGradingJobs({
        assessment_question_ids: [res.locals.assessment_question.id],
        authn_user_id: res.locals.authn_user.user_id,
      });

      flash(
        'success',
        `Deleted AI grading results for ${iqs.length} ${iqs.length === 1 ? 'question' : 'questions'}.`,
      );

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_ai_instance_question_groupings') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const numDeleted = await deleteAiInstanceQuestionGroups({
        assessment_question_id: res.locals.assessment_question.id,
      });

      flash('success', `Deleted AI submission grouping results for ${numDeleted} questions.`);

      res.redirect(req.originalUrl);
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
