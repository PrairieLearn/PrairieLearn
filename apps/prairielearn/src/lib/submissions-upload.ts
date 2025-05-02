import csvtojson from 'csvtojson';
import _ from 'lodash';
import * as streamifier from 'streamifier';

import * as sqldb from '@prairielearn/postgres';

import { selectAssessmentInfoForJob } from '../models/assessment.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { deleteAllAssessmentInstancesForAssessment } from './assessment.js';
import { AssessmentQuestionSchema, IdSchema } from './db-types.js';
import { createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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

    const requiredHeaders = [
      'UID',
      'UIN',
      'Username',
      'Name',
      'Role',
      'Assessment',
      'Assessment instance',
      'Zone number',
      'Zone title',
      'Question',
      'Question instance',
      'Variant',
      'Seed',
      'Params',
      'True answer',
      'Options',
      'submission_id',
      'Submission date',
      'Submitted answer',
      'Partial Scores',
      'Override score',
      'Credit',
      'Mode',
      'Grading requested date',
      'Grading date',
      'Assigned manual grader',
      'Last manual grader',
      'Score',
      'Correct',
      'Feedback',
      'Rubric Grading',
      'Question points',
      'Max points',
      'Question % score',
      'Auto points',
      'Max auto points',
      'Manual points',
      'Max manual points',
    ];

    try {
      await csvConverter.fromStream(csvStream).subscribe(async (json, number) => {
        // Replace all keys with their lower-case values for easier access
        json = _.mapKeys(json, (_v, k) => k.toLowerCase());

        // Validate headers for the first row
        if (number === 0) {
          const headers = Object.keys(json);
          if (!requiredHeaders.every((header) => headers.includes(header.toLowerCase()))) {
            throw new Error('Invalid CSV format or missing required headers.');
          }
        }

        const msg = `Processing CSV line ${number + 2}: ${JSON.stringify(json)}`;
        if (output == null) {
          output = msg;
        } else {
          output += '\n' + msg;
        }

        try {
          // Helper to parse JSON fields, returning null on error or if empty
          const parseJsonField = (fieldName: string) => {
            const value = json[fieldName];
            if (value == null || value === '') return null;
            return JSON.parse(value);
          };

          // Helper to parse numeric fields, returning null if invalid or empty
          const parseNumericField = (fieldName: string): number | null => {
            const value = json[fieldName];
            if (value == null || value === '') return null;
            const num = Number(value);
            return isNaN(num) ? null : num;
          };

          // Helper to parse boolean fields
          const parseBooleanField = (fieldName: string): boolean | null => {
            const value = json[fieldName]?.toLowerCase();
            if (value == null || value === '') return null;
            return value === 'true' || value === '1';
          };

          // Helper to parse date fields
          const parseDateField = (fieldName: string): Date | null => {
            const value = json[fieldName];
            if (value == null || value === '') return null;
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
          };

          // Get the user for the submission.
          const user = await selectOrInsertUserByUid(json.uid);

          // 1. Ensure User/Group and Assessment Instance
          let assessment_instance_id: string;

          if (json.group_name) {
            const group_id = await sqldb.queryRow(
              sql.ensure_group,
              {
                group_name: json.group_name,
                course_instance_id,
              },
              IdSchema,
            );

            assessment_instance_id = await sqldb.queryRow(
              sql.ensure_assessment_instance_group,
              {
                assessment_id,
                group_id,
                instance_number: parseNumericField('assessment instance') ?? 1,
              },
              IdSchema,
            );
          } else {
            assessment_instance_id = await sqldb.queryRow(
              sql.ensure_assessment_instance_user,
              {
                assessment_id,
                user_id: user.user_id,
                instance_number: parseNumericField('assessment instance') ?? 1,
              },
              IdSchema,
            );
          }

          const question = await selectQuestionByQid({
            course_id,
            qid: json.question,
          });

          const assessmentQuestion = await sqldb.queryRow(
            sql.select_assessment_question,
            { assessment_id, question_id: question.id },
            AssessmentQuestionSchema,
          );

          // Insert the instance question if it doesn't exist.
          const instance_question_id = await sqldb.queryRow(
            sql.ensure_instance_question,
            { assessment_instance_id, assessment_question_id: assessmentQuestion.id },
            IdSchema,
          );

          // Insert the variant if it doesn't exist.
          const params = parseJsonField('params');
          const true_answer = parseJsonField('true answer');
          const options = parseJsonField('options');
          const variant_id = await sqldb.queryRow(
            sql.insert_variant,
            {
              instance_question_id,
              question_id: question.id,
              authn_user_id: user.user_id,
              user_id: user.user_id,
              // TODO: handle groups.
              group_id: null,
              seed: json.seed,
              params,
              true_answer,
              options,
              course_id,
            },
            IdSchema,
          );

          // 6. Ensure Submission
          const submitted_answer = parseJsonField('submitted answer');
          const partial_scores = parseJsonField('partial scores');
          const feedback = parseJsonField('feedback');
          await sqldb.queryRow(
            sql.ensure_submission,
            {
              submission_id: json.submission_id,
              variant_id,
              authn_user_id: user.user_id,
              submitted_answer,
              partial_scores,
              override_score: parseNumericField('override score'),
              credit: parseNumericField('credit'),
              mode: json.mode ?? null,
              grading_requested_at: parseDateField('grading requested date'),
              graded_at: parseDateField('grading date'),
              score: parseNumericField('score'),
              correct: parseBooleanField('correct'),
              feedback,
              params, // Re-insert variant params/true_answers for history
              true_answer,
              submission_date: parseDateField('submission date') ?? new Date(), // Default to now if missing
            },
            IdSchema,
          );

          successCount++;
        } catch (err) {
          errorCount++;
          const errorMsg = `Error processing CSV line ${number + 2}: ${JSON.stringify(json)}\n${err}`;
          if (output == null) {
            output = errorMsg;
          } else {
            output += '\n' + errorMsg;
          }
          job.error(errorMsg); // Also log error immediately to job
        }

        outputCount++;
        if (outputCount >= outputThreshold) {
          job.verbose(output ?? '');
          output = null;
          outputCount = 0;
          outputThreshold *= 2; // exponential backoff
        }
      });
    } finally {
      // Log remaining output
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
