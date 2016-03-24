var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        logger.infoOverride("Syncing questions from disk to SQL DB");
        async.eachSeries(_(questionDB).values(), function(q, callback) {
            // need to do this in series because topics don't have unique names,
            // so Topic.findAndCreate() will produce duplicates
            var topic, question;
            Promise.try(function() {
                return models.Topic.findOrCreate({where: {
                    name: q.topic,
                }});
            }).spread(function(newTopic, created) {
                topic = newTopic;
                return models.Question.findOrCreate({where: {
                    qid: q.qid,
                }});
            }).spread(function(newQuestion, created) {
                question = newQuestion;
                return question.update({
                    type: q.type,
                    title: q.title,
                    config: q.options,
                    topic_id: topic.id,
                    course_id: courseInfo.courseId,
                });
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        }, function(err) {
            if (err) return callback(err);
            // delete questions from the DB that aren't on disk
            models.Question.destroy({where: {
                course_id: courseInfo.courseId,
                qid: {
                    $notIn: _.chain(questionDB).values().pluck('tid').value(),
                },
            }}).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        });
    },
};
