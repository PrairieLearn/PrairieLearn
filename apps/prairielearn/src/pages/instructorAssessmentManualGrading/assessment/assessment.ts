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

import { compareAiErrorRecognitionAndHumanGrading, generateErrorEmbedding, selectInstanceQuestionsForAssessmentQuestion, selectLastVariantAndSubmission, selectRubricGradingItems } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { config } from '../../../lib/config.js';
import { type Assessment, type AssessmentQuestion, type RubricItem } from '../../../lib/db-types.js';
import { selectAssessmentQuestions } from '../../../models/assessment-question.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectQuestionById } from '../../../models/question.js';

import { ManualGradingAssessment, ManualGradingQuestionSchema } from './assessment.html.js';


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
    } else if (req.body.__action === 'generate_embeddings') {
      interface AssessmentQuestionEmbedding {
        instance_question_id: string;
        assessment_question_id: string;
        link_to_instance_question: string;
        error_description: string;
        embedding: number[];
        question_content: string;
        images: string[];
        prompt: any; // Adjust type as needed
        rubric_items: RubricItem[];
        errorRecognitionComparison: {
          consistent: boolean;
          explanation: string;
        }
      }

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
      const assessment_questions = (await selectAssessmentQuestions(
        assessment.id,
      )) as AssessmentQuestion[];

      if (!assessment_questions) {
        return;
      }
      const START_INDEX = 0; 

      const assessmentEmbeddingData = {};

      const MAX_ASSESSMENT_QUESTIONS_TO_PROCESS = 40;
      const MAX_INSTANCE_QUESTIONS_TO_PROCESS = 50;
      const PARALLEL_LIMIT = 20;

      // For testing only - to work with the JSON directly and more easily.
      const INCLUDE_LONG_DATA = true;

      for (let i = START_INDEX; i < Math.min(START_INDEX + MAX_ASSESSMENT_QUESTIONS_TO_PROCESS, assessment_questions.length); i++) {
        const assessment_question = assessment_questions[i];
        const all_instance_questions = (await selectInstanceQuestionsForAssessmentQuestion(
          assessment_question.id,
        )).slice(0, MAX_INSTANCE_QUESTIONS_TO_PROCESS);

        const question = await selectQuestionById(assessment_question.question_id);
        if (!question) {
          continue;
        }

        let j = 0;

        const aqEmbeddingData: AssessmentQuestionEmbedding[] = await async.mapLimit(all_instance_questions, PARALLEL_LIMIT, async (instance_question) => {
          console.log(`Processing instance question ${j} of ${all_instance_questions.length} for assessment question ${assessment_question.id}`);
          const {submission} = await selectLastVariantAndSubmission(instance_question.id);
          const rubric_items = await selectRubricGradingItems(submission.manual_rubric_grading_id);

          const {
            embedding,
            completionContent,
            questionPrompt,
            promptImageUrls,
            messages
          } = await generateErrorEmbedding({
            course: res.locals.course,
            question,
            instance_question,
            urlPrefix: res.locals.urlPrefix,
            openai
          })

          const errorRecognitionComparison = await compareAiErrorRecognitionAndHumanGrading({
            course: res.locals.course,
            humanSelectedRubricItems: rubric_items,
            aiRecognizedErrors: completionContent,
            openai
          })

          const embeddingData: AssessmentQuestionEmbedding = {
            instance_question_id: instance_question.id,
            assessment_question_id: assessment_question.id,
            link_to_instance_question: `${config.serverCanonicalHost}/pl/course_instance/${res.locals.course_instance.id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instance_question.id}`,
            error_description: completionContent || '',
            embedding: INCLUDE_LONG_DATA ? embedding : [],
            question_content: INCLUDE_LONG_DATA ? questionPrompt : '',
            images: INCLUDE_LONG_DATA ? promptImageUrls : [],
            prompt: INCLUDE_LONG_DATA ? messages : [],
            rubric_items,
            errorRecognitionComparison
          }

          j++;
          return embeddingData;
        });

        assessmentEmbeddingData[assessment_question.id] = aqEmbeddingData;
      }

      // Download the embeddings as a JSON file
      const jsonContent = JSON.stringify(assessmentEmbeddingData, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="assessment_embeddings_${assessment.id}.json"`,
      );
      return res.send(jsonContent);

      // return res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
