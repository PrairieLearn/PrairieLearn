var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseBaseUrl = locals.baseUrl + '/course/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionPreviewTabUrl = '/preview';
locals.questionSettingsTabUrl = '/settings';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/course_admin/questions';
locals.questionsUrlCourse = locals.courseBaseUrl + '/course_admin/questions';
locals.isStudentPage = false;

describe('Instructor manual grading', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    // describe('the database', function() {
    //     it('should contain question with manual grading question', function(callback) {
    //         sqldb.query(sql.select_manual_grading_question, [], function(err, result) {
    //             if (ERR(err, callback)) return;
    //             if (result.rowCount == 0) {
    //                 return callback(new Error('no questions in DB'));
    //             }
    //             locals.questions = result.rows;
    //             callback(null);
    //         });
    //     });
    // });

    describe('1. Override prior grade', () => {
        it('Front-end should be able to see prior grading info on manual grading question', () => {
            // Coordinate with mebird
        });

        it('Should be able to override prior grade, for 100% of question value, if override mode option set on question', () => {
            // allows for 100% of the question to be determined by the value entered manually
        });
    });

    describe('2. Manual grading weighted score', () => {
        it('Weighted grading should result in a grade of x% of final mark for manual score', () => {

        });

        it('Weighted grading should result autograded score being 100-x where x is manual score', () => {

        });
    });

    describe('Manual grading post-grade results', () => {
        it('Should produce a post-grade score after internal grader has run', () => {

        });

        it('Should produce a post-grade score after external grader has run on manual graded question', () => {

        });

        it('Should produce a post-grade score after manual grade operation', () => {

        });
    });

    describe('Manual grading pre-grade and post-grade internal and external chaining ', () => {
        it('Internal grader should produce pre-score partials and post-score, but send pre-score to external grader for further post-grading', () => {

        });

        it('External grader should produce ')
    });
});