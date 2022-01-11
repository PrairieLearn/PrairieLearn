const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('../../prairielib/lib/error');
const serverJobs = require('../../lib/server-jobs');
const syncHelpers = require('../shared/syncHelpers');

router.get('/:job_sequence_id', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  const job_sequence_id = req.params.job_sequence_id;
  const course_id = res.locals.course ? res.locals.course.id : null;
  serverJobs.getJobSequenceWithFormattedOutput(job_sequence_id, course_id, (err, job_sequence) => {
    if (ERR(err, next)) return;

    // All edits wait for the corresponding job sequence to finish before
    // proceeding, so something bad must have happened to get to this page
    // with a sequence that is still running
    if (job_sequence.status === 'Running') {
      return next(new Error('Edit is still in progress (job sequence is still running)'));
    }

    res.locals.failedPush = false;
    res.locals.failedSync = false;

    let job_errors = [];
    let didWrite = false;

    // Loop through jobs in sequential order (we rely on this).
    job_sequence.jobs.forEach((item) => {
      if (item.type === 'unlock' && didWrite && job_errors.length === 0) {
        // We know that one of the jobs resulted in an error. If we reach
        // 'unlock' without having found the error yet, then we know that
        // the edit was written and was not rolled back, and that all we
        // failed to do was sync.
        res.locals.failedSync = true;
      }

      if (item.status === 'Error') {
        job_errors.push({
          description: item.description,
          error_message: item.error_message,
        });

        if (item.type === 'git_push') res.locals.failedPush = true;
      } else if (item.type === 'write') {
        didWrite = true;
      }
    });

    if (job_errors.length === 0) {
      return next(new Error('Could not find a job that caused the edit failure'));
    }

    res.locals.job_sequence = job_sequence;
    res.locals.job_errors = job_errors;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/:job_sequence_id', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  if (req.body.__action === 'pull') {
    syncHelpers.pullAndUpdate(res.locals, function (err, job_sequence_id) {
      if (ERR(err, next)) return;
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
