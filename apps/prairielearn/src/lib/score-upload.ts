import { isPlainObject } from 'es-toolkit';
import * as streamifier from 'streamifier';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectAssessmentInfoForJob } from '../models/assessment.js';

import { setAssessmentInstancePoints, setAssessmentInstanceScore } from './assessment.js';
import { createCsvParser } from './csv.js';
import { type Assessment } from './db-types.js';
import * as manualGrading from './manualGrading.js';
import { createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Update question instance scores from a CSV file.
 *
 * @param assessment - The assessment to update.
 * @param csvFile - An object with keys {originalname, size, buffer}.
 * @param user_id - The current user performing the update.
 * @param authn_user_id - The current authenticated user.
 *
 * @returns The ID of the job sequence
 */
export async function uploadInstanceQuestionScores(
  assessment: Assessment,
  csvFile: Express.Multer.File | null | undefined,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const { assessment_label, course_instance_id, course_id } = await selectAssessmentInfoForJob(
    assessment.id,
  );

  const serverJob = await createServerJob({
    type: 'upload_instance_question_scores',
    description: 'Upload question scores for ' + assessment_label,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment.id,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Uploading question scores for ' + assessment_label);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
    const csvParser = createCsvParser(
      streamifier.createReadStream(csvFile.buffer, { encoding: 'utf8' }),
      {
        integerColumns: ['instance'],
        floatColumns: [
          'score_perc',
          'points',
          'manual_score_perc',
          'manual_points',
          'auto_score_perc',
          'auto_points',
        ],
      },
    );

    for await (const { info, record } of csvParser) {
      try {
        if (await updateInstanceQuestionFromCsvRow(record, assessment, authn_user_id)) {
          successCount++;
          job.verbose(`Processed CSV line ${info.lines}: ${JSON.stringify(record)}`);
        } else {
          skippedCount++;
          // NO OUTPUT
        }
      } catch (err: any) {
        errorCount++;
        job.error(`Error processing CSV line ${info.lines}: ${JSON.stringify(record)}\n${err}`);
      }
    }

    if (errorCount === 0) {
      job.info(`Successfully updated scores for ${successCount} questions, with no errors`);
    } else {
      job.info(`Successfully updated scores for ${successCount} questions`);
      job.error(`Error updating ${errorCount} questions`);
    }
    if (skippedCount !== 0) {
      job.warn(`${skippedCount} questions were skipped, with no score/feedback values to update`);
    }
    if (errorCount > 0 && successCount === 0) {
      // Mark the job as failed if there were no successful updates and at least one error
      job.fail('No question scores were updated due to errors in the CSV file');
    }
  });

  return serverJob.jobSequenceId;
}

/**
 * Update assessment instance scores from a CSV file.
 *
 * @param assessment_id - The assessment to update.
 * @param csvFile - An object with keys {originalname, size, buffer}.
 * @param user_id - The current user performing the update.
 * @param authn_user_id - The current authenticated user.
 *
 * @returns The ID of the job sequence.
 */
export async function uploadAssessmentInstanceScores(
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
    type: 'upload_assessment_instance_scores',
    description: 'Upload total scores for ' + assessment_label,
    authnUserId: authn_user_id,
    userId: user_id,
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Uploading total scores for ' + assessment_label);

    let successCount = 0;
    let errorCount = 0;

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
    const csvParser = createCsvParser(
      streamifier.createReadStream(csvFile.buffer, { encoding: 'utf8' }),
      { integerColumns: ['instance'], floatColumns: ['score_perc', 'points'] },
    );

    for await (const { info, record } of csvParser) {
      job.verbose(`Processing CSV line ${info.lines}: ${JSON.stringify(record)}`);
      try {
        await updateAssessmentInstanceFromCsvRow(record, assessment_id, authn_user_id);
        successCount++;
      } catch (err) {
        errorCount++;
        job.error(String(err));
      }
    }

    if (errorCount === 0) {
      job.info(
        `Successfully updated scores for ${successCount} assessment instances, with no errors`,
      );
    } else {
      job.info(`Successfully updated scores for ${successCount} assessment instances`);
      job.error(`Error updating ${errorCount} assessment instances`);
      if (successCount === 0) {
        // Mark the job as failed if there were no successful updates and at least one error
        job.fail('No assessment instance scores were updated due to errors in the CSV file');
      }
    }
  });

  return serverJob.jobSequenceId;
}

function validateNumericColumn(record: Record<string, any>, key: string): number | null {
  const value = record[key];
  if (value != null && (typeof value !== 'number' || Number.isNaN(value))) {
    throw new Error(`Value of ${key} is not a numeric value`);
  }
  return value;
}

/** "feedback" gets mapped to {manual: "XXX"} and overrides the contents of "feedback_json" */
function getFeedbackOrNull(record: Record<string, any>): Record<string, any> | null {
  let feedback: Record<string, any> | null = null;
  if (record.feedback != null) {
    feedback = { manual: record.feedback };
  }
  if (record.feedback_json != null) {
    let feedback_obj: Record<string, any> | null = null;
    try {
      feedback_obj = JSON.parse(record.feedback_json);
    } catch (err) {
      throw new Error('Unable to parse "feedback_json" field as JSON', { cause: err });
    }
    if (feedback_obj == null || !isPlainObject(feedback_obj)) {
      throw new Error(`Parsed "feedback_json" is not a JSON object: ${record.feedback_json}`);
    }
    feedback = feedback_obj;
    if (record.feedback != null) {
      feedback.manual = record.feedback;
    }
  }
  return feedback;
}

