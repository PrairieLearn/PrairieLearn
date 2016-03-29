var Promise = require('bluebird');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var courseDB = require('../../courseDB');

describe('fromDisk/courseInfo', function() {

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
            });
        });

        it('should have exactly 1 course for TPL 101', function() {
            var sql = 'SELECT * FROM courses WHERE short_name = \'TPL 101\';';
            models.sequelize.query(sql).should.finally.have.property('0').with.length(1);
        });

        it('should have exactly 3 course instances for TPL 101', function() {
            var sql = 'SELECT *'
                + ' FROM course_instances AS ci'
                + ' JOIN courses AS c ON (c.id = ci.course_id)'
                + ' WHERE short_name = \'TPL 101\''
                + ' ;';
            models.sequelize.query(sql).should.finally.have.property('0').with.length(3);
        });

        it('courseInstances should correspond to semesters: Sp15, Fa15, Sp16', function() {
            var sql = 'SELECT s.short_name'
                + ' FROM course_instances AS ci'
                + ' JOIN courses AS c ON (c.id = ci.course_id)'
                + ' JOIN semesters AS s ON (s.id = ci.semester_id)'
                + ' WHERE c.short_name = \'TPL 101\''
                + ' ;';
            models.sequelize.query(sql).should.finally.have.property('0').which.containDeep([
                {short_name: 'Sp15'}, // jscs:ignore
                {short_name: 'Fa15'}, // jscs:ignore
                {short_name: 'Sp16'}, // jscs:ignore
            ]);
        });
    });
});
