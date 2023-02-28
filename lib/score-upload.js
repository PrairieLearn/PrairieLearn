const util = require('util');
const _ = require('lodash');
const path = require('path');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const manualGrading = require('./manualGrading');
const { logger } = require('@prairielearn/logger');
const serverJobs = require('../lib/server-jobs');
const error = require('../prairielib/lib/error');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = {
  /**
   * Update question instance scores from a CSV file.
   *
   * @param {number} assessment_id - The assessment to update.
   * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
   * @param {number} user_id - The current user performing the update.
   * @param {number} authn_user_id - The current authenticated user.
   * @return {Promise<number>} The job sequence id
   */
  async uploadInstanceQuestionScoresAsync(assessment_id, csvFile, user_id, authn_user_id) {
    debug('uploadInstanceQuestionScores()');
    if (csvFile == null) {
      throw new Error('No CSV file uploaded');
    }

    const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, { assessment_id });
    const assessment_label = result.rows[0].assessment_label;
    const course_instance_id = result.rows[0].course_instance_id;
    const course_id = result.rows[0].course_id;

    const job_sequence_id = await serverJobs.createJobSequenceAsync({
      course_id: course_id,
      course_instance_id: course_instance_id,
      assessment_id: assessment_id,
      user_id: user_id,
      authn_user_id: authn_user_id,
      type: 'upload_instance_question_scores',
      description: 'Upload question scores for ' + assessment_label,
    });

    (async () => {
      // We continue executing below in the background to launch the jobs themselves.

      const job = await serverJobs.createJobAsync({
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'upload_instance_question_scores',
        description: 'Upload question scores for ' + assessment_label,
        job_sequence_id: job_sequence_id,
        last_in_sequence: true,
      });
      job.verbose('Uploading question scores for ' + assessment_label);

      // acculumate output lines in the "output" variable and actually
      // output put them in blocks, to avoid spamming the updates
      let output = null;
      let outputCount = 0;
      let outputThreshold = 100;

      job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
      job.verbose(`----------------------------------------`);
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
      let successCount = 0,
        errorCount = 0;
      try {
        await csvConverter.fromStream(csvStream).subscribe(async (json, number) => {
          // Replace all keys with their lower-case values
          json = _.mapKeys(json, (_v, k) => k.toLowerCase());
          const msg = `Processing CSV record ${number}: ${JSON.stringify(json)}`;
          if (output == null) {
            output = msg;
          } else {
            output += '\n' + msg;
          }
          try {
            await module.exports._updateInstanceQuestionFromJson(
              json,
              assessment_id,
              authn_user_id
            );
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
        if (output != null) {
          job.verbose(output);
        }
        job.verbose(`----------------------------------------`);
        if (errorCount === 0) {
          job.verbose(`Successfully updated scores for ${successCount} questions, with no errors`);
          job.succeed();
        } else {
          job.verbose(`Successfully updated scores for ${successCount} questions`);
          job.fail(`Error updating ${errorCount} questions`);
        }
      } catch (err) {
        if (output != null) job.verbose(output);
        job.fail(error.newMessage(err, 'Error processing CSV'));
      }
    })().catch((err) => {
      logger.error('Error in createJob()', err);
      serverJobs.failJobSequence(job_sequence_id);
    });

    // This is returned before the async code above completes, since there's no await.
    return job_sequence_id;
  },

  /**
   * Update assessment instance scores from a CSV file.
   *
   * @param {number} assessment_id - The assessment to update.
   * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
   * @param {number} user_id - The current user performing the update.
   * @param {number} authn_user_id - The current authenticated user.
   * @return {Promise<number>} The job sequence id
   */
  async uploadAssessmentInstanceScoresAsync(assessment_id, csvFile, user_id, authn_user_id) {
    debug('uploadAssessmentInstanceScores()');
    if (csvFile == null) {
      throw new Error('No CSV file uploaded');
    }

    const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, { assessment_id });
    const assessment_label = result.rows[0].assessment_label;
    const course_instance_id = result.rows[0].course_instance_id;
    const course_id = result.rows[0].course_id;

    const job_sequence_id = await serverJobs.createJobSequenceAsync({
      course_id: course_id,
      course_instance_id: course_instance_id,
      assessment_id: assessment_id,
      user_id: user_id,
      authn_user_id: authn_user_id,
      type: 'upload_assessment_instance_scores',
      description: 'Upload total scores for ' + assessment_label,
    });

    (async () => {
      // We continue executing below in the background to launch the jobs themselves.

      const job = await serverJobs.createJobAsync({
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'upload_assessment_instance_scores',
        description: 'Upload total scores for ' + assessment_label,
        job_sequence_id: job_sequence_id,
        last_in_sequence: true,
      });
      job.verbose('Uploading total scores for ' + assessment_label);

      // acculumate output lines in the "output" variable and actually
      // output put them in blocks, to avoid spamming the updates
      let output = null;
      let outputCount = 0;
      let outputThreshold = 100;

      job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
      job.verbose(`----------------------------------------`);
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
      let successCount = 0,
        errorCount = 0;
      try {
        await csvConverter.fromStream(csvStream).subscribe(async (json, number) => {
          // Replace all keys with their lower-case values
          json = _.mapKeys(json, (v, k) => {
            return k.toLowerCase();
          });
          const msg = `Processing CSV record ${number}: ${JSON.stringify(json)}`;
          if (output == null) {
            output = msg;
          } else {
            output += '\n' + msg;
          }
          try {
            await module.exports._updateAssessmentInstanceFromJson(
              json,
              assessment_id,
              authn_user_id
            );
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
        if (output != null) {
          job.verbose(output);
        }
        job.verbose(`----------------------------------------`);
        if (errorCount === 0) {
          job.verbose(
            `Successfully updated scores for ${successCount} assessment instances, with no errors`
          );
          job.succeed();
        } else {
          job.verbose(`Successfully updated scores for ${successCount} assessment instances`);
          job.fail(`Error updating ${errorCount} assessment instances`);
        }
      } catch (err) {
        if (output != null) {
          job.verbose(output);
        }
        job.fail(error.newMessage(err, 'Error processing CSV'));
      }
    })().catch((err) => {
      logger.error('Error in createJob()', err);
      serverJobs.failJobSequence(job_sequence_id);
    });

    // This is returned before the async code above completes, since there's no await.
    return job_sequence_id;
  },

  // missing values and empty strings get mapped to null
  _getJsonPropertyOrNull(json, key) {
    const value = _.get(json, key, null);
    if (value === '') return null;
    return value;
  },

  // "feedback" gets mapped to {manual: "XXX"} and overrides the contents of "feedback_json"
  _getFeedbackOrNull(json) {
    const feedback_string = module.exports._getJsonPropertyOrNull(json, 'feedback');
    const feedback_json = module.exports._getJsonPropertyOrNull(json, 'feedback_json');
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
  },

  _getPartialScoresOrNull(json) {
    const partial_scores_json = module.exports._getJsonPropertyOrNull(json, 'partial_scores');
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
  },

  async _updateInstanceQuestionFromJson(json, assessment_id, authn_user_id) {
    const submission_id = module.exports._getJsonPropertyOrNull(json, 'submission_id');
    const uid_or_group =
      module.exports._getJsonPropertyOrNull(json, 'group_name') ??
      module.exports._getJsonPropertyOrNull(json, 'uid');
    const ai_number = module.exports._getJsonPropertyOrNull(json, 'instance');
    const qid = module.exports._getJsonPropertyOrNull(json, 'qid');

    const submission_data = await sqldb.queryZeroOrOneRowAsync(sql.select_submission_to_update, {
      assessment_id,
      submission_id,
      uid_or_group,
      ai_number,
      qid,
    });

    if (submission_data.rowCount === 0) {
      throw new Error(
        `Could not locate submission with id=${submission_id}, instance=${ai_number}, uid/group=${uid_or_group}, qid=${qid} for this assessment.`
      );
    }
    if (uid_or_group !== null && submission_data.rows[0].uid_or_group !== uid_or_group) {
      throw new Error(
        `Found submission with id=${submission_id}, but uid/group does not match ${uid_or_group}.`
      );
    }
    if (qid !== null && submission_data.rows[0].qid !== qid) {
      throw new Error(`Found submission with id=${submission_id}, but QID does not match ${qid}.`);
    }

    await manualGrading.updateInstanceQuestionScore(
      assessment_id,
      submission_data.rows[0].instance_question_id,
      submission_data.rows[0].submission_id,
      null, // modified_at
      {
        score_perc: module.exports._getJsonPropertyOrNull(json, 'score_perc'),
        points: module.exports._getJsonPropertyOrNull(json, 'points'),
        manual_score_perc: module.exports._getJsonPropertyOrNull(json, 'manual_score_perc'),
        manual_points: module.exports._getJsonPropertyOrNull(json, 'manual_points'),
        auto_score_perc: module.exports._getJsonPropertyOrNull(json, 'auto_score_perc'),
        auto_points: module.exports._getJsonPropertyOrNull(json, 'auto_points'),
        feedback: module.exports._getFeedbackOrNull(json),
        partial_scores: module.exports._getPartialScoresOrNull(json),
      },
      authn_user_id
    );
  },

  async _updateAssessmentInstanceFromJson(json, assessment_id, authn_user_id) {
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
  },
};

/**
 * Update question instance scores from a CSV file.
 *
 * @param {number} assessment_id - The assessment to update.
 * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
 * @param {number} user_id - The current user performing the update.
 * @param {number} authn_user_id - The current authenticated user.
 * @param {function} callback - A callback(err, job_sequence_id) function.
 */
module.exports.uploadInstanceQuestionScores = util.callbackify(
  module.exports.uploadInstanceQuestionScoresAsync
);

/**
 * Update assessment instance scores from a CSV file.
 *
 * @param {number} assessment_id - The assessment to update.
 * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
 * @param {number} user_id - The current user performing the update.
 * @param {number} authn_user_id - The current authenticated user.
 * @param {function} callback - A callback(err, job_sequence_id) function.
 */
module.exports.uploadAssessmentInstanceScores = util.callbackify(
  module.exports.uploadAssessmentInstanceScoresAsync
);
