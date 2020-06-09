var ERR = require('async-stacktrace');
var assert = require('chai').assert;
var path = require('path');

var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var sql = sqlLoader.loadSqlEquiv(__filename);
var helperServer = require('./helperServer');
var groupUpdate = require('../lib/group-update');
var locals = {};
locals.courseDir = path.join(__dirname, '..', 'exampleCourse');

describe('test auto group and delete groups', function() {
    this.timeout(20000);
    before('set up testing server', helperServer.before(locals.courseDir));
    after('shut down testing server', helperServer.after);

    it('get group-based homework assessment', (callback) => {
        sqldb.queryOneRow(sql.select_groupwork_assessment, [], function(err, result) {
            if (ERR(err, callback)) return;
            assert.lengthOf(result.rows, 1);
            assert.notEqual(result.rows[0].id, undefined);
            locals.assessment_id = result.rows[0].id;
            callback(null);
        });
    });

    it('create 500 users', (callback) => {
        sqldb.query(sql.generate_500, [], function(err, result) {
            if (ERR(err, callback)) return;
            assert.equal(result.rows.length, 500);
            callback(null);
        });
    });

    it('auto assign groups', (callback) => {
        groupUpdate.autoGroups(locals.assessment_id, 1, 1, 10, 10, 1, function(err, job_sequence_id) {
            if (ERR(err, callback)) return;
            locals.job_sequence_id = job_sequence_id;
            var checkComplete = function() {
                var params = {job_sequence_id: locals.job_sequence_id};
                sqldb.queryOneRow(sql.select_job_sequence, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    locals.job_sequence_status = result.rows[0].status;
                    if (locals.job_sequence_status == 'Running') {
                        setTimeout(checkComplete, 10);
                    } else {
                        callback(null);
                    }
                });
            };
            setTimeout(checkComplete, 10);
        });
    });

    it('check groups and users', (callback) => {
        sqldb.query('SELECT count(group_id) FROM group_users GROUP BY group_id', [], function(err, result) {
            if (ERR(err, callback)) return;
            assert.equal(result.rows.length, 50);

            sqldb.query('SELECT DISTINCT(user_id) FROM group_users', [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.equal(result.rows.length, 500);
                callback(null);
            });
        });
    });

    it('delete groups', (callback) => {
        const params = [
            locals.assessment_id,
            0,
        ];
        sqldb.call('assessment_groups_delete_all', params, function(err) {
            if (ERR(err, callback)) return;

            sqldb.query('SELECT deleted_at FROM groups WHERE deleted_at IS NULL', [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.equal(result.rows.length, 0);
                callback(null);
            });
        });
    });
});
