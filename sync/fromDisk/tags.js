var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function asyncCallOneRow(functionName, params) {
    return new Promise((resolve, reject) => {
        sqldb.callOneRow(functionName, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function asyncQueryOneRow(sql, params) {
    return new Promise((resolve, reject) => {
        sqldb.queryOneRow(sql, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function safeAsync(func, callback) {
    new Promise(async () => {
        try {
            callback(await func());
        } catch (err) {
            callback(err);
        }
    });
};

module.exports = { 
    sync: function(courseInfo, questionDB, callback) {
        safeAsync(async () => {
            // Aggregate all tags into a form that we can pass in one go to our sproc
            const tags = courseInfo.tags || [];
            const paramTags = tags.map((tag, index) => ({
                name: tag.name,
                number: index + 1,
                color: tag.color,
                description: tag.description,
            }));
            const tagParams = {
                // node-postgres will try to convert to postgres arrays, so we
                // need to explicitly serialize ourselves: see
                // https://github.com/brianc/node-postgres/issues/442
                new_tags: JSON.stringify(paramTags),
                course_id: courseInfo.courseId,
            };

            const res = await asyncQueryOneRow(sql.update_tags, tagParams);
            console.log(res);

            // We'll get back some rows, each one containing the ID of the
            // corresponding tag in the tags array
            const tagIdsByName = res.rows[0].new_tag_ids.reduce((acc, id, index) => {
                acc[paramTags[index].name] = id;
                return acc;
            }, {});

            console.log('tagIdsByName', tagIdsByName);

            // Iterate over all the questions and validate that they all have
            // valid tags. As we go, build up an array of all the information that
            // we'll need when updating the DB. Since this entire thing will
            // need to be sent over the wire, we'll use a compact representation
            // instead of more verbose JSON for courses with many hundreds of tags.
            // We'll have an array of arrays, which each array containing info for one
            // question in the form [question_id, [tag_1_id, tag_2_id, ...]].
            const paramQuestionTags = [];

            for (const qid in questionDB) {
                const question = questionDB[qid]
                const tags = question.tags || []
                const unknownTags = tags.filter(tag => !(tag in tagIdsByName));
                if (unknownTags.length > 0) {
                    throw new Error(`Question ${qid} has unknown tags: ${unknownTags.join(', ')}`);
                }
                paramQuestionTags.push([question.id, tags.map(tag => tagIdsByName[tag])]);
            }

            const questionTagParams = {
                new_question_tags: JSON.stringify(paramQuestionTags),
            }
            await asyncQueryOneRow(sql.update_question_tags, questionTagParams);
        }, callback);
    }
}

module.exportsss = {
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

                    // delete tags from the DB that aren't on disk
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

                    // Figure out if any specified tags don't exist in the course
                    const unknownTags = q.tags.filter(tag => tag in tagsByName);
                    if (unknownTags.length > 0) {
                        callback(new Error(`Question ${qid} has unknown tags: ${unknownTags.join(', ')}`))
                        return;
                    }

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

                        // delete question tags from the DB that aren't on disk
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
