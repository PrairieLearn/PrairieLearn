//@ts-check
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/error');
const serverJobs = require('../../lib/server-jobs-legacy');
const syncHelpers = require('../shared/syncHelpers');
const { logger } = require('@prairielearn/logger');

router.get('/:job_sequence_id', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  const job_sequence_id = req.params.job_sequence_id;
  const course_id = res.locals.course ? res.locals.course.id : null;
  serverJobs.getJobSequenceWithFormattedOutput(job_sequence_id, course_id, (err, job_sequence) => {
    if (ERR(err, next)) return;

    if (job_sequence.status === 'Running') {
      // All edits wait for the corresponding job sequence to finish before
      // proceeding, so something bad must have happened to get to this page
      // with a sequence that is still running.
      return next(new Error('Edit is still in progress (job sequence is still running)'));
    } else if (job_sequence.status !== 'Error') {
      return next(new Error('Edit did not fail'));
    }

    res.locals.failedSync = false;

    if (job_sequence.legacy) {
      // Legacy job sequences should no longer exist.
      logger.warn(
        `Found a legacy job sequence (id=${job_sequence_id}) while handling an edit error`,
      );
    } else {
      const job = job_sequence.jobs[0];

      if (job.data.saveSucceeded && !job.data.syncSucceeded) {
        res.locals.failedSync = true;
      }
    }

    res.locals.job_sequence = job_sequence;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/:job_sequence_id', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  if (req.body.__action === 'pull') {
    syncHelpers
      .pullAndUpdate(res.locals)
      .then((job_sequence_id) => {
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
      })
      .catch((err) => ERR(err, next));
  } else {
    return next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

module.exports = router;
