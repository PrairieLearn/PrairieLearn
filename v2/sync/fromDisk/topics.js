var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var config = require('../../lib/config');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, callback) {
        var topicIds = []
        logger.verbose('Syncing topics');
        async.forEachOfSeries(courseInfo.topics, function(topic, i, callback) {
            logger.verbose('Syncing topic ' + topic.name);
            var params = {
                name: topic.name,
                number: i + 1,
                color: topic.color,
                course_id: courseInfo.courseId,
            };
            sqldb.queryOneRow(sql.insert_topic, params, function(err, result) {
                if (ERR(err, callback)) return;
                topicIds.push(result.rows[0].id);
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete topics from the DB that aren't on disk
            logger.verbose('Deleting unused topics')
            var params = {
                course_id: courseInfo.courseId,
                keep_topic_ids: topicIds,
            };
            sqldb.query(sql.delete_unused_topics, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
