var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, questionDB) {
        var questionIDs = []
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
                    questionIDs.push(question.id);
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
            var sql = 'WITH'
                + ' course_question_ids AS ('
                + '     SELECT id'
                + '     FROM questions'
                + '     WHERE course_id = :courseId'
                + '     AND deleted_at IS NULL'
                + ' )'
                + ' UPDATE questions SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE id IN (SELECT * FROM course_question_ids)'
                + ' AND ' + (questionIDs.length === 0 ? 'TRUE' : 'id NOT IN (:questionIDs)')
                + ' ;';
            var params = {
                questionIDs: questionIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },
};
