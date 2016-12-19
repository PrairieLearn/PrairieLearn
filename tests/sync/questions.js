var _ = require('underscore');
var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');
var config = require('../../config');

describe('sync/fromDisk/questions', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    var saveIDs;

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
                var sql = 'SELECT id FROM questions;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                saveIDs = results;
            });
        });

        it('should have the correct number of questions', function() {
            var n = _.chain(courseDB.questionDB).pluck('qid').uniq().value().length;
            var sql = 'SELECT * FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(n);
        });

        it('should have exactly the correct list of questions', function() {
            var list = _.chain(courseDB.questionDB).pluck('qid').uniq()
                .map(function(t) {return {qid: t};}).value();
            var sql = 'SELECT qid FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(list);
        });
    });

    describe('re-sync with no questions', function() {

        before('sync with no questions', function() {
            return syncTestHelper.syncQuestions.sync(courseDB.courseInfo, []);
        });

        it('should have all deleted questions', function() {
            var sql = 'SELECT * FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should still have all the questions but with deleted_at set', function() {
            var sql = 'SELECT id FROM questions WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(saveIDs);
        });
    });

    describe('re-sync with all questions again', function() {

        before('restore all questions', function() {
            return syncTestHelper.syncQuestions.sync(courseDB.courseInfo, courseDB.questionDB);
        });

        it('should have no deleted questions', function() {
            var sql = 'SELECT * FROM questions WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should have the original IDs', function() {
            var sql = 'SELECT id FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(saveIDs);
        });
    });

    describe('re-sync with one question', function() {

        var oneQID;

        before('sync with one question', function() {
            oneQID = _(courseDB.questionDB).pairs()[0][0];
            var oneQuestionDB = {};
            oneQuestionDB[oneQID] = courseDB.questionDB[oneQID];
            return syncTestHelper.syncQuestions.sync(courseDB.courseInfo, oneQuestionDB);
        });

        it('should have one non-deleted question', function() {
            var sql = 'SELECT * FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(1);
        });

        it('should have the correct non-deleted question', function() {
            var sql = 'SELECT qid FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .which.containDeep([{qid: oneQID}]);
        });
    });

    describe('re-sync with all questions again', function() {

        before('restore all questions', function() {
            return syncTestHelper.syncQuestions.sync(courseDB.courseInfo, courseDB.questionDB);
        });

        it('should have no deleted questions', function() {
            var sql = 'SELECT * FROM questions WHERE deleted_at IS NOT NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.is.empty();
        });

        it('should have the original IDs', function() {
            var sql = 'SELECT id FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(saveIDs);
        });

        it('should have exactly the correct list of questions', function() {
            var list = _.chain(courseDB.questionDB).pluck('qid').uniq()
                .map(function(t) {return {qid: t};}).value();
            var sql = 'SELECT qid FROM questions WHERE deleted_at IS NULL;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(list);
        });
    });
});
