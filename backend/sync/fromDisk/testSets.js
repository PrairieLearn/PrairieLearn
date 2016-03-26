var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var colors = require('../../colors');

module.exports = {
    /*
      FIXME: At the moment this generates the test set list from the tests.
      This will need to be changed when we explicitly provide the test sets
      in the courseInfo.json file.
    */
    sync: function(courseInfo, testDB, callback) {
        logger.infoOverride("Syncing test sets from disk to SQL DB");
        var testSetIDs = [];
        Promise.try(function() {
            return models.CourseInstance.findAll({where: {
                course_id: courseInfo.courseId,
            }});
        }).then(function(courseInstances) {
            return Promise.all(
                // We put all sets into all course instances at the moment, so that
                // set colors will be the same in all course instances.
                _.chain(testDB)
                    .pluck('set')
                    .uniq()
                    .sortBy(_.identity)
                    .map(function(longName, i) {
                        var shortName = {
                            'Exam': 'E',
                            'Practice Exam': 'PE',
                            'Homework': 'HW',
                            'Quiz': 'Q',
                            'Practice Quiz': 'PQ',
                            'Practice': 'P',
                            'All Questions': 'AQ',
                            'Activity': 'A',
                            'Full Exams': 'FE',
                            'Machine Lab': 'ML',
                        }[longName] || longName;
                        return _(courseInstances).map(function(courseInstance) {
                            return models.TestSet.findOrCreate({where: {
                                longName: longName,
                                course_instance_id: courseInstance.id,
                            }}).spread(function(testSet, created) {
                                testSetIDs.push(testSet.id);
                                return testSet.update({
                                    shortName: shortName,
                                    color: colors.testSets[i % colors.testSets.length],
                                });
                            });
                        });
                    }).flatten().value()
            );
        }).then(function() {
            // delete testSets from DB that aren't on disk
            var sql = 'WITH'
                + ' course_test_set_ids AS ('
                + '     SELECT ts.id'
                + '     FROM test_sets AS ts'
                + '     JOIN course_instances AS ci ON (ci.id = ts.course_instance_id)'
                + '     WHERE ci.course_id = :courseId'
                + ' )'
                + ' DELETE FROM test_sets'
                + ' WHERE id IN (SELECT * FROM course_test_set_ids)'
                + (testSetIDs.length == 0 ? '' : ' AND id NOT IN (:testSetIDs)')
                + ' ;'
            var params = {
                testSetIDs: testSetIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
