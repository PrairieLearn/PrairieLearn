var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var colors = require('../../colors');

module.exports = {
    /*
      FIXME: At the moment this generates the topic list from the questions.
      This will need to be fixed when we explicitly encode the topics in
      the courseInfo.json file.
    */
    sync: function(courseInfo, questionDB, callback) {
        logger.infoOverride("Syncing topics from disk to SQL DB");
        var topicIDs = [];
        Promise.all(
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
                            number: i,
                            color: colors.topics[i % colors.topics.length],
                        });
                    });
                }).value()
        ).then(function() {
            // delete topics from the DB that aren't on disk
            return models.Topic.destroy({where: {
                courseId: courseInfo.courseId,
                id: {
                    $notIn: topicIDs,
                },
            }});
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
