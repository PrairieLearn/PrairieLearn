import csvtojson from 'csvtojson';
import * as streamifier from 'streamifier';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { selectAssessmentInfoForJob } from '../models/assessment.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { deleteAllAssessmentInstancesForAssessment } from './assessment.js';
import { AssessmentQuestionSchema, IdSchema } from './db-types.js';
import { createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const ZodStringToNumber = z.preprocess((val) => {
  if (val === '' || val == null) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}, z.number().nullable());

const ZodStringToBoolean = z.preprocess((val) => {
  if (val === '' || val == null) return null;
  const lowerVal = String(val).toLowerCase();
  if (lowerVal === 'true' || lowerVal === '1') return true;
  if (lowerVal === 'false' || lowerVal === '0') return false;
  return null;
}, z.boolean().nullable());

const ZodStringToDate = z.preprocess((val) => {
  if (val === '' || val == null) return null;
  const date = new Date(String(val));
  return isNaN(date.getTime()) ? null : date;
}, z.date().nullable());

const ZodStringToJson = z.preprocess((val) => {
  if (val === '' || val == null) return null;
  try {
    const parsed = JSON.parse(String(val));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}, z.record(z.any()).nullable());

const SubmissionCsvRowSchema = z.object({
  UID: z.string(),
  UIN: z.string().optional().nullable(),
  Name: z.string().optional().nullable(),
  'Group name': z.string().optional().nullable(),
  'Assessment instance': ZodStringToNumber,
  Question: z.string(),
  'Question instance': ZodStringToNumber,
  Seed: z.string().optional().nullable(),
  Params: ZodStringToJson,
  'True answer': ZodStringToJson,
  Options: ZodStringToJson,
  'Submission date': ZodStringToDate,
  'Submitted answer': ZodStringToJson,
  'Partial Scores': ZodStringToJson,
  'Override score': ZodStringToNumber,
  Credit: ZodStringToNumber,
  Mode: z.string().optional().nullable(),
  'Grading requested date': ZodStringToDate,
  'Grading date': ZodStringToDate,
  Score: ZodStringToNumber,
  Correct: ZodStringToBoolean,
  Feedback: ZodStringToJson,
  'Max points': ZodStringToNumber,
  'Max auto points': ZodStringToNumber,
  'Max manual points': ZodStringToNumber,
  Assessment: z.string().optional().nullable(),
  'Zone number': z.string().optional().nullable(),
  'Zone title': z.string().optional().nullable(),
  Variant: z.string().optional().nullable(),
  'Assigned manual grader': z.string().optional().nullable(),
  'Last manual grader': z.string().optional().nullable(),
  'Rubric Grading': z.string().optional().nullable(),
  'Question points': z.string().optional().nullable(),
  'Question % score': z.string().optional().nullable(),
});

export async function uploadSubmissionsCsv(
  assessment_id: string,
  csvFile: Express.Multer.File | null | undefined,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const { assessment_label, course_instance_id, course_id } =
    await selectAssessmentInfoForJob(assessment_id);

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'upload_submissions_csv',
    description: 'Upload submissions CSV for ' + assessment_label,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Deleting all existing assessment instances');
    await deleteAllAssessmentInstancesForAssessment(assessment_id, authn_user_id);

    job.info('Uploading submissions CSV for ' + assessment_label);

    let output: string | null = null;
    let outputCount = 0;
    let outputThreshold = 100;

    let successCount = 0;
    let errorCount = 0;

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
    const csvStream = streamifier.createReadStream(csvFile.buffer, {
      encoding: 'utf8',
    });
    const csvConverter = csvtojson();

    try {
      await csvConverter.fromStream(csvStream).subscribe(async (rawJson, number) => {
        const lineNumber = number + 2;
        const msg = `Processing CSV line ${lineNumber}: ${JSON.stringify(rawJson)}`;
        if (output == null) {
          output = msg;
        } else {
          output += '\n' + msg;
        }

        try {
          const row = SubmissionCsvRowSchema.parse(rawJson);

          const user = await selectOrInsertUserByUid(row.UID);

          let assessment_instance_id: string;

          if (row['Group name']) {
            const group_id_for_instance = await sqldb.queryRow(
              sql.ensure_group,
              {
                group_name: row['Group name'],
                course_instance_id,
              },
              IdSchema,
            );

            assessment_instance_id = await sqldb.queryRow(
              sql.ensure_assessment_instance_group,
              {
                assessment_id,
                group_id: group_id_for_instance,
                instance_number: row['Assessment instance'] ?? 1,
              },
              IdSchema,
            );
          } else {
            assessment_instance_id = await sqldb.queryRow(
              sql.ensure_assessment_instance_user,
              {
                assessment_id,
                user_id: user.user_id,
                instance_number: row['Assessment instance'] ?? 1,
              },
              IdSchema,
            );
          }

          const question = await selectQuestionByQid({ course_id, qid: row.Question });
          const assessmentQuestion = await sqldb.queryRow(
            sql.select_assessment_question,
            { assessment_id, question_id: question.id },
            AssessmentQuestionSchema,
          );

          const instance_question_id = await sqldb.queryRow(
            sql.insert_instance_question,
            { assessment_instance_id, assessment_question_id: assessmentQuestion.id },
            IdSchema,
          );

          const variant_id = await sqldb.queryRow(
            sql.insert_variant,
            {
              instance_question_id,
              question_id: question.id,
              authn_user_id: user.user_id,
              user_id: user.user_id,
              // TODO: handle groups.
              group_id: null,
              seed: row.Seed,
              params: row.Params,
              true_answer: row['True answer'],
              options: row.Options,
              course_id,
            },
            IdSchema,
          );

          await sqldb.queryRow(
            sql.insert_submission,
            {
              variant_id,
              authn_user_id,
              submitted_answer: row['Submitted answer'],
              partial_scores: row['Partial Scores'],
              override_score: row['Override score'],
              credit: row.Credit,
              mode: row.Mode,
              grading_requested_at: row['Grading requested date'],
              graded_at: row['Grading date'],
              score: row.Score,
              correct: row.Correct,
              feedback: row.Feedback,
              params: row.Params,
              true_answer: row['True answer'],
              submission_date: row['Submission date'] ?? new Date(),
            },
            IdSchema,
          );

          successCount++;
        } catch (err) {
          errorCount++;
          let errorMsg = `Error processing CSV line ${lineNumber}: ${JSON.stringify(rawJson)}\n`;
          if (err instanceof z.ZodError) {
            errorMsg += `Validation Error: ${err.errors
              .map((e) => `${e.path.join('.')}: ${e.message}`)
              .join(', ')}`;
          } else {
            errorMsg += String(err);
            // TODO: remove before merging.
            errorMsg += `\n${err.stack}`;
            console.error(err);
          }

          if (output == null) {
            output = errorMsg;
          } else {
            output += '\n' + errorMsg;
          }
          job.error(errorMsg);
        }

        outputCount++;
        if (outputCount >= outputThreshold) {
          job.verbose(output ?? '');
          output = null;
          outputCount = 0;
          outputThreshold *= 2;
        }
      });
    } finally {
      if (output != null) {
        job.verbose(output);
      }
    }

    if (errorCount === 0) {
      job.info(`Successfully processed ${successCount} submissions, with no errors`);
    } else {
      job.info(`Successfully processed ${successCount} submissions`);
      job.error(`Error processing ${errorCount} submissions`);
    }
  });

  return serverJob.jobSequenceId;
}
