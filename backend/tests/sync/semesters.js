require('should');
var syncTestHelper = require('./syncTestHelper');
var models = require('../../models');

describe('fromDisk/semesters', function() {

    before(syncTestHelper.before);
    after(syncTestHelper.after);

    describe('sync', function() {

        before('sync', function() {
            return syncTestHelper.syncSemesters.sync();
        });

        it('should have exactly 3 semesters', function() {
            var sql = 'SELECT * FROM semesters;';
            models.sequelize.query(sql).should.finally.have.property('0').with.length(3);
        });

        it('should have semesters: Sp15, Fa15, Sp16', function() {
            var sql = 'SELECT * FROM semesters;';
            models.sequelize.query(sql).should.finally.have.property('0').which.containDeep([
                {short_name: 'Sp15'}, // jscs:ignore
                {short_name: 'Fa15'}, // jscs:ignore
                {short_name: 'Sp16'}, // jscs:ignore
            ]);
        });
    });
});
