var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var pg = require('pg');

var error = require('./error');
var config = require('./config');
var logger = require('./logger');

var enumMode = fs.readFileSync('./models/enum_mode.sql', 'utf8');
var enumQuestionType = fs.readFileSync('./models/enum_question_type.sql', 'utf8');
var enumRole = fs.readFileSync('./models/enum_role.sql', 'utf8');
var enumSubmissionType = fs.readFileSync('./models/enum_submission_type.sql', 'utf8');
var enumAssessmentType = fs.readFileSync('./models/enum_assessment_type.sql', 'utf8');

var courses = fs.readFileSync('./models/courses.sql', 'utf8');
var courseInstances = fs.readFileSync('./models/course_instances.sql', 'utf8');
var courseInstanceAccessRules = fs.readFileSync('./models/course_instance_access_rules.sql', 'utf8');
var topics = fs.readFileSync('./models/topics.sql', 'utf8');
var questions = fs.readFileSync('./models/questions.sql', 'utf8');
var tags = fs.readFileSync('./models/tags.sql', 'utf8');
var questionTags = fs.readFileSync('./models/question_tags.sql', 'utf8');
var assessmentSets = fs.readFileSync('./models/assessment_sets.sql', 'utf8');
var assessments = fs.readFileSync('./models/assessments.sql', 'utf8');
var zones = fs.readFileSync('./models/zones.sql', 'utf8');
var assessmentAccessRules = fs.readFileSync('./models/assessment_access_rules.sql', 'utf8');
var assessmentQuestions = fs.readFileSync('./models/assessment_questions.sql', 'utf8');

var users = fs.readFileSync('./models/users.sql', 'utf8');
var enrollments = fs.readFileSync('./models/enrollments.sql', 'utf8');
var assessmentInstances = fs.readFileSync('./models/assessment_instances.sql', 'utf8');
var instanceQuestions = fs.readFileSync('./models/instance_questions.sql', 'utf8');
var variants = fs.readFileSync('./models/variants.sql', 'utf8');
var submissions = fs.readFileSync('./models/submissions.sql', 'utf8');

var assessmentStateLogs = fs.readFileSync('./models/assessment_state_logs.sql', 'utf8');
var assessmentScoreLogs = fs.readFileSync('./models/assessment_score_logs.sql', 'utf8');
var accesseLogs = fs.readFileSync('./models/access_logs.sql', 'utf8');
var variantViewLogs = fs.readFileSync('./models/variant_view_logs.sql', 'utf8');
var gradingLogs = fs.readFileSync('./models/grading_logs.sql', 'utf8');
var questionScoreLogs = fs.readFileSync('./models/question_score_logs.sql', 'utf8');

var histogram = fs.readFileSync('./sprocs/histogram.sql', 'utf8');
var arrayHistogram = fs.readFileSync('./sprocs/array_histogram.sql', 'utf8');
var formatInterval = fs.readFileSync('./sprocs/format_interval.sql', 'utf8');
var formatIntervalShort = fs.readFileSync('./sprocs/format_interval_short.sql', 'utf8');
var intervalHistThresholds = fs.readFileSync('./sprocs/interval_hist_thresholds.sql', 'utf8');
var checkCourseInstanceAccessRule = fs.readFileSync('./sprocs/check_course_instance_access_rule.sql', 'utf8');
var checkCourseInstanceAccess = fs.readFileSync('./sprocs/check_course_instance_access.sql', 'utf8');
var checkAssessmentAccessRule = fs.readFileSync('./sprocs/check_assessment_access_rule.sql', 'utf8');
var checkAssessmentAccess = fs.readFileSync('./sprocs/check_assessment_access.sql', 'utf8');
var assessmentInstanceDurations = fs.readFileSync('./sprocs/assessment_instance_durations.sql', 'utf8');
var userAssessmentDurations = fs.readFileSync('./sprocs/user_assessment_durations.sql', 'utf8');
var assessmentDurationStats = fs.readFileSync('./sprocs/assessment_duration_stats.sql', 'utf8');
var userAssessmentScores = fs.readFileSync('./sprocs/user_assessment_scores.sql', 'utf8');
var studentAssessmentScores = fs.readFileSync('./sprocs/student_assessment_scores.sql', 'utf8');
var assessmentStats = fs.readFileSync('./sprocs/assessment_stats.sql', 'utf8');
var assessmentsForQuestion = fs.readFileSync('./sprocs/assessments_for_question.sql', 'utf8');
var tagsForQuestion = fs.readFileSync('./sprocs/tags_for_question.sql', 'utf8');
var assessmentPointsHomework = fs.readFileSync('./sprocs/assessment_points_homework.sql', 'utf8');
var randomUnique = fs.readFileSync('./sprocs/random_unique.sql', 'utf8');
var questionOrder = fs.readFileSync('./sprocs/question_order.sql', 'utf8');

