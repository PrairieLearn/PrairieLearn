import { parseISO } from 'date-fns';
import memoize from 'p-memoize';
import * as streamifier from 'streamifier';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { selectAssessmentInfoForJob } from '../models/assessment.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { selectAssessmentQuestions } from './assessment-question.js';
import { deleteAllAssessmentInstancesForAssessment } from './assessment.js';
import { createCsvParser } from './csv.js';
import { AssessmentQuestionSchema, IdSchema, RubricItemSchema } from './db-types.js';
import { type InstanceQuestionScoreInput, updateInstanceQuestionScore } from './manualGrading.js';
import { createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const ZodStringToJson = z.preprocess((val) => {
  if (val === '' || val == null) return {};
  return JSON.parse(String(val));
}, z.record(z.any()).nullable());

const SubmissionCsvRowSchema = z.object({
  UID: z.string(),
  // We only use this if someone tries to upload a CSV for a group assessment,
  // in which case we'll throw an error.
  'Group name': z.string().optional(),
  'Assessment instance': z.coerce.number().int(),
  Question: z.string(),
  Variant: z.coerce.number().int(),
  Seed: z.string(),
  Params: ZodStringToJson,
  'True answer': ZodStringToJson,
  Options: ZodStringToJson,
  'Submission date': z
    .string()
    // We pipe the value through `parseISO` from `date-fns` because our CSV
    // export uses timezone offsets like `-05` which, while valid per the
    // ISO 8601 standard, aren't parseable by JavaScript's `Date` constructor
    // or Zod's own date coercion.
    .transform((val) => parseISO(val))
    .pipe(z.date()),
  'Submitted answer': ZodStringToJson,
  Feedback: ZodStringToJson,
  'Rubric Grading': ZodStringToJson,
  'Auto points': z.coerce.number().optional(),
});

/**
 * A utility function to help with inserting only a single row per combination of keys.
 */
function makeDedupedInserter<T>() {
  return memoize(async (key: string[], fn: () => Promise<T>) => await fn(), {
    cacheKey: (args) => args[0].join(':'),
  });
}

/**
 * Processes a CSV file containing submissions and creates users, assessment instances,
 * instance questions, variants, and submissions in the database.
 *
 * Note that this will delete all existing assessment instances for the assessment.
 * Use this function with caution! Specifically, it should really only ever be used
 * in dev mode.
 */
export async function uploadSubmissions(
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
    type: 'upload_submissions',
    description: 'Upload submissions CSV for ' + assessment_label,
  });

  const selectUser = memoize(async (uid: string) => await selectOrInsertUserByUid(uid));
  const selectQuestion = memoize(
    async (qid: string) => await selectQuestionByQid({ course_id, qid }),
  );
  const selectAssessmentQuestion = memoize(
    async (question_id: string) =>
      await sqldb.queryRow(
        sql.select_assessment_question,
        { assessment_id, question_id },
        AssessmentQuestionSchema,
      ),
  );

  serverJob.executeInBackground(async (job) => {
    job.info('Deleting all existing assessment instances');
    await deleteAllAssessmentInstancesForAssessment(assessment_id, authn_user_id);

    job.info('Uploading submissions CSV for ' + assessment_label);

    let successCount = 0;
    let errorCount = 0;

    const getOrInsertAssessmentInstance = makeDedupedInserter<string>();
    const getOrInsertInstanceQuestion = makeDedupedInserter<string>();
    const getOrInsertVariant = makeDedupedInserter<string>();

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);

    const assessmentQuestions = await selectAssessmentQuestions({
      assessment_id,
    });

    // The maximum points of the assessment instance are not available
    // in the CSV export, so we compute the it using the maximum points of
    // the assessment questions of the assessment.
    const maxPoints = assessmentQuestions.reduce(
      (sum, assessmentQuestion) => sum + (assessmentQuestion.assessment_question.max_points ?? 0),
      0,
    );
    const csvStream = streamifier.createReadStream(csvFile.buffer, {
      encoding: 'utf8',
    });
    const csvParser = createCsvParser(csvStream, {
      lowercaseHeader: false,
      maxRecordSize: 1 << 20, // 1MB (should be plenty for a single line)
    });
    for await (const { info, record } of csvParser) {
      job.verbose(`Processing CSV line ${info.lines}: ${JSON.stringify(record)}`);

      try {
        const row = SubmissionCsvRowSchema.parse(record);

        // For simplicity, we're not handling group work until it's needed.
        if (row['Group name']) throw new Error('Group work is not supported yet');

        const user = await selectUser(row.UID);
        const question = await selectQuestion(row.Question);
        const assessmentQuestion = await selectAssessmentQuestion(question.id);

        const assessment_instance_id = await getOrInsertAssessmentInstance(
          [user.user_id, row['Assessment instance'].toString()],
          async () =>
            await sqldb.queryRow(
              sql.insert_assessment_instance,
              {
                assessment_id,
                user_id: user.user_id,
                instance_number: row['Assessment instance'],
              },
              IdSchema,
            ),
        );

        const instance_question_id = await getOrInsertInstanceQuestion(
          [assessment_instance_id, question.id],
          async () =>
            await sqldb.queryRow(
              sql.insert_instance_question,
              {
                assessment_instance_id,
                assessment_question_id: assessmentQuestion.id,
                requires_manual_grading: (assessmentQuestion.max_manual_points ?? 0) > 0,
              },
              IdSchema,
            ),
        );

        const variant_id = await getOrInsertVariant(
          [assessment_instance_id, question.id, row.Variant.toString()],
          async () =>
            await sqldb.queryRow(
              sql.insert_variant,
              {
                course_id,
                course_instance_id,
                instance_question_id,
                question_id: question.id,
                authn_user_id: user.user_id,
                user_id: user.user_id,
                seed: row.Seed,
                // Despite the fact that these values could change over the course of multiple
                // submissions, we'll just use the first set of values we encounter. This
                // is good enough for our purposes.
                params: row.Params,
                true_answer: row['True answer'],
                options: row.Options,
                number: row.Variant,
              },
              IdSchema,
            ),
        );

        const submission_id = await sqldb.queryRow(
          sql.insert_submission,
          {
            variant_id,
            authn_user_id,
            submitted_answer: row['Submitted answer'],
            params: row.Params,
            true_answer: row['True answer'],
            submission_date: row['Submission date'],
          },
          IdSchema,
        );

        let manual_rubric_data: InstanceQuestionScoreInput['manual_rubric_data'] | null = null;

        if (assessmentQuestion.manual_rubric_id) {
          const rubric_items = await sqldb.queryRows(
            sql.select_rubric_items,
            { rubric_id: assessmentQuestion.manual_rubric_id },
            RubricItemSchema,
          );

          await sqldb.execute(sql.update_assessment_instance_max_points, {
            assessment_instance_id,
            max_points: maxPoints,
          });

          // This is a best-effort process: we attempt to match uploaded rubric items to an
          // existing rubric item in the database. If no match is found, the uploaded item
          // is ignored and not applied.
          const applied_rubric_item_ids: string[] = [];

          if (row['Rubric Grading']?.items) {
            for (const { description } of row['Rubric Grading'].items) {
              const rubric_item = rubric_items.find((ri) => ri.description === description);
              if (!rubric_item) {
                continue;
              }
              applied_rubric_item_ids.push(rubric_item.id);
            }
          }
          manual_rubric_data = {
            rubric_id: assessmentQuestion.manual_rubric_id,
            applied_rubric_items: applied_rubric_item_ids.map((id) => ({
              rubric_item_id: id,
            })),
            adjust_points: row['Rubric Grading']?.adjust_points ?? null,
          };
        }

        await updateInstanceQuestionScore(
          assessment_id,
          instance_question_id,
          submission_id,
          null,
          {
            manual_score_perc: null,
            manual_points: run(() => {
              if (assessmentQuestion.manual_rubric_id) {
                return row['Rubric Grading']?.computed_points ?? null;
              } else {
                return row['Manual points'];
              }
            }),
            auto_score_perc: null,
            auto_points: row['Auto points'] ?? null,
            feedback: row.Feedback,
            manual_rubric_data,
          },
          authn_user_id,
        );

        successCount++;
      } catch (err) {
        errorCount++;
        job.error(`Error processing CSV line ${info.lines}: ${JSON.stringify(record)}`);
        if (err instanceof z.ZodError) {
          job.error(
            `Validation Error: ${err.errors
              .map((e) => `${e.path.join('.')}: ${e.message}`)
              .join(', ')}`,
          );
        } else {
          job.error(String(err));
        }
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
