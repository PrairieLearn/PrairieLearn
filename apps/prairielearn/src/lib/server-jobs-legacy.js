// @ts-check
const _ = require('lodash');
import * as util from 'util';
import * as async from 'async';
import AnsiUp from 'ansi_up';
import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@prairielearn/logger';
import * as socketServer from './socket-server';
import * as sqldb from '@prairielearn/postgres';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';
import { config } from './config';

const sql = sqldb.loadSqlEquiv(__filename);

/*
  SocketIO configuration

  ##########################################
  Room 'job-231' for job_id = 231 in DB.

  Receives messages:
  'joinJob', arguments: job_id, returns: status, output

  Sends messages:
  'change:output', arguments: job_id, output
  'update', arguments: job_id

  ##########################################
  Room 'jobSequence-593' for job_sequence_id = 593 in DB.

  Receives messages:
  'joinJobSequence', arguments: job_sequence_id, returns: job_count

  Sends messages:
  'update', arguments: job_sequence_id

  ##########################################

  'update' events are sent for bulk changes to the object when
  there is no specific 'change' event available.

  For example, an 'update' will not be sent when output changes
  because the more specific 'change:output' event will be sent
  instead.
*/

/** @typedef {{ output: string }} AbstractJob */

/**
 * Store currently active job information in memory. This is used
 * to accumulate stderr/stdout, which are only written to the DB
 * once the job is finished.
 *
 * @type {Record<string, AbstractJob>}
 */
export const liveJobs = {};

/********************************************************************/

let heartbeatIntervalId = null;

export function init() {
  socketServer.io.on('connection', connection);

  // Start a periodic task to heartbeat all live jobs. We don't use a cronjob
  // for this because we want this to run for every host.
  heartbeatIntervalId = setInterval(() => {
    const jobIds = Object.keys(liveJobs);
    if (jobIds.length === 0) return;

    sqldb.queryAsync(sql.update_heartbeats, { job_ids: jobIds }).catch((err) => {
      logger.error('Error updating heartbeats for live server jobs', err);
    });
  }, config.serverJobHeartbeatIntervalSec * 1000);
}

export async function stop() {
  // Wait until all jobs have finished.
  while (Object.keys(liveJobs).length > 0) {
    await sleep(100);
  }

  // Only once all jobs are finished should we stop sending heartbeats.
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

export function connection(socket) {
  socket.on('joinJob', function (msg, callback) {
    if (!_.has(msg, 'job_id')) {
      logger.error('socket.io joinJob called without job_id');
      return;
    }

    // Check authorization of the requester.
    if (!checkSignedToken(msg.token, { jobId: msg.job_id.toString() }, config.secretKey)) {
      logger.error(`joinJob called with invalid token for job_id ${msg.job_id}`);
      return;
    }

    socket.join('job-' + msg.job_id);
    var params = {
      job_id: msg.job_id,
    };
    sqldb.queryOneRow(sql.select_job, params, function (err, result) {
      if (err) return logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
      const status = result.rows[0].status;

      let output;
      const ansiUp = new AnsiUp();
      if (liveJobs[msg.job_id]) {
        output = ansiUp.ansi_to_html(liveJobs[msg.job_id].output);
      } else {
        output = ansiUp.ansi_to_html(result.rows[0].output);
      }

      callback({ status, output });
    });
  });

  socket.on('joinJobSequence', function (msg, callback) {
    if (!_.has(msg, 'job_sequence_id')) {
      logger.error('socket.io joinJobSequence called without job_sequence_id');
      return;
    }

    // Check authorization of the requester.
    if (
      !checkSignedToken(
        msg.token,
        { jobSequenceId: msg.job_sequence_id.toString() },
        config.secretKey,
      )
    ) {
      logger.error(
        `joinJobSequence called with invalid token for job_sequence_id ${msg.job_sequence_id}`,
      );
      return;
    }

    socket.join('jobSequence-' + msg.job_id);
    var params = {
      job_sequence_id: msg.job_sequence_id,
    };
    sqldb.queryOneRow(sql.select_job_sequence, params, function (err, result) {
      if (err) {
        return logger.error(
          'socket.io joinJobSequence error selecting job_sequence_id ' + msg.job_sequence_id,
          err,
        );
      }
      var job_count = result.rows[0].job_count;

      callback({ job_count });
    });
  });
}

export async function errorAbandonedJobs() {
  const abandonedJobs = await sqldb.queryAsync(sql.select_abandoned_jobs, {
    timeout_secs: config.serverJobsAbandonedTimeoutSec,
  });

  await async.eachSeries(abandonedJobs.rows, async (row) => {
    logger.debug('Job abandoned by server, id: ' + row.id);
    try {
      await sqldb.queryAsync(sql.update_job_on_error, {
        job_id: row.id,
        output: null,
        error_message: 'Job abandoned by server',
      });
    } catch (err) {
      logger.error('errorAbandonedJobs: error updating job on error', err);
    } finally {
      socketServer.io.to('job-' + row.id).emit('update');
      if (row.job_sequence_id != null) {
        socketServer.io.to('jobSequence-' + row.job_sequence_id).emit('update');
      }
    }
  });

  const abandonedJobSequences = await sqldb.queryAsync(sql.error_abandoned_job_sequences, {});
  abandonedJobSequences.rows.forEach(function (row) {
    socketServer.io.to('jobSequence-' + row.id).emit('update');
  });
}

/**
 *
 * @param {string} job_sequence_id
 * @param {string | null} course_id
 */
export async function getJobSequence(job_sequence_id, course_id) {
  const result = await sqldb.queryOneRowAsync(sql.select_job_sequence_with_course_id_as_json, {
    job_sequence_id,
    course_id,
  });
  const jobSequence = result.rows[0];

  // Generate a token to authorize websocket requests for this job sequence.
  const jobSequenceTokenData = {
    jobSequenceId: job_sequence_id.toString(),
  };
  jobSequence.token = generateSignedToken(jobSequenceTokenData, config.secretKey);

  jobSequence.jobs?.forEach((job) => {
    // Also generate a token for each job.
    const jobTokenData = { jobId: job.id.toString() };
    job.token = generateSignedToken(jobTokenData, config.secretKey);
  });

  return jobSequence;
}

/**
 * Resolves with a job sequence, where each job's output has been turned into
 * markup with `ansi_up`.
 *
 * @param {any} job_sequence_id
 * @param {any} course_id
 */
export async function getJobSequenceWithFormattedOutputAsync(job_sequence_id, course_id) {
  const jobSequence = await getJobSequence(job_sequence_id, course_id);

  jobSequence.jobs?.forEach((job) => {
    job.output_raw = job.output;
    if (job.output) {
      const ansiup = new AnsiUp();
      job.output = ansiup.ansi_to_html(job.output);
    }
  });

  return jobSequence;
}
export const getJobSequenceWithFormattedOutput = util.callbackify(
  getJobSequenceWithFormattedOutputAsync,
);
