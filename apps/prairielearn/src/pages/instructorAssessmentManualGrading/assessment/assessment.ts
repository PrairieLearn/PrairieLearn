import { Router } from 'express';
import asyncHandler from 'express-async-handler';
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

import { generateAssessmentAiGradingStatsCSV } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { benchmarkRubricTuning, deleteAiGradingJobs } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { type Assessment, type Course, type CourseInstance } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { selectAssessmentQuestions } from '../../../models/assessment-question.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { ManualGradingAssessment, ManualGradingQuestionSchema } from './assessment.html.js';
import { config } from '../../../lib/config.js';
import OpenAI from 'openai';
import archiver from 'archiver';

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
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    res.send(
      ManualGradingAssessment({
        resLocals: res.locals,
        questions,
        courseStaff,
        num_open_instances,
        aiGradingEnabled,
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
    } else if (req.body.__action === 'ai_grade_all') {
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!aiGradingEnabled) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      const assessment = res.locals.assessment as Assessment;

      const assessmentQuestionRows = await selectAssessmentQuestions({
        assessment_id: assessment.id,
      });

      // AI grading runs only on manually graded questions.
      const manuallyGradedRows = assessmentQuestionRows.filter(
        (row) => row.assessment_question.max_manual_points,
      );

      if (manuallyGradedRows.length === 0) {
        flash('warning', 'No manually graded assessment questions found for AI grading.');
        res.redirect(req.originalUrl);
      }

      for (const row of manuallyGradedRows) {
        try {
          await aiGrade({
            question: row.question,
            course: res.locals.course,
            course_instance_id: assessment.course_instance_id,
            assessment_question: row.assessment_question,
            urlPrefix: res.locals.urlPrefix,
            authn_user_id: res.locals.authn_user.user_id,
            user_id: res.locals.user.user_id,
            mode: 'all',
          });
        } catch {
          flash(
            'error',
            `AI grading failed for assessment question ${row.assessment_question.id}.`,
          );
          res.redirect(req.originalUrl);
          return;
        }
      }
      flash('success', 'AI grading successfully initiated.');
      res.redirect(req.originalUrl);
    } else if( req.body.__action === 'tune_all_rubrics') {
      
      // TODO: This is redundant logic - move this to a common place.
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!aiGradingEnabled) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
        throw new HttpStatusError(403, 'Not implemented (feature not available)');
      }
      const openai = new OpenAI({
        apiKey: config.aiGradingOpenAiApiKey,
        organization: config.aiGradingOpenAiOrganization,
      });

      const assessment = res.locals.assessment as Assessment;

      const assessmentQuestionRows = await selectAssessmentQuestions({
        assessment_id: assessment.id,
      });

      // AI grading runs only on manually graded questions.
      const manuallyGradedRows = assessmentQuestionRows.filter(
        (row) => row.assessment_question.max_manual_points,
      );

      if (manuallyGradedRows.length === 0) {
        flash('warning', 'No manually graded assessment questions found for AI grading.');
        res.redirect(req.originalUrl);
      }
      let index = 0;
      let failedQuestions: {
        id: string;
        index: number;
      }[] = [];
      
      let allData: {
        index: number;
        file1_data: string;
        file2_data: string;
      }[] = [];
       
      for (const row of manuallyGradedRows.slice(0, 5)) {
        try {
          console.log(`Benchmarking rubric tuning for assessment question ${index + 1}`)
          const {
            file1_data,
            file2_data
          } = await benchmarkRubricTuning({
            assessment,
            assessment_question: row.assessment_question,
            course: res.locals.course as Course,
            course_instance: res.locals.course_instance as CourseInstance,
            question: row.question,
            urlPrefix: res.locals.urlPrefix,
            authn_user_id: res.locals.authn_user.user_id,
            openai
          });

          allData.push({
            index: index + 1,
            file1_data,
            file2_data
          });
        } catch (err) {
          console.error('Error tuning rubric:', err);
          failedQuestions.push({id: row.assessment_question.id, index });
        } finally {
          index++;
        }
      }

      // Export all the statistics files to a zip.
      console.log(`Failed to tune rubrics for questions: ${JSON.stringify(failedQuestions)}`);
      try {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="all_assessment_data.zip"'
        );

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        for (const {index, file1_data, file2_data} of allData) {
          archive.append(file1_data, { name: `aq_${index}_file1_data.csv` });
          archive.append(file2_data, { name: `aq_${index}_file2_data.csv` });
        }

        await archive.finalize();
      } catch {
        flash('error', 'Failed to create zip file for download.');
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'export_ai_grading_statistics') {
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!aiGradingEnabled) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="assessment_statistics.csv"');
      res.send(await generateAssessmentAiGradingStatsCSV(res.locals.assessment as Assessment));
    } else if (req.body.__action === 'delete_ai_grading_data') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      const assessment = res.locals.assessment as Assessment;
      const assessmentQuestionRows = await selectAssessmentQuestions({
        assessment_id: assessment.id,
      });

      await deleteAiGradingJobs({
        assessment_question_ids: assessmentQuestionRows.map((row) => row.assessment_question.id),
        authn_user_id: res.locals.authn_user.user_id,
      });

      flash('success', 'AI grading data deleted successfully.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
