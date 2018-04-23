var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        async.series([
            function(callback) {
                courseInfo.tags = courseInfo.tags || [];
                var tagIds = [];
                async.forEachOfSeries(courseInfo.tags, function(tag, i, callback) {
                    logger.debug('Syncing tag ', tag.name);
                    var params = {
                        name: tag.name,
                        number: i + 1,
                        color: tag.color,
                        description: tag.description,
                        course_id: courseInfo.courseId,
                    };
                    sqldb.query(sql.insert_tag, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        tag.id = result.rows[0].id;
                        tagIds.push(tag.id);
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;

                    // delete topics from the DB that aren't on disk
                    var params = {
                        course_id: courseInfo.courseId,
                        keep_tag_ids: tagIds,
                    };
                    sqldb.query(sql.delete_unused_tags, params, function(err, _result) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
            function(callback) {
                logger.debug('Syncing question_tags');
                var tagsByName = _.keyBy(courseInfo.tags, 'name');
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    logger.debug('Syncing tags for question ' + qid);
                    q.tags = q.tags || [];
                    var questionTagIds = [];
                    async.forEachOfSeries(q.tags, function(tagName, i, callback) {
                        if (!_(tagsByName).has(tagName)) {
                            return callback(new Error('Question ' + qid + ', unknown tag: ' + tagName));
                        }
                        var params = {
                            question_id: q.id,
                            tag_id: tagsByName[tagName].id,
                            number: i + 1,
                        };
                        sqldb.query(sql.insert_question_tag, params, function(err, result) {
                            if (ERR(err, callback)) return;
                            questionTagIds.push(result.rows[0].id);
                            callback(null);
                        });
                    }, function(err) {
                        if (ERR(err, callback)) return;

                        // delete topics from the DB that aren't on disk
                        logger.debug('Deleting unused tags');
                        var params = {
                            question_id: q.id,
                            keep_question_tag_ids: questionTagIds,
                        };
                        sqldb.query(sql.delete_unused_question_tags, params, function(err, _result) {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
