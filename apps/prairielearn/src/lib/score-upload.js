// @ts-check
const _ = require('lodash');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const sqldb = require('@prairielearn/postgres');

const { createServerJob } = require('./server-jobs');
const manualGrading = require('./manualGrading');

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Update question instance scores from a CSV file.
 *
 * @param {string} assessment_id - The assessment to update.
 * @param {{ originalname: string, size: number, buffer: Buffer } | null | undefined} csvFile - An object with keys {originalname, size, buffer}.
 * @param {string} user_id - The current user performing the update.
 * @param {string} authn_user_id - The current authenticated user.
 */
export async function uploadInstanceQuestionScores(assessment_id, csvFile, user_id, authn_user_id) {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, {
    assessment_id,
  });

  const assessment_label = result.rows[0].assessment_label;
  const course_instance_id = result.rows[0].course_instance_id;
  const course_id = result.rows[0].course_id;

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'upload_instance_question_scores',
    description: 'Upload question scores for ' + assessment_label,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Uploading question scores for ' + assessment_label);

    // accumulate output lines in the "output" variable and actually
    // output put them in blocks, to avoid spamming the updates
    let output = null;
    let outputCount = 0;
    let outputThreshold = 100;

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
    const csvStream = streamifier.createReadStream(csvFile.buffer, {
      encoding: 'utf8',
    });
    const csvConverter = csvtojson({
      colParser: {
        instance: 'number',
        score_perc: 'number',
        points: 'number',
        manual_score_perc: 'number',
        manual_points: 'number',
        auto_score_perc: 'number',
        auto_points: 'number',
        submission_id: 'number',
      },
      maxRowLength: 10000,
    });

    try {
      await csvConverter.fromStream(csvStream).subscribe(async (json, number) => {
        // Replace all keys with their lower-case values
        json = _.mapKeys(json, (_v, k) => k.toLowerCase());
        try {
          if (await updateInstanceQuestionFromJson(json, assessment_id, authn_user_id)) {
            successCount++;
            // The number refers to a zero-based index of the data entries.
            // Adding 1 to use 1-based (as is used in Excel et al), and 1 to
            // account for the header.
            const msg = `Processed CSV line ${number + 2}: ${JSON.stringify(json)}`;
            if (output == null) {
              output = msg;
            } else {
              output += '\n' + msg;
            }
          } else {
            skippedCount++;
            // NO OUTPUT
          }
        } catch (err) {
          errorCount++;
          const msg = `Error processing CSV line ${number + 2}: ${JSON.stringify(json)}\n${err}`;
          if (output == null) {
            output = msg;
          } else {
            output += '\n' + msg;
          }
        }
        outputCount++;
        if (outputCount >= outputThreshold) {
          job.verbose(output);
          output = null;
          outputCount = 0;
          outputThreshold *= 2; // exponential backoff
        }
      });
    } finally {
      // Log output even in the case of failure.
      if (output != null) {
        job.verbose(output);
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
  });

  return serverJob.jobSequenceId;
}

/**
 * Update assessment instance scores from a CSV file.
 *
 * @param {string} assessment_id - The assessment to update.
 * @param {{ originalname: string, size: number, buffer: Buffer } | null | undefined} csvFile - An object with keys {originalname, size, buffer}.
 * @param {string} user_id - The current user performing the update.
 * @param {string} authn_user_id - The current authenticated user.
 */
