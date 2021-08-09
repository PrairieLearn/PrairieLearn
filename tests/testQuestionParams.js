const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
//var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseBaseUrl = locals.baseUrl + '/course/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
locals.instructorBaseUrl = locals.courseInstanceBaseUrl + '/instructor';
locals.instructorAssessmentsUrl = locals.instructorBaseUrl + '/instance_admin/assessments';
locals.instructorGradebookUrl = locals.instructorBaseUrl + '/instance_admin/gradebook';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
locals.isStudentPage = false;

const addNumbers1 = {qid: 'addNumbersParameterized/1', type: 'Freeform'};
const addNumbers1_assessment = {qid: 'addNumbersParameterized/1', type: 'Freeform'}; // this one comes from an assessment
const addNumbers2 = {qid: 'addNumbersParameterized/2', type: 'Freeform'};
const addNumbers3 = {qid: 'addNumbersParameterized/3', type: 'Freeform'};
const addNumbers4 = {qid: 'addNumbersParameterized/4', type: 'Freeform'};

const questionsArray = [
    addNumbers1_assessment,
    addNumbers2,
    addNumbers3,
    addNumbers4,
];

describe('Parameterized questions', function() {
    this.timeout(60000);
    var page;

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    var elemList, res;

    describe('the database', function() {
        it('should contain questions', function(callback) {
            sqldb.query(sql.select_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount == 0) {
                    return callback(new Error('no questions in DB'));
                }
                locals.questions = result.rows;
                callback(null);
            });
        });

        it('should contain the addNumbersParameterized1 question', function() {
            const question = _.find(locals.questions, {directory: addNumbers1.qid});
            assert.isDefined(question);
            addNumbers1.id = question.id;
            addNumbers1.url = locals.courseBaseUrl + '/question/' + addNumbers1.id + '/';
            addNumbers1_assessment.url = locals.questionBaseUrl + '/' + addNumbers1.id + '/';
        });
        it('should contain the addNumbersParameterized2 question', function() {
            const question = _.find(locals.questions, {directory: addNumbers2.qid});
            assert.isDefined(question);
            addNumbers2.id = question.id;
            addNumbers2.url = locals.questionBaseUrl + '/' + addNumbers2.id + '/';
        });
        it('should contain the addNumbersParameterized3 question', function() {
            const question = _.find(locals.questions, {directory: addNumbers3.qid});
            assert.isDefined(question);
            addNumbers3.id = question.id;
            addNumbers3.url = locals.questionBaseUrl + '/' + addNumbers3.id + '/';
        });
        it('should contain the addNumbersParameterized4 question', function() {
            const question = _.find(locals.questions, {directory: addNumbers4.qid});
            assert.isDefined(question);
            addNumbers4.id = question.id;
            addNumbers4.url = locals.courseBaseUrl + '/question/' + addNumbers4.id + '/';
            addNumbers4.url = locals.questionBaseUrl + '/' + addNumbers4.id + '/';
        });
    });

    var startAssessment = function() {

        describe('the locals object', function() {
            it('should be cleared', function() {
                for (var prop in locals) {
                    delete locals[prop];
                }
            });
            it('should be initialized', function() {
                locals.siteUrl = 'http://localhost:' + config.serverPort;
                locals.baseUrl = locals.siteUrl + '/pl';
                locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
                locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
                locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
                locals.isStudentPage = true;
                locals.totalPoints = 0;
            });
        });

        describe('the questions', function() {
            it('should have cleared data', function() {
                questionsArray.forEach(function(question) {
                    for (var prop in question) {
                        if (prop != 'qid' && prop != 'type' && prop != 'maxPoints') {
                            delete question[prop];
                        }
                    }
                    question.points = 0;
                });
            });
        });

        describe('the database', function() {
            it('should contain HW9', function(callback) {
                sqldb.queryOneRow(sql.select_hw9, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_id = result.rows[0].id;
                    callback(null);
                });
            });
        });

        describe('GET ' + locals.assessmentsUrl, function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentsUrl, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should contain HW9', function() {
                elemList = locals.$('td a:contains("Homework to test question parameters")');
                assert.lengthOf(elemList, 1, page);
            });
            it('should have the correct link for HW9', function() {
                locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
                assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
            });
        });

        describe('GET to assessment URL', function() {
            it('should load successfully', function(callback) {
                locals.preStartTime = Date.now();
                request(locals.assessmentUrl, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    locals.postStartTime = Date.now();
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should redirect to the correct path', function() {
                locals.assessmentInstanceUrl = locals.siteUrl + res.req.path;
                assert.equal(res.req.path, '/pl/course_instance/1/assessment_instance/1');
            });
            it('should create one assessment_instance', function(callback) {
                sqldb.query(sql.select_assessment_instances, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one assessment_instance, got: ' + result.rowCount));
                    }
                    locals.assessment_instance = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct assessment_instance.assessment_id', function() {
                assert.equal(locals.assessment_instance.assessment_id, locals.assessment_id);
            });
            it(`should create ${questionsArray.length} instance_questions`, function(callback) {
                sqldb.query(sql.select_instance_questions, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != questionsArray.length) {
                        return callback(new Error(`expected ${questionsArray.length} instance_questions, got: ` + result.rowCount));
                    }
                    locals.instance_questions = result.rows;
                    callback(null);
                });
            });
            questionsArray.forEach(function(question, i) {
                it(`should have question #${i+1} as QID ${question.qid}`, function() {
                    question.id = locals.instance_questions[i].id;
                    assert.equal(locals.instance_questions[i].qid, question.qid);
                });
            });
        });

        describe('GET to assessment_instance URL', function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentInstanceUrl, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            questionsArray.forEach(function(question) {
                it(`should link to ${question.qid} question`, function() {
                    const urlTail = '/pl/course_instance/1/instance_question/' + question.id + '/';
                    question.url = locals.siteUrl + urlTail;
                    elemList = locals.$(`td a[href="${urlTail}"]`);
                    assert.lengthOf(elemList, 1);
                });
            });
        });
    };

    startAssessment();

    describe('2. Assessment question inherits parameters from course instance', function() {
        it('should load successfully', function(callback) {
            request(addNumbers1_assessment.url, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode ));
                }
                page = body;
                callback(null);
            });
        });

        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });

        it('should have a range set by the course instance questionParams', function() {
            elemList = locals.$('span:contains("[0, 50]")');
            assert.lengthOf(elemList, 1);
        });
    });

    describe('3. Assessment question inherits parameters from zone', function() {
        it('should load successfully', function(callback) {
            request(addNumbers2.url, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });

        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });

        it('should have a range set by the zone questionParams', function() {
            elemList = locals.$('span:contains("[0, 10]")');
            assert.lengthOf(elemList, 1);
        });
    });

    describe('4. Assessment question inherits parameters from alternatives group', function() {
        it('should load successfully', function(callback) {
            request(addNumbers3.url, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });

        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });

        it('should have a range set by the alternatives group questionParams', function() {
            elemList = locals.$('span:contains("10, 20]")');
            assert.lengthOf(elemList, 1);
        });
    });

    describe('5. Assessment question inherits parameters from assessment question', function() {
        it('should load successfully', function(callback) {
            request(addNumbers4.url, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });

        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });

        it('should have a range set by the assessment question questionParams', function() {
            elemList = locals.$('span:contains("[20, 30]")');
            assert.lengthOf(elemList, 1);
        });
    });
});