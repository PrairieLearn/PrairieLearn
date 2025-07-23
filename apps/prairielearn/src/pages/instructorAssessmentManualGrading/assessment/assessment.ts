import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  callAsync,
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { fillInstanceQuestionColumns } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { type Assessment, type AssessmentQuestion, AssessmentQuestionSchema, GradingJobSchema, IdSchema, InstanceQuestionSchema } from '../../../lib/db-types.js';
import * as ltiOutcomes from '../../../lib/ltiOutcomes.js';
import { selectAssessmentQuestions } from '../../../models/assessment-question.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectQuestionById } from '../../../models/question.js';
import { InstanceQuestionRowSchema } from '../assessmentQuestion/assessmentQuestion.types.js';

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
      console.log('AI grade all questions for assessment', assessment.id);
      if (!assessment_questions) {
        console.log(`No questions found for assessment ${assessment.id}`);
        return;
      }
      const START_INDEX = 1; 
      for (let i = START_INDEX; i < assessment_questions.length; i++) {
        const assessment_question = assessment_questions[i];
        const question = await selectQuestionById(assessment_question.question_id);

        console.log(
          `AI grading question ${assessment_question.question_id} (${i + 1}/${assessment_questions.length})`,
        );
        await aiGrade({
          question,
          course: res.locals.course,
          course_instance_id: assessment.course_instance_id,
          assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'all',
          image_rag_enabled: false,
          run_async: false,
          use_save_clusters: true
        });
        console.log(`Completed AI grading for question ${assessment_question.question_id}`);
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'export_statistics') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="assessment_statistics.csv"');
      res.send(await exportAssessmentStatistics(res.locals.assessment as Assessment));
    } else if (req.body.__action === 'delete_ai_grading_data') {
      const assessment = res.locals.assessment as Assessment;
      const assessment_questions = (await selectAssessmentQuestions(
        assessment.id,
      )) as AssessmentQuestion[];
      if (!assessment_questions) {
        console.log(`No questions found for assessment ${assessment.id}`);
        return;
      }

      for (const assessment_question of assessment_questions) {
        const iqs = await runInTransactionAsync(async () => {
          const iqs = await queryRows(
            sql.delete_ai_grading_jobs,
            {
              authn_user_id: res.locals.authn_user.user_id,
              assessment_question_id: assessment_question.id,
            },
            z.object({
              id: IdSchema,
              assessment_instance_id: IdSchema,
              max_points: AssessmentQuestionSchema.shape.max_points,
              max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
              max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
              points: InstanceQuestionSchema.shape.points,
              score_perc: InstanceQuestionSchema.shape.score_perc,
              auto_points: InstanceQuestionSchema.shape.auto_points,
              manual_points: InstanceQuestionSchema.shape.manual_points,
              most_recent_manual_grading_job: GradingJobSchema.nullable(),
            }),
          );
  
          for (const iq of iqs) {
            await callAsync('assessment_instances_grade', [
              iq.assessment_instance_id,
              // We use the user who is performing the deletion.
              res.locals.authn_user.user_id,
              100, // credit
              false, // only_log_if_score_updated
              true, // allow_decrease
            ]);
          }
  
          return iqs;
        });
        
        for (const iq of iqs) {
          await ltiOutcomes.updateScore(iq.assessment_instance_id);
        }
      }

      flash('success', 'AI grading data deleted successfully.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

async function exportAssessmentStatistics(assessment: Assessment): Promise<string> {
  // For each assessment question, compute the statistics present in the card below agreement/disagreement rate
  const assessment_questions = (await selectAssessmentQuestions(
    assessment.id,
  )) as AssessmentQuestion[];
  if (!assessment_questions) {
    console.log(`No questions found for assessment ${assessment.id}`);
    return '';
  }

  const totalConfusionMatrix = {
    truePositives: 0,
    trueNegatives: 0,
    falsePositives: 0,
    falseNegatives: 0,
  };

  const rows: Record<string, any>[] = [];

  console.log('assessment_questions', assessment_questions);

  for (let i = 0; i < assessment_questions.length; i++) {
    const assessment_question = assessment_questions[i];

    const instance_questions = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: assessment_question.assessment_id,
        assessment_question_id: assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );

    const instanceQuestionsTable = await fillInstanceQuestionColumns(
      instance_questions,
      assessment_question,
    );

    const confusionMatrix = {
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    };

    for (const row of instanceQuestionsTable) {
      if (row.ai_grading_status === 'LatestRubric') {
        if (row.rubric_similarity) {
          for (const item of row.rubric_similarity) {
            if (item.true_positive) {
              confusionMatrix.truePositives++;
            } else {
              confusionMatrix.trueNegatives++;
            }
          }
        }
        if (row.rubric_difference) {
          for (const difference of row.rubric_difference) {
            if (difference.false_positive) {
              confusionMatrix.falsePositives++;
            } else {
              confusionMatrix.falseNegatives++;
            }
          }
        }
      }
    }

    // Aggregate confusion matrix for the assessment
    totalConfusionMatrix.truePositives += confusionMatrix.truePositives;
    totalConfusionMatrix.trueNegatives += confusionMatrix.trueNegatives;
    totalConfusionMatrix.falsePositives += confusionMatrix.falsePositives;
    totalConfusionMatrix.falseNegatives += confusionMatrix.falseNegatives;

    const precision =
      confusionMatrix.truePositives /
      (confusionMatrix.truePositives + confusionMatrix.falsePositives);
    const recall =
      confusionMatrix.truePositives /
      (confusionMatrix.truePositives + confusionMatrix.falseNegatives);

    const precision_complement =
      confusionMatrix.trueNegatives /
      (confusionMatrix.trueNegatives + confusionMatrix.falsePositives);
    const recall_complement =
      confusionMatrix.trueNegatives /
      (confusionMatrix.trueNegatives + confusionMatrix.falseNegatives);

    const f1score = (2 * (precision * recall)) / (precision + recall);
    const f1score_complement =
      (2 * (precision_complement * recall_complement)) / (precision_complement + recall_complement);

    rows.push({
      assessment_question_id: assessment_question.id,
      number: i + 1,
      accuracy:
        (confusionMatrix.truePositives + confusionMatrix.trueNegatives) /
        (confusionMatrix.truePositives +
          confusionMatrix.trueNegatives +
          confusionMatrix.falsePositives +
          confusionMatrix.falseNegatives),
      truePositives: confusionMatrix.truePositives,
      trueNegatives: confusionMatrix.trueNegatives,
      falsePositives: confusionMatrix.falsePositives,
      falseNegatives: confusionMatrix.falseNegatives,
      precision: precision || 0,
      recall: recall || 0,
      f1score: f1score || 0,
      precision_complement: precision_complement || 0,
      recall_complement: recall_complement || 0,
      f1score_complement: f1score_complement || 0,
    });
  }

  // Add aggregate statistics
  const totalPrecision =
    totalConfusionMatrix.truePositives /
    (totalConfusionMatrix.truePositives + totalConfusionMatrix.falsePositives);
  const totalRecall =
    totalConfusionMatrix.truePositives /
    (totalConfusionMatrix.truePositives + totalConfusionMatrix.falseNegatives);
  const totalPrecisionComplement =
    totalConfusionMatrix.trueNegatives /
    (totalConfusionMatrix.trueNegatives + totalConfusionMatrix.falsePositives);

  const totalRecallComplement =
    totalConfusionMatrix.trueNegatives /
    (totalConfusionMatrix.trueNegatives + totalConfusionMatrix.falseNegatives);
  const totalF1Score = (2 * (totalPrecision * totalRecall)) / (totalPrecision + totalRecall);
  const totalF1ScoreComplement =
    (2 * (totalPrecisionComplement * totalRecallComplement)) /
    (totalPrecisionComplement + totalRecallComplement);

  rows.push({
    assessment_question_id: 'total',
    number: -1,
    accuracy:
      (totalConfusionMatrix.truePositives + totalConfusionMatrix.trueNegatives) /
      (totalConfusionMatrix.truePositives +
        totalConfusionMatrix.trueNegatives +
        totalConfusionMatrix.falsePositives +
        totalConfusionMatrix.falseNegatives),
    truePositives: totalConfusionMatrix.truePositives,
    trueNegatives: totalConfusionMatrix.trueNegatives,
    falsePositives: totalConfusionMatrix.falsePositives,
    falseNegatives: totalConfusionMatrix.falseNegatives,
    precision: totalPrecision || 0,
    recall: totalRecall || 0,
    f1score: totalF1Score || 0,
    precision_complement: totalPrecisionComplement || 0,
    recall_complement: totalRecallComplement || 0,
    f1score_complement: totalF1ScoreComplement || 0,
  });

  // Export the JSON as a CSV file
  return [
    'assessment_question_id,number,accuracy,truePositives,trueNegatives,falsePositives,falseNegatives,precision,recall,f1score,precision_complement,recall_complement,f1score_complement',
    ...rows.map(
      (row) =>
        `${row.assessment_question_id},${row.number},${row.accuracy},${row.truePositives},${row.trueNegatives},${row.falsePositives},${row.falseNegatives},${row.precision},${row.recall},${row.f1score},${row.precision_complement},${row.recall_complement},${row.f1score_complement}`,
    ),
  ].join('\n');
}

export default router;
