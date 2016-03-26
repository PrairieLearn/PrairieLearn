var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        logger.infoOverride("Syncing questions from disk to SQL DB");
        Promise.all(
            _(questionDB).map(function(q) {
                var topic, question;
                return models.Topic.findOne({where: {
                    name: q.topic,
                    course_id: courseInfo.courseId,
                }}).then(function(findTopic) {
                    topic = findTopic;
                    if (!topic) throw Error("no topic with name = " + q.topic);
                    return models.Question.findOrCreate({where: {
                        qid: q.qid,
                    }, paranoid: false});
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
                    question.restore(); // undo soft-delete just in case
                });
            })
        ).then(function() {
            // soft-delete questions from the DB that aren't on disk
            return models.Question.destroy({where: {
                course_id: courseInfo.courseId,
                qid: {
                    $notIn: _(questionDB).pluck('qid'),
                },
            }});
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