export async function uploadAssessmentInstanceScores(
  assessment_id,
  csvFile,
  user_id,
  authn_user_id,
) {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }
  const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, {
    assessment_id,
  });
  const assessment_label = result.rows[0].assessment_label;
  const course_instance_id = result.rows[0].course_instance_id;
  const course_id = result.rows[0].course_id;

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'upload_assessment_instance_scores',
    description: 'Upload total scores for ' + assessment_label,
  });

  serverJob.executeInBackground(async (job) => {
    job.verbose('Uploading total scores for ' + assessment_label);

    // accumulate output lines in the "output" variable and actually
    // output put them in blocks, to avoid spamming the updates
    let output = null;
    let outputCount = 0;
    let outputThreshold = 100;

    let successCount = 0;
    let errorCount = 0;

    job.info(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
    const csvStream = streamifier.createReadStream(csvFile.buffer, {
      encoding: 'utf8',
    });
    const csvConverter = csvtojson({
      colParser: {
        instance: 'number',
        score_perc: 'number',
        points: 'number',
      },
      maxRowLength: 1000,
    });

    try {
      await csvConverter.fromStream(csvStream).subscribe(async (json, number) => {
        // Replace all keys with their lower-case values
        json = _.mapKeys(json, (v, k) => {
          return k.toLowerCase();
        });
        const msg = `Processing CSV line ${number + 2}: ${JSON.stringify(json)}`;
        if (output == null) {
          output = msg;
        } else {
          output += '\n' + msg;
        }
        try {
          await updateAssessmentInstanceFromJson(json, assessment_id, authn_user_id);
          successCount++;
        } catch (err) {
          errorCount++;
          const msg = String(err);
          if (output == null) {
            output = msg;
          } else {
            output += '\n' + msg;
          }
        }
        outputCount++;
        if (outputCount >= outputThreshold) {
          job.verbose(output);
          output = null;
          outputCount = 0;
          outputThreshold *= 2; // exponential backoff
        }
      });
    } finally {
      // Log output even in the case of failure.
      if (output != null) {
        job.verbose(output);
      }
    }

    if (errorCount === 0) {
      job.verbose(
        `Successfully updated scores for ${successCount} assessment instances, with no errors`,
      );
    } else {
      job.verbose(`Successfully updated scores for ${successCount} assessment instances`);
      job.error(`Error updating ${errorCount} assessment instances`);
    }
  });

  return serverJob.jobSequenceId;
}

// missing values and empty strings get mapped to null
function getJsonPropertyOrNull(json, key) {
  const value = _.get(json, key, null);
  if (value === '') return null;
  return value;
}

// missing values and empty strings get mapped to null
function getNumericJsonPropertyOrNull(json, key) {
  const value = getJsonPropertyOrNull(json, key);
  if (isNaN(value)) {
    throw new Error(`Value of ${key} is not a numeric value`);
  }
  return value;
}

// "feedback" gets mapped to {manual: "XXX"} and overrides the contents of "feedback_json"
function getFeedbackOrNull(json) {
  const feedback_string = getJsonPropertyOrNull(json, 'feedback');
  const feedback_json = getJsonPropertyOrNull(json, 'feedback_json');
  let feedback = null;
  if (feedback_string != null) {
    feedback = { manual: feedback_string };
  }
  if (feedback_json != null) {
    let feedback_obj = null;
    try {
      feedback_obj = JSON.parse(feedback_json);
    } catch (e) {
      throw new Error(`Unable to parse "feedback_json" field as JSON: ${e}`);
    }
    if (!_.isPlainObject(feedback_obj)) {
      throw new Error(`Parsed "feedback_json" is not a JSON object: ${feedback_obj}`);
    }
    feedback = feedback_obj;
    if (feedback_string != null) {
      feedback.manual = feedback_string;
    }
  }
  return feedback;
}

function getPartialScoresOrNull(json) {
  const partial_scores_json = getJsonPropertyOrNull(json, 'partial_scores');
  let partial_scores = null;
  if (partial_scores_json != null) {
    try {
      partial_scores = JSON.parse(partial_scores_json);
    } catch (e) {
      throw new Error(`Unable to parse "partial_scores" field as JSON: ${e}`);
    }
    if (!_.isPlainObject(partial_scores)) {
      throw new Error(`Parsed "partial_scores" is not a JSON object: ${partial_scores}`);
    }
  }
  return partial_scores;
}

