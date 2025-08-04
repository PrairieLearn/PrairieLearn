import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  calculateAiGradingStats,
  fillInstanceQuestionColumns,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { clearRubricOptionalFields, deleteAiGradingJobs, generateRubricTuningPrompt, selectInstanceQuestionsForAssessmentQuestion } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { config } from '../../../lib/config.js';
import type { AssessmentQuestion, InstanceQuestion } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestion as AssessmentQuestionPage } from './assessmentQuestion.html.js';
import { InstanceQuestionRowSchema } from './assessmentQuestion.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const courseStaff = await selectCourseInstanceGraderStaff({
      course_instance_id: res.locals.course_instance.id,
    });
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    res.send(
      AssessmentQuestionPage({
        resLocals: res.locals,
        courseStaff,
        aiGradingEnabled,
        aiGradingMode: aiGradingEnabled && res.locals.assessment_question.ai_grading_mode,
        aiGradingStats:
          aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
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
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question.id,
        res.locals.authz_data.user.user_id,
        req.query.prior_instance_question_id ?? null,
      ),
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
          course_instance_id: res.locals.course_instance.id,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'selected',
          instance_question_ids,
        });

        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        const action_data = JSON.parse(req.body.batch_action_data) || {};
        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        if (action_data?.assigned_grader != null) {
          const courseStaff = await selectCourseInstanceGraderStaff({
            course_instance_id: res.locals.course_instance.id,
          });
          if (!courseStaff.some((staff) => idsEqual(staff.user_id, action_data.assigned_grader))) {
            throw new error.HttpStatusError(
              400,
              'Assigned grader does not have Student Data Editor permission',
            );
          }
        }
        await queryAsync(sql.update_instance_questions, {
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
        res.locals.assessment.id,
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
      await queryAsync(sql.toggle_ai_grading_mode, {
        assessment_question_id: res.locals.assessment_question.id,
      });
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
        course_instance_id: res.locals.course_instance.id,
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
    } else if (req.body.__action === 'tune_rubric') {
      if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }
      // Select all submissions
      // Acquire the AI gradings for each
      const openai = new OpenAI({
        apiKey: config.aiGradingOpenAiApiKey,
        organization: config.aiGradingOpenAiOrganization,
      });

      const assessment_question = res.locals.assessment_question as AssessmentQuestion;

        const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion(
          assessment_question.id,
        );

        const instanceQuestionsById: Record<string, InstanceQuestion> = {};
        for (const instanceQuestion of instanceQuestions) {
          instanceQuestionsById[instanceQuestion.id] = instanceQuestion;
        }

        const instanceQuestionsTable = await fillInstanceQuestionColumns(
          instanceQuestions,
          assessment_question
        );

        const aiGradingsForEachPtLevel: Record<number, string[]> = {};

        for (let i = 0; i < instanceQuestionsTable.length; i++) {
          const instanceQuestionRow = instanceQuestionsTable[i];
          if (instanceQuestionRow.point_difference === null) {
            continue; // Skip if no AI grading
          }

          // Add the AI grading to the corresponding point level
          const aiPoints = instanceQuestionRow.ai_points ?? -1; // Default to -1 if null

          aiGradingsForEachPtLevel[aiPoints] = aiGradingsForEachPtLevel[aiPoints] || [];
          aiGradingsForEachPtLevel[aiPoints].push(instanceQuestions[i].id);
        }

        
        // Select a total of 5 AI gradings, distributed across the point levels
        const selectedInstanceQuestions: InstanceQuestion[] = [];
      
        const levels = Object.keys(aiGradingsForEachPtLevel)
        .map(Number)
        .filter(lvl => aiGradingsForEachPtLevel[lvl].length > 0);
        
        const numToSelect = Math.max(5, levels.length);


        let idx = 0;
        while (selectedInstanceQuestions.length < numToSelect) {
          // If all buckets are empty, stop early
          if (levels.every(lvl => aiGradingsForEachPtLevel[lvl].length === 0)) {
            break;
          }

          const level = levels[idx % levels.length];
          const bucket = aiGradingsForEachPtLevel[level];

          if (bucket.length > 0) {
            // Pull one at random from this bucket
            const randomIndex = Math.floor(Math.random() * bucket.length);
            const [pickedId] = bucket.splice(randomIndex, 1);
            console.log(`Picked ID: ${pickedId} from level ${level}`);
            selectedInstanceQuestions.push(instanceQuestionsById[pickedId]);
          }

          idx++;
        }

        const {messages: rubricTuningMessages, rubric_items} = await generateRubricTuningPrompt({
          urlPrefix: res.locals.urlPrefix,
          selectedInstanceQuestions,
          assessmentQuestion: res.locals.assessment_question,
          question: res.locals.question,
          course: res.locals.course,
          openai
        });

        const TunedRubricResponseSchema = z.object({
          rubric_items: z.array(
            z.object({
              id: z.string(),
              description: z.string(),
              explanation: z.string(),
              grader_note: z.string(),
            }),
          )
        });

        const completion = await openai.chat.completions.parse({
          messages: rubricTuningMessages,
          model: 'o4-mini',
          user: `course_${res.locals.course.id}`,
          response_format: zodResponseFormat(TunedRubricResponseSchema, 'formatted_rubric'),
        });
        const response = completion.choices[0].message;
        if (!response?.parsed?.rubric_items) {
          throw new error.HttpStatusError(500, 'AI did not return a formatted rubric');          
        }

        const generatedRubricItems = response.parsed.rubric_items;

        // testing value. TODO: Remove
        // const generatedRubricItems = [
        //   {
        //     id: '33',
        //     description: 'Correct',
        //     explanation: 'The response is entirely correct and demonstrates a clear understanding of the problem.',
        //     grader_note: 'Award full points for a completely correct response with no errors.'
        //   },
        //   {
        //     id: '34',
        //     description: 'Missing or incorrect final statement',
        //     explanation: 'The response does not include a final statement or the final statement is incorrect.',
        //     grader_note: 'Deduct points if the conclusion about continuity is missing or incorrect.'
        //   },
        //   {
        //     id: '35',
        //     description: 'Did not set up left-hand limit',
        //     explanation: 'The response does not include the setup for evaluating the left-hand limit.',
        //     grader_note: 'Deduct points if the left-hand limit is not addressed or set up.'
        //   },
        //   {
        //     id: '36',
        //     description: 'Did not set up right-hand limit',
        //     explanation: 'The response does not include the setup for evaluating the right-hand limit.',
        //     grader_note: 'Deduct points if the right-hand limit is not addressed or set up.'
        //   },
        //   {
        //     id: '37',
        //     description: 'Left-hand limit evaluated incorrectly',
        //     explanation: 'The left-hand limit is evaluated but contains errors.',
        //     grader_note: 'Deduct points if the left-hand limit is evaluated incorrectly.'
        //   },
        //   {
        //     id: '38',
        //     description: 'Right-hand limit evaluated incorrectly',
        //     explanation: 'The right-hand limit is evaluated but contains errors.',
        //     grader_note: 'Deduct points if the right-hand limit is evaluated incorrectly.'
        //   },
        //   {
        //     id: '39',
        //     description: 'Incorrectly evaluated the left- and right-hand limits as equivalent',
        //     explanation: 'The response incorrectly concludes that the left- and right-hand limits are equal.',
        //     grader_note: 'Deduct points if the response incorrectly equates the left- and right-hand limits.'
        //   },
        //   {
        //     id: '40',
        //     description: 'Incorrect limit notation',
        //     explanation: 'The response uses incorrect notation when discussing limits.',
        //     grader_note: 'Deduct points for incorrect or unclear limit notation.'
        //   },
        //   {
        //     id: '41',
        //     description: 'Missing or incorrect',
        //     explanation: 'The response is missing key components or is entirely incorrect.',
        //     grader_note: 'Deduct points for responses that lack the necessary components or are incorrect overall.'
        //   },
        //   {
        //     id: '42',
        //     description: 'Correct conclusion',
        //     explanation: 'The response includes a correct conclusion about the continuity of the function.',
        //     grader_note: 'Award points for a correct conclusion, even if minor errors are present elsewhere.'
        //   },
        //   {
        //     id: '43',
        //     description: 'Minor error',
        //     explanation: 'The response contains a minor error that does not significantly impact the overall correctness.',
        //     grader_note: 'Deduct a small number of points for minor errors.'
        //   },
        //   {
        //     id: '44',
        //     description: 'Work not shown computing limit',
        //     explanation: 'The response does not show the work for computing the limits.',
        //     grader_note: 'Deduct points if the work for computing limits is not shown.'
        //   }
        // ]

        // Ensure all AI-generated rubric items are in the original rubric items list

        const originalRubricItemIds = new Set(rubric_items.map((item) => item.id));


        for (const item of generatedRubricItems) {
          if (!originalRubricItemIds.has(item.id)) {
            throw new error.HttpStatusError(400, `Unknown AI-generated rubric item ID: ${item.id}`);
          }
        }

        for (const item of generatedRubricItems) {
          // Dummy message for testing
          // console.log(`Updating rubric item ${item.id} with description: ${item.description}, explanation: ${item.explanation}, grader_note: ${item.grader_note}`);
          const rubricItemId = await queryRow(sql.update_rubric_item, {
            id: item.id,
            rubric_id: res.locals.assessment_question.manual_rubric_id,
            description: item.description,
            explanation: item.explanation,
            grader_note: item.grader_note,
          }, z.string());
        }

        flash('success', 'Rubric tuning completed successfully. The rubric has been updated.');
        res.redirect(req.originalUrl);
    } else if (req.body.__action === 'clear_rubric') {    
      await clearRubricOptionalFields(
        res.locals.assessment_question.id,
        res.locals.assessment_question.manual_rubric_id
      );

      flash('success', 'Optional rubric fields cleared successfully.');
      res.redirect(req.originalUrl);
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
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
