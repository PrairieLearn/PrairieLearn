import { parseISO } from 'date-fns';
import memoize from 'p-memoize';
import * as streamifier from 'streamifier';
import { z } from 'zod';

import { formatErrorStack } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { truncate } from '@prairielearn/sanitize';
import { IdSchema } from '@prairielearn/zod';

import { selectAssessmentInfoForJob } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { selectAssessmentQuestions } from './assessment-question.js';
import { deleteAllAssessmentInstancesForAssessment } from './assessment.js';
import { dangerousFullSystemAuthz } from './authz-data-lib.js';
import { createCsvParser } from './csv.js';
import {
  type Assessment,
  AssessmentQuestionSchema,
  type Group,
  RubricItemSchema,
} from './db-types.js';
import { createOrAddToGroup, deleteAllGroups } from './groups.js';
import { type InstanceQuestionScoreInput, updateInstanceQuestionScore } from './manualGrading.js';
import { createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const ZodStringToJson = z.preprocess((val) => {
  if (val === '' || val == null) return {};
  return JSON.parse(String(val));
}, z.record(z.any()).nullable());

const BaseSubmissionCsvRowSchema = z.object({
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
  'Manual points': z.coerce.number().optional(),
});

const IndividualSubmissionCsvRowSchema = BaseSubmissionCsvRowSchema.extend({
  UID: z.string(),
});

const GroupSubmissionCsvRowSchema = BaseSubmissionCsvRowSchema.extend({
  'Group name': z.string(),
  Usernames: z.preprocess((val) => {
    if (val === '' || val == null) return [];
    // CSV exports serialize arrays as JSON
    return JSON.parse(String(val));
  }, z.array(z.string())),
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
  assessment: Assessment,
  csvFile: Express.Multer.File | null | undefined,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const course_instance = await selectCourseInstanceById(assessment.course_instance_id);
  const { assessment_label, course_id } = await selectAssessmentInfoForJob(assessment.id);

  const serverJob = await createServerJob({
    type: 'upload_submissions',
    description: 'Upload submissions CSV for ' + assessment_label,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_id,
    courseInstanceId: course_instance.id,
    assessmentId: assessment.id,
  });

  const ensureAndEnrollUser = memoize(async (uid: string) => {
    const user = await selectOrInsertUserByUid(uid);
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance: course_instance,
      actionDetail: 'implicit_joined',
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });
    return user;
  });
  const selectQuestion = memoize(
    async (qid: string) => await selectQuestionByQid({ course_id, qid }),
  );
  const selectAssessmentQuestion = memoize(
    async (question_id: string) =>
      await sqldb.queryRow(
        sql.select_assessment_question,
        { assessment_id: assessment.id, question_id },
        AssessmentQuestionSchema,
      ),
  );

  serverJob.executeInBackground(async (job) => {
    job.info('Deleting all existing assessment instances');
    await deleteAllAssessmentInstancesForAssessment(assessment.id, authn_user_id);

    job.info('Deleting all existing groups');
    await deleteAllGroups(assessment.id, authn_user_id);

    job.info('Uploading submissions CSV for ' + assessment_label);

    let successCount = 0;
    let errorCount = 0;

    const getOrInsertGroup = makeDedupedInserter<Group>();
    const getOrInsertAssessmentInstance = makeDedupedInserter<string>();
    const getOrInsertInstanceQuestion = makeDedupedInserter<string>();
    const getOrInsertVariant = makeDedupedInserter<string>();

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);

    const assessmentQuestions = await selectAssessmentQuestions({
      assessment_id: assessment.id,
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
      maxRecordSize: 1 << 21, // 2MB (should be plenty for a single line)
    });

    // Detect if this is a group work CSV by checking the first row
    let isGroupWork: boolean | null = null;

    for await (const { info, record } of csvParser) {
      job.verbose(`Processing CSV line ${info.lines}`);

      try {
        // Auto-detect CSV type on first data row
        if (isGroupWork === null) {
          isGroupWork = 'Group name' in record && !('UID' in record);

          if (isGroupWork && !assessment.team_work) {
            throw new Error(
              'Group work CSV detected, but assessment does not have group work enabled',
            );
          } else if (!isGroupWork && assessment.team_work) {
            throw new Error('Individual work CSV detected, but assessment has group work enabled');
          }
        }

        const row = isGroupWork
          ? GroupSubmissionCsvRowSchema.parse(record)
          : IndividualSubmissionCsvRowSchema.parse(record);

        if ('Usernames' in row && row.Usernames.length === 0) {
          job.warn(`Skipping group "${row['Group name']}" with no usernames`);
          continue;
        }

        const question = await selectQuestion(row.Question);
        const assessmentQuestion = await selectAssessmentQuestion(question.id);

        const entity = await run(async () => {
          if ('UID' in row) {
            const user = await ensureAndEnrollUser(row.UID);
            return { type: 'user' as const, user_id: user.id };
          } else {
            // Create users for all group members concurrently
            const users = await Promise.all(row.Usernames.map((uid) => ensureAndEnrollUser(uid)));

            const group = await getOrInsertGroup([row['Group name']], async () => {
              // Use createOrAddToGroup which handles both creating new groups and adding to existing ones
              return await createOrAddToGroup({
                course_instance,
                assessment,
                group_name: row['Group name'],
                uids: row.Usernames,
                authn_user_id,
                // This function only runs in dev mode, so we can safely ignore permission checks.
                authzData: dangerousFullSystemAuthz(),
              });
            });

            return { type: 'group' as const, team_id: group.id, users };
          }
        });

        // Insert assessment instance (for user or group)
        const entityKey = entity.type === 'user' ? entity.user_id : entity.team_id;
        const assessment_instance_id = await getOrInsertAssessmentInstance(
          [entityKey, row['Assessment instance'].toString()],
          async () =>
            await sqldb.queryRow(
              sql.insert_assessment_instance,
              {
                assessment_id: assessment.id,
                user_id: entity.type === 'user' ? entity.user_id : null,
                group_id: entity.type === 'group' ? entity.team_id : null,
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
                course_instance_id: course_instance.id,
                instance_question_id,
                question_id: question.id,
                // For group work, arbitrarily use the first user's ID as the authn_user_id.
                // This value doesn't really matter, especially in dev mode.
                authn_user_id: entity.type === 'user' ? entity.user_id : entity.users[0].id,
                user_id: entity.type === 'user' ? entity.user_id : null,
                group_id: entity.type === 'group' ? entity.team_id : null,
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

        let manual_rubric_data: InstanceQuestionScoreInput['manual_rubric_data'] = null;

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

        await updateInstanceQuestionScore({
          assessment,
          instance_question_id,
          submission_id,
          check_modified_at: null,
          score: {
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
        });

        successCount++;
      } catch (err) {
        errorCount++;
        job.error(
          `Error processing CSV line ${info.lines}: ${truncate(JSON.stringify(record), 100)}`,
        );
        if (err instanceof z.ZodError) {
          job.error(
            `Validation Error: ${err.errors
              .map((e) => `${e.path.join('.')}: ${e.message}`)
              .join(', ')}`,
          );
        } else {
          job.error(formatErrorStack(err));
        }
      }
    }

    if (errorCount === 0) {
      job.info(`Successfully processed ${successCount} submissions, with no errors`);
    } else {
      job.info(`Successfully processed ${successCount} submissions`);
      job.fail(`Error processing ${errorCount} submissions`);
    }
  });

  return serverJob.jobSequenceId;
}
