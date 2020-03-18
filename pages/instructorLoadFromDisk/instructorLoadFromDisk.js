var ERR = require('async-stacktrace');
var async = require('async');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var config = require('../../lib/config');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');

var update = function(locals, callback) {
    debug('update()');
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
            description: 'Load configuration from disk',
            job_sequence_id: job_sequence_id,
            last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, function(err, job) {
            if (ERR(err, callback)) return;
            debug('successfully created job', {job_sequence_id});
            callback(null, job_sequence_id);

            // continue executing here to launch the actual job
            debug('loading', {courseDirs: config.courseDirs});
            async.eachSeries(config.courseDirs || [], function(courseDir, callback) {
                courseDir = path.resolve(process.cwd(), courseDir);
                debug('loading course', {courseDir});
                var infoCourseFile = path.join(courseDir, 'infoCourse.json');
                fs.access(infoCourseFile, function(err) {
                    if (err) {
                        job.info('File not found: ' + infoCourseFile + ', skipping...');
                        callback(null);
                    } else {
                        job.info('Found file ' + infoCourseFile + ', loading...');
                        syncFromDisk.syncOrCreateDiskToSql(courseDir, job, function(err) {
                            if (ERR(err, callback)) return;
                            debug('successfully loaded course', {courseDir});
                            callback(null);
                        });
                    }
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
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    });
});

module.exports = router;
