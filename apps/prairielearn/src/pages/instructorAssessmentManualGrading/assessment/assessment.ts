import async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { assignAiCluster, generateSubmissionDebuggingData, getAiClusterAssignment, getAiClusters, insertAiClusters } from '../../../ee/lib/ai-clustering/ai-clustering-util.js';
import type { SubmissionDebugData } from '../../../ee/lib/ai-clustering/types.js';
import { aiEvaluateFinalAnswer, selectInstanceQuestionsForAssessmentQuestion } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { config } from '../../../lib/config.js';
import { type Assessment, type AssessmentQuestion, type Course, type RubricItem } from '../../../lib/db-types.js';
import { selectAssessmentQuestions } from '../../../models/assessment-question.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectQuestionById } from '../../../models/question.js';

import { ManualGradingAssessment, ManualGradingQuestionSchema } from './assessment.html.js';

const START_INDEX = 0; 
const MAX_ASSESSMENT_QUESTIONS_TO_PROCESS = 3;
const MAX_INSTANCE_QUESTIONS_TO_PROCESS = 60;
const PARALLEL_LIMIT = 20;
const INSTANCE_QUESTIONS_TO_TEST: string[] = [];//['7677', '8456', '8038', '8518'];

// TODO: Move these answers
const answers = {
  1.1: '-10-2sqrt(3)',
  1.2: '5/sqrt(26) or 5sqrt(26)/26',
  2: `
    Limit as x approaches 0^{-} is 24
    Limit as x approaches 0^{+} is 2
    Thus, the function is not continuous at x = 0.
  `,
  3.1: '3/4',
  3.2: '-infinity',
  4.1: `
    e^{\theta}\tan\theta + e^{\theta}\sec^2\theta - 1.
  `,
  4.2: `
    2\ln\lvert x\rvert - \frac{3^{x}}{\ln 3} + \frac{4}{5}x^{\frac{5}{4}} + C
  `,
  4.3: '(9pi/2)-1',
  4.4: '5cos(sin(5x+1))',
  5.0: '2x-2',
  6.0: '1/32',
  7.0: '2',
  8.0: '10,000',
  9.0: `
    \frac{1}{2}\ln(10)-\frac{1}{2}\ln(5)
  `,
  10.0: `
    \sum_{i=1}^{12}\Bigl(\tfrac{2i}{3} + \tfrac{i^2}{9}\Bigr)^{\frac{1}{3}}
  `,
  11.0: '36u^2',
  12.0: '\int_{0}^{1}\bigl(\pi(2 - x^3)^2 - \pi(2 - x^2)^2\bigr)\,dx',
  20.0: '-(\sqrt[3]{x})^2 \,\sin\bigl(\sqrt[3]{x}\bigr)\;\cdot\;\frac{1}{3x^{2/3}}',
  21.0: '-78 miles/hour'
}

