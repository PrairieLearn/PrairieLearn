const ERR = require('async-stacktrace');
const AWS = require('aws-sdk');
const _ = require('lodash');
const async = require('async');
const moment = require('moment');
const express = require('express');
const router = express.Router();
const { sqldb, sqlLoader, error } = require('@prairielearn/prairielib');

const syncHelpers = require('../shared/syncHelpers');
const config = require('../../lib/config');
const dockerUtil = require('../../lib/dockerUtil');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    const params = {course_id: res.locals.course.id};
    sqldb.query(sql.select_sync_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequences = result.rows;

        sqldb.query(sql.question_images, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.images = result.rows;
            res.locals.imageSyncNeeded = false;

            if (config.cacheImageRegistry) {
                const ecr = new AWS.ECR();
                async.each(res.locals.images, (image, callback) => {
                    var repository = new dockerUtil.DockerName(image.image);
                    image.tag = repository.getTag() || 'latest (implied)';
                    // Default to get overwritten later
                    image.pushed_at = null;
                    image.imageSyncNeeded = false;
                    var params = {
                        repositoryName: repository.getRepository(),
                    };
                    ecr.describeImages(params, (err, data) => {
                        if (err && err.code == 'RepositoryNotFoundException') {
                            image.imageSyncNeeded = true;
                            return callback(null);
                        } else if (ERR(err, callback)) return;
                        res.locals.ecrInfo = {};
                        data.imageDetails.forEach((imageDetails) => {
                            imageDetails.imageTags.forEach((tag) => {
                                res.locals.ecrInfo[imageDetails.repositoryName + ':' + tag] = imageDetails;
                            });
                        });

                        // Put info from ECR into image for EJS
                        var repoName = repository.getCombined(true);
                        image.digest_full = _.get(res.locals.ecrInfo[repoName], 'imageDigest', '');
                        image.digest = image.digest_full.substring(0,24);
                        if (image.digest != image.digest_full) {
                            image.digest += '...';
                        }
                        image.size = _.get(res.locals.ecrInfo[repoName], 'imageSizeInBytes', 0) / (1000 * 1000);
                        var pushed_at = _.get(res.locals.ecrInfo[repoName], 'imagePushedAt', null);
                        if (pushed_at) {
                            image.pushed_at = moment.utc(pushed_at).format();
                        } else {
                            res.locals.imageSyncNeeded = true;
                            image.imageSyncNeeded = true;
                        }
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, next)) return;
                    const params = {
                        pushed_at_array: _.map(res.locals.images, 'pushed_at'),
                        course_id: res.locals.course.id,
                    };
                    sqldb.query(sql.format_pushed_at, params, (err, result) => {
                        if (ERR(err, next)) return;
                        if (result.rowCount != res.locals.images.length) {
                            return next(new Error('pushed_at length mismatch'));
                        }

                        for (let i = 0; i < res.locals.images.length; i++) {
                            res.locals.images[i].pushed_at_formatted = result.rows[i].pushed_at_formatted;
                        }

                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                });
            } else { //  no config.cacheImageRegistry
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            }
        });
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));
    if (req.body.__action == 'pull') {
        syncHelpers.pullAndUpdate(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'status') {
        syncHelpers.gitStatus(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'syncImages') {
        const params = {course_id: res.locals.course.id};
        sqldb.query(sql.question_images, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.images = result.rows;
            if ('single_image' in req.body) {
                res.locals.images = _.filter(result.rows, ['image', req.body.single_image]);
            }
            syncHelpers.ecrUpdate(res.locals, function(err, job_sequence_id) {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
            });
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
