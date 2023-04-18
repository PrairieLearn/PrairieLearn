const ERR = require('async-stacktrace');
const async = require('async');
const { config } = require('./config');
const { logger } = require('@prairielearn/logger');
const sqldb = require('@prairielearn/postgres');
const externalGradingSocket = require('./externalGradingSocket');
const ExternalGraderSqs = require('./externalGraderSqs');
const ExternalGraderLocal = require('./externalGraderLocal');
const assessment = require('./assessment');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports.init = function (callback) {
  if (config.externalGradingUseAws) {
    logger.verbose('External grader running on AWS');
    module.exports.grader = new ExternalGraderSqs();
    callback(null);
  } else {
    // local dev mode
    logger.verbose('External grader running locally');
    module.exports.grader = new ExternalGraderLocal();
    callback(null);
  }
};

module.exports.beginGradingJob = function (grading_job_id, callback) {
  const params = {
    grading_job_id,
  };
  sqldb.queryOneRow(sql.select_grading_job_info, params, (err, result) => {
    if (ERR(err, callback)) return;
    const { grading_job, submission, variant, question, course } = result.rows[0];

    module.exports._beginGradingJob(grading_job, submission, variant, question, course);
    callback(null);
  });
};

module.exports.beginGradingJobs = function (grading_job_ids, callback) {
  async.each(
    grading_job_ids,
    (grading_job_id, callback) => {
      module.exports.beginGradingJob(grading_job_id, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
};

module.exports._beginGradingJob = function (grading_job, submission, variant, question, course) {
  if (!question.external_grading_enabled) {
    logger.verbose('External grading disabled for job id: ' + grading_job.id);

    // Make the grade 0
    let ret = {
      gradingId: grading_job.id,
      grading: {
        score: 0,
        feedback: {
          results: { succeeded: true, gradable: false },
          message: 'External grading is not enabled :(',
        },
      },
    };

    // Send the grade out for processing and display
    assessment
      .processGradingResult(ret)
      .catch((err) =>
        logger.error(`Error processing results for grading job ${grading_job.id}`, err)
      );
    return;
  }

  logger.verbose(`Submitting external grading job ${grading_job.id}.`);

  const gradeRequest = module.exports.grader.handleGradingRequest(
    grading_job,
    submission,
    variant,
    question,
    course
  );
  gradeRequest.on('submit', () => {
    updateJobSubmissionTime(grading_job.id, (err) => {
      if (ERR(err, (err) => logger.error('Error updating job submission time', err))) return;
    });
  });
  gradeRequest.on('received', (receivedTime) => {
    // This event is only fired when running locally; this production, this
    // is handled by the SQS queue.
    updateJobReceivedTime(grading_job.id, receivedTime, (err) => {
      if (ERR(err, (err) => logger.errror('Error updating job received time', err))) return;
    });
  });
  gradeRequest.on('results', (gradingResult) => {
    // This event will only be fired when running locally; in production,
    // external grader results wil be delivered via SQS.
    assessment.processGradingResult(gradingResult).then(
      () => logger.verbose(`Successfully processed grading job ${grading_job.id}`),
      (err) => logger.error(`Error processing grading job ${grading_job.id}`, err)
    );
  });
  gradeRequest.on('error', (err) => {
    handleGraderError(grading_job.id, err);
  });
};

function handleGraderError(jobId, err) {
  logger.error(`Error processing external grading job ${jobId}`);
  logger.error('handleGraderError', err);
  const gradingResult = {
    gradingId: jobId,
    grading: {
      score: 0,
      startTime: null,
      endTime: null,
      feedback: {
        results: { succeeded: false, gradable: false },
        message: err.toString(),
      },
    },
  };
  assessment
    .processGradingResult(gradingResult)
    .catch((err) => logger.error(`Error processing results for grading job ${jobId}`, err));
}

function updateJobSubmissionTime(grading_job_id, callback) {
  var params = {
    grading_job_id: grading_job_id,
    grading_submitted_at: new Date().toISOString(),
  };
  sqldb.query(sql.update_grading_submitted_time, params, (err, _result) => {
    if (ERR(err, callback)) return;
    externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
    callback(null);
  });
}

function updateJobReceivedTime(grading_job_id, receivedTime, callback) {
  var params = {
    grading_job_id: grading_job_id,
    grading_received_at: receivedTime,
  };
  sqldb.query(sql.update_grading_received_time, params, (err, _result) => {
    if (ERR(err, callback)) return;
    externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
    callback(null);
  });
}
