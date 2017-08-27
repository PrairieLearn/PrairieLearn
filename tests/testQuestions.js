var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
locals.isStudentPage = false;

const qids = [
    'addNumbers',
    'ballToss2',
    'customElement',
    'differentiatePolynomial',
    'downloadFile',
    'multiplyTwoNumbers',
    'positionTimeGraph',
];

describe('Auto-test questions', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    qids.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
