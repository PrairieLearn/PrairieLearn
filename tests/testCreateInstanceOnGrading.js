const ERR = require('async-stacktrace');

const config = require('../lib/config');
const sqldb = require('../prairielib/sql-db');
const sqlLoader = require('../prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);


const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const locals = {};
const maxPoints = 1;

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseBaseUrl = locals.baseUrl + '/course/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
locals.isStudentPage = false;

describe('Create instance on grading', function () {
    this.timeout(20000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    describe('1. the database', function () {
        it('should contain E12', function(callback) {
            sqldb.queryOneRow(sql.select_e12, [], function(err, result) {
                if (ERR(err, callback)) return;
                locals.assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });
    
    describe('2. assessment instance score_perc uploads', function() {
        describe('prepare the CSV upload data', function() {
            it('should succeed', function() {
                locals.csvData
                    = 'uid,instance,score_perc\n'
                    + 'dev@illinois.edu,1,63.5\n';
            });
        });
        helperQuestion.uploadAssessmentInstanceScores(locals);
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals.expectedResult = {
                    assessment_instance_points: 63.5 * maxPoints / 100,
                    assessment_instance_score_perc: 63.5,
                };
                locals.assessment_instance = {
                    id: 1,
                };
            });
        });
        helperQuestion.checkAssessmentScore(locals);
    });
    
    describe('3. assessment instance points uploads', function() {
        describe('prepare the CSV upload data', function() {
            it('should succeed', function() {
                locals.csvData
                    = 'uid,instance,points\n'
                    + 'dev@illinois.edu,2,42.7\n';
            });
        });
        helperQuestion.uploadAssessmentInstanceScores(locals);
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals.expectedResult = {
                    assessment_instance_points: 42.7,
                    assessment_instance_score_perc: 42.7 * 100 / maxPoints,
                };
                locals.assessment_instance = {
                    id: 2,
                };
            });
        });
        helperQuestion.checkAssessmentScore(locals);
    });
});
