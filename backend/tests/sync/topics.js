var _ = require('underscore');
var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');
var config = require('../../config');

describe('fromDisk/topics', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    describe('sync', function() {

        before('sync', function() {
            return Promise.try(function() {
                return Promise.promisify(courseDB.load)();
            }).then(function() {
                return syncTestHelper.syncSemesters.sync();
            }).then(function() {
                return syncTestHelper.syncCourseInfo.sync(courseDB.courseInfo);
            }).then(function() {
                return syncTestHelper.syncTopics.sync(courseDB.courseInfo, courseDB.questionDB);
            });
        });

        it('should have the correct number of topics', function() {
            var nTopic = _.chain(courseDB.questionDB).pluck('topic').uniq().value().length;
            var sql = 'SELECT * FROM topics;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(nTopic);
        });

        it('should have exactly the correct list of topics', function() {
            var topicList = _.chain(courseDB.questionDB).pluck('topic').uniq()
                .map(function(t) {return {name: t};}).value();
            var sql = 'SELECT name FROM topics;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(topicList);
        });
    });

    describe('re-sync with no questions', function() {

        before('sync', function() {
            return syncTestHelper.syncTopics.sync(courseDB.courseInfo, []);
        });

        it('should have no topics', function() {
            var sql = 'SELECT * FROM topics;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });
    });

});
