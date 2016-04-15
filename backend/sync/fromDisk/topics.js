var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var colors = require('../../colors');

module.exports = {
    /*
      FIXME: At the moment this generates the topic list from the questions.
      This will need to be fixed when we explicitly encode the topics in
      the courseInfo.json file.
    */
    sync: function(courseInfo, questionDB, callback) {
        var topicIDs = [];
        return Promise.all(
            _.chain(questionDB)
                .pluck('topic')
                .uniq()
                .sortBy(_.identity)
                .map(function(name, i) {
                    return models.Topic.findOrCreate({where: {
                        name: name,
                        courseId: courseInfo.courseId,
                    }}).spread(function(topic, created) {
                        topicIDs.push(topic.id);
                        topic.update({
                            number: i + 1,
                            color: colors.topics[i % colors.topics.length],
                        });
                    });
                }).value()
        ).then(function() {
            // delete topics from the DB that aren't on disk
            // can't use models.Topic.destroy() because it's buggy when topicIDs = []
            // see https://github.com/sequelize/sequelize/issues/4859
            var sql = 'WITH'
                + ' course_topic_ids AS ('
                + '     SELECT top.id'
                + '     FROM topics AS top'
                + '     WHERE top.course_id = :courseId'
                + ' )'
                + ' DELETE FROM topics'
                + ' WHERE id IN (SELECT * FROM course_topic_ids)'
                + ' AND ' + (topicIDs.length === 0 ? 'TRUE' : 'id NOT IN (:topicIDs)')
                + ' ;';
            var params = {
                topicIDs: topicIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },
};