/** Update the score of an instance question based on a single row from the CSV file.
 *
 * @param {Record<string, any>} json Data from the CSV row.
 * @param {string} assessment_id ID of the assessment being updated.
 * @param {string} authn_user_id User ID currently authenticated.
 * @returns {Promise<boolean>} True if the record included an update, or false if the record included no scores or feedback to be changed.
 */
async function updateInstanceQuestionFromJson(json, assessment_id, authn_user_id) {
  const submission_id = getJsonPropertyOrNull(json, 'submission_id');
  const uid_or_group =
    getJsonPropertyOrNull(json, 'group_name') ?? getJsonPropertyOrNull(json, 'uid');
  const ai_number = getJsonPropertyOrNull(json, 'instance');
  const qid = getJsonPropertyOrNull(json, 'qid');

  return await sqldb.runInTransactionAsync(async () => {
    const submission_data = await sqldb.queryZeroOrOneRowAsync(sql.select_submission_to_update, {
      assessment_id,
      submission_id,
      uid_or_group,
      ai_number,
      qid,
    });

    if (submission_data.rowCount === 0) {
      throw new Error(
        `Could not locate submission with id=${submission_id}, instance=${ai_number}, uid/group=${uid_or_group}, qid=${qid} for this assessment.`,
      );
    }
    if (uid_or_group !== null && submission_data.rows[0].uid_or_group !== uid_or_group) {
      throw new Error(
        `Found submission with id=${submission_id}, but uid/group does not match ${uid_or_group}.`,
      );
    }
    if (qid !== null && submission_data.rows[0].qid !== qid) {
      throw new Error(`Found submission with id=${submission_id}, but QID does not match ${qid}.`);
    }

    const new_score = {
      score_perc: getNumericJsonPropertyOrNull(json, 'score_perc'),
      points: getNumericJsonPropertyOrNull(json, 'points'),
      manual_score_perc: getNumericJsonPropertyOrNull(json, 'manual_score_perc'),
      manual_points: getNumericJsonPropertyOrNull(json, 'manual_points'),
      auto_score_perc: getNumericJsonPropertyOrNull(json, 'auto_score_perc'),
      auto_points: getNumericJsonPropertyOrNull(json, 'auto_points'),
      feedback: getFeedbackOrNull(json),
      partial_scores: getPartialScoresOrNull(json),
    };
    if (_.some(Object.values(new_score), (value) => value != null)) {
      await manualGrading.updateInstanceQuestionScore(
        assessment_id,
        submission_data.rows[0].instance_question_id,
        submission_data.rows[0].submission_id,
        null, // modified_at
        new_score,
        authn_user_id,
      );
      return true;
    } else {
      return false;
    }
  });
}

async function updateAssessmentInstanceFromJson(json, assessment_id, authn_user_id) {
  let query, id;
  if (_.has(json, 'uid')) {
    query = sql.select_assessment_instance_uid;
    id = json.uid;
  } else if (_.has(json, 'group_name')) {
    query = sql.select_assessment_instance_group;
    id = json.group_name;
  } else {
    throw new Error('"uid" or "group_name" not found');
  }
  if (!_.has(json, 'instance')) throw new Error('"instance" not found');

  await sqldb.runInTransactionAsync(async () => {
    const result = await sqldb.queryZeroOrOneRowAsync(query, {
      assessment_id,
      uid: json.uid,
      group_name: json.group_name,
      instance_number: json.instance,
    });
    if (result.rowCount === 0) {
      throw new Error(`unable to locate instance ${json.instance} for ${id}`);
    }
    const assessment_instance_id = result.rows[0].assessment_instance_id;

    if (_.has(json, 'score_perc')) {
      await sqldb.callAsync('assessment_instances_update_score_perc', [
        assessment_instance_id,
        json.score_perc,
        authn_user_id,
      ]);
    } else if (_.has(json, 'points')) {
      await sqldb.callAsync('assessment_instances_update_points', [
        assessment_instance_id,
        json.points,
        authn_user_id,
      ]);
    } else {
      throw new Error('must specify either "score_perc" or "points"');
    }
  });
}
