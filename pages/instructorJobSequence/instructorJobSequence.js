const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const serverJobs = require('../../lib/server-jobs');

router.get('/:job_sequence_id', function(req, res, next) {
    const job_sequence_id = req.params.job_sequence_id;
    const course_id = res.locals.course ? res.locals.course.id : null;
    serverJobs.getJobSequence(job_sequence_id, course_id, (err, job_sequence) => {
        if (ERR(err, next)) return;
        res.locals.job_sequence = job_sequence;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
