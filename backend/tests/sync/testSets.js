var _ = require('underscore');
var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');
var config = require('../../config');

describe('sync/fromDisk/testSets', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    describe('sync', function() {

        before(function() {
            return Promise.try(function() {
                return Promise.promisify(courseDB.load)();
            }).then(function() {
                return syncTestHelper.syncSemesters.sync();
            }).then(function() {
                return syncTestHelper.syncCourseInfo.sync(courseDB.courseInfo);
            }).then(function() {
                return syncTestHelper.syncTestSets.sync(courseDB.courseInfo, courseDB.testDB);
            });
        });

        it('should have the correct number of test sets', function() {
            var n = _.chain(courseDB.testDB).pluck('set').uniq().value().length
                * config.semesters.length;
            var sql = 'SELECT * FROM test_sets;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(n);
        });

        it('should have exactly the correct list of test sets', function() {
            var list = _.chain(courseDB.testDB).pluck('set').uniq()
                .map(function(t) {return {long_name: t};}).value(); // jscs:ignore
            var sql = 'SELECT long_name FROM test_sets;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(list);
        });
    });

    describe('re-sync with no tests', function() {

        before('sync with no tests', function() {
            return syncTestHelper.syncTestSets.sync(courseDB.courseInfo, []);
        });
        after('restore all tests', function() {
            return syncTestHelper.syncTestSets.sync(courseDB.courseInfo, courseDB.testDB);
        });

        it('should have no test sets', function() {
            var sql = 'SELECT * FROM test_sets;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });
    });

});
