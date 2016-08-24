var _ = require('underscore');
var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');
var config = require('../../config');

describe('sync/fromDisk/tests', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    var testIDs, testQuestionIDs, zoneIDs, accessRuleIDs;

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
            }).then(function() {
                return syncTestHelper.syncQuestions.sync(courseDB.courseInfo, courseDB.questionDB);
            }).then(function() {
                return syncTestHelper.syncTestSets.sync(courseDB.courseInfo, courseDB.testDB);
            }).then(function() {
                return syncTestHelper.syncTests.sync(courseDB.courseInfo, courseDB.testDB);
            }).then(function() {
                var sql = 'SELECT id FROM tests;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                testIDs = results;

                var sql = 'SELECT id FROM test_questions;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                testQuestionIDs = results;

                var sql = 'SELECT id FROM zones;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                zoneIDs = results;

                var sql = 'SELECT id FROM access_rules;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                accessRuleIDs = results;
            });
        });

        it('should have the correct number of tests', function() {
            var n = _.chain(courseDB.testDB).pluck('tid').uniq().value().length;
            var sql = 'SELECT * FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(n);
        });

        it('should have at least one access rule per test', function() {
            var n = _.chain(courseDB.testDB).pluck('tid').uniq().value().length;
            var sql = 'SELECT * FROM access_rules;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.property('length').aboveOrEqual(n);
        });

        it('should have at least one zone per test', function() {
            var n = _.chain(courseDB.testDB).pluck('tid').uniq().value().length;
            var sql = 'SELECT * FROM zones;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.property('length').aboveOrEqual(n);
        });

        it('should have exactly the correct list of tests', function() {
            var list = _.chain(courseDB.testDB).pluck('tid').uniq()
                .map(function(t) {return {tid: t};}).value();
            var sql = 'SELECT tid FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(list);
        });
    });

    describe('re-sync with no tests', function() {

        before('sync with no tests', function() {
            return syncTestHelper.syncTests.sync(courseDB.courseInfo, []);
        });

        it('should have all deleted tests', function() {
            var sql = 'SELECT * FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should still have all the tests but with deleted_at set', function() {
            var sql = 'SELECT id FROM tests WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(testIDs);
        });

        it('should have no access rules', function() {
            var sql = 'SELECT * FROM access_rules;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should have no zones', function() {
            var sql = 'SELECT * FROM zones;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });
    });

    describe('re-sync with all tests again', function() {

        before('restore all tests', function() {
            return syncTestHelper.syncTests.sync(courseDB.courseInfo, courseDB.testDB);
        });

        it('should have no deleted tests', function() {
            var sql = 'SELECT * FROM tests WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should have the original IDs', function() {
            var sql = 'SELECT id FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(testIDs);
        });

        it('should have the original number of access rules', function() {
            var sql = 'SELECT id FROM access_rules;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(accessRuleIDs.length);
        });

        it('should have the original number of zones', function() {
            var sql = 'SELECT id FROM zones;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(zoneIDs.length);
        });
    });

    describe('re-sync with one test', function() {

        var oneTID = 'midterm1';

        before('sync with one test', function() {
            var oneTestDB = {};
            oneTestDB[oneTID] = courseDB.testDB[oneTID];
            return syncTestHelper.syncTests.sync(courseDB.courseInfo, oneTestDB);
        });

        it('should have one non-deleted test', function() {
            var sql = 'SELECT * FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(1);
        });

        it('should have the correct non-deleted test', function() {
            var sql = 'SELECT tid FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .which.containDeep([{tid: oneTID}]);
        });

        it('should have the correct number of access rules', function() {
            var sql = 'SELECT * FROM access_rules';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(courseDB.testDB[oneTID].allowAccess.length);
        });

        it('should have the correct number of zones', function() {
            var sql = 'SELECT * FROM zones';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(courseDB.testDB[oneTID].options.zones.length);
        });
    });

    describe('re-sync with all tests again', function() {

        before('restore all tests', function() {
            return syncTestHelper.syncTests.sync(courseDB.courseInfo, courseDB.testDB);
        });

        it('should have no deleted tests', function() {
            var sql = 'SELECT * FROM tests WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should have the original IDs', function() {
            var sql = 'SELECT id FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(testIDs);
        });

        it('should have exactly the correct list of tests', function() {
            var list = _.chain(courseDB.testDB).pluck('tid').uniq()
                .map(function(t) {return {tid: t};}).value();
            var sql = 'SELECT tid FROM tests WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(list);
        });

        it('should have the original number of access rules', function() {
            var sql = 'SELECT id FROM access_rules;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(accessRuleIDs.length);
        });

        it('should have the original number of zones', function() {
            var sql = 'SELECT id FROM zones;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(zoneIDs.length);
        });
    });
});