const aqNumberToOriginalNumber: Record<number, number> = {
  0: 1.1,
  1: 1.2,
  2: 2,
  3: 3.1,
  4: 3.2,
  5: 4.1,
  6: 4.2,
  7: 4.3,
  8: 4.4,
  9: 5.0,
  10: 6.0,
  11: 7.0,
  12: 8.0,
  13: 9.0,
  14: 10.0,
  15: 11.0,
  16: 12.0,
  17: 20.0,
  18: 21.0,
};

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const questions = await queryRows(
      sql.select_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.authz_data.user.user_id,
      },
      ManualGradingQuestionSchema,
    );
    const num_open_instances = questions[0]?.num_open_instances || 0;
    const courseStaff = await selectCourseInstanceGraderStaff({
      course_instance_id: res.locals.course_instance.id,
    });
    res.send(
      ManualGradingAssessment({
        resLocals: res.locals,
        questions,
        courseStaff,
        num_open_instances,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    if (req.body.__action === 'assign_graders') {
      if (!req.body.assigned_grader) {
        flash('error', 'No graders were selected for assignment.');
        res.redirect(req.originalUrl);
        return;
      }
      const assignedGraderIds: string[] = Array.isArray(req.body.assigned_grader)
        ? req.body.assigned_grader
        : [req.body.assigned_grader];
      const allowedGraderIds = (
        await selectCourseInstanceGraderStaff({
          course_instance_id: res.locals.course_instance.id,
        })
      ).map((user) => user.user_id);
      if (assignedGraderIds.some((graderId) => !allowedGraderIds.includes(graderId))) {
        flash(
          'error',
          'Selected graders do not have student data editor access to this course instance.',
        );
        res.redirect(req.originalUrl);
        return;
      }
      await runInTransactionAsync(async () => {
        const numInstancesToGrade = await queryOptionalRow(
          sql.count_instance_questions_to_grade,
          {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
          },
          z.number(),
        );
        if (!numInstancesToGrade) {
          flash('warning', 'No instances to assign.');
          return;
        }
        // We use ceil to ensure that all instances are graded, even if the
        // division is not exact. The last grader may not be assigned the same
        // number of instances as the others, and that is expected.
        const numInstancesPerGrader = Math.ceil(numInstancesToGrade / assignedGraderIds.length);
        for (const graderId of assignedGraderIds) {
          await queryAsync(sql.update_instance_question_graders, {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
            assigned_grader: graderId,
            limit: numInstancesPerGrader,
          });
        }
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'ai_grade_assessment_all') {
      const assessment = res.locals.assessment as Assessment;
      const assessment_questions = (await selectAssessmentQuestions(
        assessment.id,
      )) as AssessmentQuestion[];

      if (!assessment_questions) {
        return;
      }
      const START_INDEX = 1; 
      for (let i = START_INDEX; i < assessment_questions.length; i++) {
        const assessment_question = assessment_questions[i];
        const question = await selectQuestionById(assessment_question.question_id);

        await aiGrade({
          question,
          course: res.locals.course,
          course_instance_id: assessment.course_instance_id,
          assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'all'
        });
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_clusters') {
      if (!config.aiGradingOpenAiApiKey) {
        throw new HttpStatusError(
          400,
          'AI cluster generation is not available.',
        );
      }

      const openai = new OpenAI({
        apiKey: config.aiGradingOpenAiApiKey,
        organization: config.aiGradingOpenAiOrganization,
      });
    
      const assessment = res.locals.assessment as Assessment;
      const assessment_question_rows = (await selectAssessmentQuestions(
        { assessment_id: assessment.id }
      ));

      if (!assessment_question_rows) {
        return;
      }

      for (let i = START_INDEX; i < Math.min(START_INDEX + MAX_ASSESSMENT_QUESTIONS_TO_PROCESS, assessment_question_rows.length); i++) {
        const assessment_question_row = assessment_question_rows[i];
        const assessment_question = assessment_question_row.assessment_question;
        let all_instance_questions = (await selectInstanceQuestionsForAssessmentQuestion(
          assessment_question.id,
        )).slice(0, MAX_INSTANCE_QUESTIONS_TO_PROCESS);

        await insertAiClusters({
          assessment_question_id: assessment_question.id,
        });

        const clusters = await getAiClusters({
          assessmentQuestionId: assessment_question.id
        });

        const correctCluster = clusters.find((c) => c.cluster_name === 'Correct');
        const incorrectCluster = clusters.find((c) => c.cluster_name === 'Incorrect');
        if (!correctCluster) {
          // Handle missing correct cluster
          throw new Error(`Missing correct cluster for assessment question ${assessment_question.id}`);
        }

        if (!incorrectCluster) {
          // Handle missing incorrect cluster
          throw new Error(`Missing incorrect cluster for assessment question ${assessment_question.id}`);
        }

        all_instance_questions = all_instance_questions.filter((instance_question) =>
          INSTANCE_QUESTIONS_TO_TEST.length === 0 || INSTANCE_QUESTIONS_TO_TEST.includes(instance_question.id)
        );

        const question = assessment_question_row.question;
        const course = await selectCourseById(question.course_id);
        const j = 0;

        await async.eachLimit(all_instance_questions, PARALLEL_LIMIT, async (instance_question) => {
          console.log(`Processing instance question ${j} of ${all_instance_questions.length} for assessment question ${assessment_question.id}`);
          // TODO: Remove the unneeded fields (e.g. promptImageUrls)
          const isCorrect = await aiEvaluateFinalAnswer({
            question,
            question_answer: answers[aqNumberToOriginalNumber[i]],
            instance_question,
            course,
            urlPrefix: res.locals.urlPrefix,
            openai
          });

          await assignAiCluster({
            instanceQuestionId: instance_question.id,
            aiClusterId: isCorrect ? correctCluster.id : incorrectCluster.id
          });

          j++;
        });
      }

      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'export_clusters') {
      // For debugging purposes only: also export the images and the prompts used.
      const course = res.locals.course as Course;
      const assessment = res.locals.assessment as Assessment;
      const assessment_question_rows = (await selectAssessmentQuestions(
        { assessment_id: assessment.id }
      ));

      if (!assessment_question_rows) {
        return;
      }

      const exportData: SubmissionDebugData[] = [];
      for (let i = START_INDEX; i < Math.min(START_INDEX + MAX_ASSESSMENT_QUESTIONS_TO_PROCESS, assessment_question_rows.length); i++) {
        const assessment_question_row = assessment_question_rows[i];
        const assessment_question = assessment_question_row.assessment_question;
        const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion(
          assessment_question.id,
        );

        const clusterAssignments = await getAiClusterAssignment({
          assessment_question_id: assessment_question.id
        });

        const newDebugData = await async.mapLimit(all_instance_questions, PARALLEL_LIMIT, async (instanceQuestion) => {
          return await generateSubmissionDebuggingData({
            course,
            question: assessment_question_row.question,
            assessment,
            instanceQuestion,
            cluster: clusterAssignments[instanceQuestion.id],
            answer: answers[aqNumberToOriginalNumber[i]],
            urlPrefix: res.locals.urlPrefix
          });
        });

        exportData.push(...newDebugData);
      }
      
      // Export the data to JSON
      const jsonContent = JSON.stringify(exportData, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="assessment_submissions_${assessment.id}.json"`,
      );
      return res.send(jsonContent);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
