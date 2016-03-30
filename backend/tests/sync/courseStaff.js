var _ = require('underscore');
var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');
var config = require('../../config');

describe('fromDisk/courseStaff', function() {

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
                return syncTestHelper.syncCourseStaff.sync(courseDB.courseInfo);
            });
        });

        it('should have exactly the correct number of users', function() {
            var sql = 'SELECT * FROM users;'
            return models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(_(courseDB.courseInfo.userRoles).size() + 1); // + 1 for local superuser
        });

        it('should only have mwest@illinois.edu as an Instructor', function() {
            var sql = 'SELECT DISTINCT u.uid'
                + ' FROM users AS u'
                + ' JOIN enrollments AS e ON (u.id = e.user_id)'
                + ' WHERE e.role = \'Instructor\''
                + ' ;';
            var uidList = [{uid: 'mwest@illinois.edu'}];
            return models.sequelize.query(sql).should.finally.have.property('0').which.eql(uidList);
        });

        it('should have the superuser enrolled in all courses', function() {
            var sql = 'SELECT * FROM enrollments WHERE role = \'Superuser\'';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(config.semesters.length);
        });

        it('should have an instructor enrolled in all courses', function() {
            var sql = 'SELECT * FROM enrollments WHERE role = \'Instructor\'';
            return models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(config.semesters.length);
        });

        it('should have a TA enrolled in only one course', function() {
            var sql = 'SELECT *'
                + ' FROM enrollments AS e'
                + ' JOIN users AS u ON (u.id = e.user_id)'
                + ' WHERE u.uid = \'zilles@illinois.edu\''
                + ' ;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(1);
        });
    });

    describe('changing "Instructor" -> "TA"', function() {

        var saveIDs;

        before('mwest -> TA', function() {
            return Promise.try(function() {
                // save the IDs of the enrollment rows
                var sql = 'SELECT e.id'
                    + ' FROM enrollments AS e'
                    + ' JOIN users AS u ON (u.id = e.user_id)'
                    + ' WHERE u.uid = \'mwest@illinois.edu\''
                    + ' ;';
                return models.sequelize.query(sql);
            }).spread(function(results, info) {
                saveIDs = results;

                // resync with the Instructor changed to a TA
                var tmpCourseInfo = _(courseDB.courseInfo).clone();
                tmpCourseInfo.userRoles = _(courseDB.courseInfo.userRoles).clone();
                tmpCourseInfo.userRoles['mwest@illinois.edu'] = 'TA';
                return syncTestHelper.syncCourseStaff.sync(tmpCourseInfo);
            });
        });

        after('restore mwest to Instructor', function() {
            return syncTestHelper.syncCourseStaff.sync(courseDB.courseInfo);
        });

        it('should remove the Instructor completely', function() {
            var sql = 'SELECT * FROM enrollments WHERE role = \'Instructor\'';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(0);
        });

        it('should have preserved the enrollment_ids', function() {
            // save the IDs of the enrollment rows
            var sql = 'SELECT e.id'
                + ' FROM enrollments AS e'
                + ' JOIN users AS u ON (u.id = e.user_id)'
                + ' WHERE u.uid = \'mwest@illinois.edu\''
                + ' ;';
            return models.sequelize.query(sql).should.finally.have.property('0').which.eql(saveIDs);
        });

        it('should have just one non-student role for the ex-instructor', function() {
            // save the IDs of the enrollment rows
            var sql = 'SELECT e.id'
                + ' FROM enrollments AS e'
                + ' JOIN users AS u ON (u.id = e.user_id)'
                + ' WHERE u.uid = \'mwest@illinois.edu\''
                + ' AND e.role != \'Student\''
                + ' ;';
            return models.sequelize.query(sql).should.finally.have.property('0').with.length(1);
        });
    });
});
