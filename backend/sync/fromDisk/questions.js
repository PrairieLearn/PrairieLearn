var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, questionDB) {
        return Promise.all(
            _(questionDB).map(function(q) {
                var topic, question;
                return models.Topic.findOne({where: {
                    name: q.topic,
                    courseId: courseInfo.courseId,
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
                        topicId: topic.id,
                        courseId: courseInfo.courseId,
                    });
                }).then(function() {
                    question.restore(); // undo soft-delete just in case
                });
            })
        ).then(function() {
            // soft-delete questions from the DB that aren't on disk
            return models.Question.destroy({where: {
                courseId: courseInfo.courseId,
                qid: {
                    $notIn: _(questionDB).pluck('qid'),
                },
            }});
        });
    },
};
