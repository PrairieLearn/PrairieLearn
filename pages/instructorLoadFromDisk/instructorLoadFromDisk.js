var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var express = require('express');
var router = express.Router();

var config = require('../../lib/config');
var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');

var update = function(locals, callback) {
    var options = {
        course_id: locals.course ? locals.course.id : null,
        type: 'loadFromDisk',
        description: 'Load data from local disk',
    };
    serverJobs.createJobSequence(options, function(err, job_sequence_id) {
        if (ERR(err, callback)) return;
        
        var jobOptions = {
            course_id: locals.course ? locals.course.id : null,
            type: 'load_from_disk',
            description: 'Load configuation from disk',
            job_sequence_id: job_sequence_id,
            last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, function(err, job) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);

            // continue executing here to launch the actual job
            async.eachSeries(config.courseDirs || [], function(courseDir, callback) {
                courseDir = path.resolve(process.cwd(), courseDir);
                syncFromDisk.syncDiskToSql(courseDir, job, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, function(err) {
                if (err) {
                    job.fail(err);
                } else {
                    job.succeed();
                }
            });
        });
    });
};

router.get('/', function(req, res, next) {
    if (!res.locals.devMode) return next();
    update(res.locals, function(err, job_sequence_id) {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/instructor/jobSequence/' + job_sequence_id);
    });
});

module.exports = router;