module.exports = {
    pool: null,

    init: function(callback) {
        var that = module.exports;

        var pgConfig = {
            user: config.postgresqlUser,
            database: config.postgresqlDatabase,
            host: config.postgresqlHost,
            max: 10,
            idleTimeoutMillis: 30000,
        };
        that.pool = new pg.Pool(pgConfig);
        that.pool.on('error', function(err, client) {
            logger.error(error.makeWithData('idle client error', {message: err.message, stack: err.stack}));
        });

        async.eachSeries([
            // models
            enumMode,
            enumQuestionType,
            enumRole,
            enumSubmissionType,
            enumAssessmentType,
            courses,
            courseInstances,
            courseInstanceAccessRules,
            topics,
            questions,
            tags,
            questionTags,
            assessmentSets,
            assessments,
            zones,
            assessmentAccessRules,
            assessmentQuestions,
            users,
            enrollments,
            assessmentInstances,
            instanceQuestions,
            variants,
            submissions,
            assessmentStateLogs,
            assessmentScoreLogs,
            accesseLogs,
            variantViewLogs,
            gradingLogs,
            questionScoreLogs,

            // sprocs
            histogram,
            arrayHistogram,
            formatInterval,
            formatIntervalShort,
            intervalHistThresholds,
            checkCourseInstanceAccessRule,
            checkCourseInstanceAccess,
            checkAssessmentAccessRule,
            checkAssessmentAccess,
            assessmentInstanceDurations,
            userAssessmentDurations,
            assessmentDurationStats,
            userAssessmentScores,
            studentAssessmentScores,
            assessmentStats,
            assessmentsForQuestion,
            tagsForQuestion,
            assessmentPointsHomework,
            randomUnique,
            questionOrder,
        ], function(sql, callback) {
            that.query(sql, [], callback);
        }, function(err) {
            callback(err);
        });
    },

    paramsToArray: function(sql, params, callback) {
        if (_.isArray(params)) return callback(null, sql, params);
        var re = /\$([-_a-zA-Z0-9]+)/;
        var result;
        var processedSql = '';
        var remainingSql = sql;
        var nParams = 0;
        var map = {};
        while ((result = re.exec(remainingSql)) !== null) {
            var v = result[1];
            if (!_(map).has(v)) {
                nParams++;
                map[v] = nParams;
            }
            processedSql += remainingSql.substring(0, result.index) + '$' + map[v];
            remainingSql = remainingSql.substring(result.index + result[0].length);
        }
        processedSql += remainingSql;
        remainingSql = '';
        var paramsArray = [];
        var invertedMap = _.invert(map);
        for (var i = 0; i < nParams; i++) {
            if (!_(params).has(invertedMap[i + 1])) return callback(new Error("Missing parameter: " + invertedMap[i + 1]));
            paramsArray.push(params[invertedMap[i + 1]]);
        }
        callback(null, processedSql, paramsArray);
    },

    getClient: function(callback) {
        this.pool.connect(function(err, client, done) {
            if (err) {
                if (client) {
                    done(client);
                }
                if (ERR(err, callback)) return;
                return callback(error.addData(err, {extraInfo: 'Error handling failed'}));
            }
            callback(null, client, done);
        });
    },

    queryWithClient: function(client, done, sql, params, callback) {
        var handleError = function(err, extraData) {
            if (!err) return false;
            if (client) {
                done(client);
            }
            error.addData(err, {sql: sql, params: params});
            if (ERR(err, callback)) return true;
            callback(error.addData(err, {extraInfo: 'Error handling failed'}));
            return true;
        };
        this.paramsToArray(sql, params, function(err, newSql, newParams) {
            if (err) error.addData(err, {sql: sql, params: params});
            if (ERR(err, callback)) return;
            client.query(newSql, newParams, function(err, result) {
                if (handleError(err)) return;
                callback(null, result);
            });
        });
    },

    queryWithClientOneRow: function(client, done, sql, params, callback) {
        this.queryWithClient(client, done, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, params: params};
                return callback(error.makeWithData("Incorrect rowCount: " + result.rowCount, data));
            }
            callback(null, result);
        });
    },

    releaseClient: function(client, done) {
        done();
    },

    rollbackWithClient: function(client, done) {
        // from https://github.com/brianc/node-postgres/wiki/Transactions
        client.query('ROLLBACK', function(err) {
            //if there was a problem rolling back the query
            //something is seriously messed up.  Return the error
            //to the done function to close & remove this client from
            //the pool.  If you leave a client in the pool with an unaborted
            //transaction weird, hard to diagnose problems might happen.
            return done(err);
        });
    },

    query: function(sql, params, callback) {
        var that = this;
        that.pool.connect(function(err, client, done) {
            var handleError = function(err, extraData) {
                if (!err) return false;
                if (client) {
                    done(client);
                }
                error.addData(err, {sql: sql, params: params});
                if (ERR(err, callback)) return true;
                callback(error.addData(err, {extraInfo: 'Error handling failed'}));
                return true;
            };
            if (handleError(err)) return;
            that.paramsToArray(sql, params, function(err, newSql, newParams) {
                if (err) error.addData(err, {sql: sql, params: params});
                if (ERR(err, callback)) return;
                client.query(newSql, newParams, function(err, result) {
                    if (handleError(err)) return;
                    done();
                    callback(null, result);
                });
            });
        });
    },

    queryOneRow: function(sql, params, callback) {
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, params: params};
                return callback(error.makeWithData("Incorrect rowCount: " + result.rowCount, data));
            }
            callback(null, result);
        });
    },
};
