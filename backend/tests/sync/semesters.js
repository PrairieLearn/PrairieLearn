var _ = require('underscore');
require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');
var config = require('../../config');

describe('sync/fromDisk/semesters', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    describe('sync', function() {

        before('sync', function() {
            return syncTestHelper.syncSemesters.sync();
        });

        it('should have exactly the correct number of semesters', function() {
            var sql = 'SELECT * FROM semesters;';
            models.sequelize.query(sql).should.finally.have.property('0')
                .with.length(config.semesters.length);
        });

        it('should have config semesters', function() {
            var sql = 'SELECT * FROM semesters;';
            var semesterList = _(config.semesters).map(function(s) {return {short_name: s.shortName};}); // jscs:ignore
            models.sequelize.query(sql).should.finally.have.property('0').which.containDeep(semesterList);
        });
    });
});