function getPartialScoresOrNull(record: Record<string, any>): Record<string, any> | null {
  let partial_scores: Record<string, any> | null = null;
  if (record.partial_scores != null) {
    try {
      partial_scores = JSON.parse(record.partial_scores);
    } catch (err) {
      throw new Error('Unable to parse "partial_scores" field as JSON', { cause: err });
    }
    if (partial_scores != null && !isPlainObject(partial_scores)) {
      throw new Error(`Parsed "partial_scores" is not a JSON object: ${record.partial_scores}`);
    }
  }
  return partial_scores;
}

/**
 * Update the score of an instance question based on a single row from the CSV file.
 *
 * @param record Data from the CSV row.
 * @param assessment The assessment being updated.
 * @param authn_user_id User ID currently authenticated.
 * @returns True if the record included an update, or false if the record included no scores or feedback to be changed.
 */
async function updateInstanceQuestionFromCsvRow(
  record: Record<string, any>,
  assessment: Assessment,
  authn_user_id: string,
): Promise<boolean> {
  const uid_or_group = record.group_name ?? record.uid;

  return await sqldb.runInTransactionAsync(async () => {
    const submission_data = await sqldb.queryOptionalRow(
      sql.select_submission_to_update,
      {
        assessment_id: assessment.id,
        submission_id: record.submission_id,
        uid_or_group,
        ai_number: record.instance,
        qid: record.qid,
      },
      z.object({
        submission_id: IdSchema.nullable(),
        instance_question_id: IdSchema,
        uid_or_group: z.string(),
        qid: z.string(),
      }),
    );

    if (submission_data == null) {
      throw new Error(
        `Could not locate submission with id=${record.submission_id}, instance=${record.instance}, uid/group=${uid_or_group}, qid=${record.qid} for this assessment.`,
      );
    }
    if (uid_or_group !== null && submission_data.uid_or_group !== uid_or_group) {
      throw new Error(
        `Found submission with id=${record.submission_id}, but uid/group does not match ${uid_or_group}.`,
      );
    }
    if (record.qid !== null && submission_data.qid !== record.qid) {
      throw new Error(
        `Found submission with id=${record.submission_id}, but QID does not match ${record.qid}.`,
      );
    }

    const new_score = {
      score_perc: validateNumericColumn(record, 'score_perc'),
      points: validateNumericColumn(record, 'points'),
      manual_score_perc: validateNumericColumn(record, 'manual_score_perc'),
      manual_points: validateNumericColumn(record, 'manual_points'),
      auto_score_perc: validateNumericColumn(record, 'auto_score_perc'),
      auto_points: validateNumericColumn(record, 'auto_points'),
      feedback: getFeedbackOrNull(record),
      partial_scores: getPartialScoresOrNull(record),
    };
    if (Object.values(new_score).some((value) => value != null)) {
      await manualGrading.updateInstanceQuestionScore({
        assessment,
        instance_question_id: submission_data.instance_question_id,
        submission_id: submission_data.submission_id,
        check_modified_at: null,
        score: new_score,
        authn_user_id,
      });
      return true;
    } else {
      return false;
    }
  });
}

async function getAssessmentInstanceId(record: Record<string, any>, assessment_id: string) {
  if (record.uid != null) {
    return {
      id: record.uid,
      assessment_instance_id: await sqldb.queryOptionalRow(
        sql.select_assessment_instance_uid,
        {
          assessment_id,
          uid: record.uid,
          instance_number: record.instance,
        },
        IdSchema,
      ),
    };
  } else if (record.group_name != null) {
    return {
      id: record.group_name,
      assessment_instance_id: await sqldb.queryOptionalRow(
        sql.select_assessment_instance_group,
        {
          assessment_id,
          group_name: record.group_name,
          instance_number: record.instance,
        },
        IdSchema,
      ),
    };
  } else {
    throw new Error('"uid" or "group_name" not found');
  }
}

async function updateAssessmentInstanceFromCsvRow(
  record: Record<string, any>,
  assessment_id: string,
  authn_user_id: string,
) {
  // Error if instance is either not a column or is blank
  if (record.instance == null) throw new Error('"instance" not found');
  await sqldb.runInTransactionAsync(async () => {
    const { id, assessment_instance_id } = await getAssessmentInstanceId(record, assessment_id);

    if (assessment_instance_id == null) {
      throw new Error(`unable to locate instance ${record.instance} for ${id}`);
    }

    const scorePerc = validateNumericColumn(record, 'score_perc');
    const points = validateNumericColumn(record, 'points');
    if (scorePerc != null) {
      await setAssessmentInstanceScore(assessment_instance_id, scorePerc, authn_user_id);
    } else if (points != null) {
      await setAssessmentInstancePoints(assessment_instance_id, points, authn_user_id);
    } else {
      throw new Error('must specify either "score_perc" or "points"');
    }
  });
}
