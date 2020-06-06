const ERR = require('async-stacktrace');
const config = require('../lib/config');
const path = require('path');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');



var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
const helperClient = require('./helperClient');
const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceUrl + '/assessments';
const courseDir = path.join(__dirname, '..', 'exampleCourse');


// cd /PrairieLearn
// docker/start_postgres.sh
// git config --global user.email "dev@illinois.edu"
// git config --global user.name "Dev User"
// npm test -- --grep "Group based homework setup on student side"

let res, page, elemList;
const locals = {};
describe('Group based homework setup on student side', function() {
    // this.timeout(20000);

    before('set up testing server', helperServer.before(courseDir));
    after('shut down testing server', helperServer.after);

    describe('1. the database', function() {
        it('should contain a group-based homework assessment', function(callback) {
            sqldb.queryOneRow(sql.select_groupwork, [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.lengthOf(result.rows, 1);
                assert.notEqual(result.rows[0].id, undefined);
                locals.assessment_id = result.rows[0].id;
                locals.instructorManagermentUrl = courseInstanceUrl + '/instructor/assessment/' + result.rows[0].id + '/groups';
                callback(null);
            });
        });
    });
    
    describe('2. GET ' + locals.instructorManagermentUrl, function() {
        it('should load successfully', function(callback) {
            request(locals.instructorManagermentUrl, function(error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            })
        })
    });


});