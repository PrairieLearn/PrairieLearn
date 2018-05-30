var ERR = require('async-stacktrace');
var config = require('../lib/config');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

const qids = [
    'addNumbers',
    'ballToss2',
    'customElement',
    'differentiatePolynomial',
    'downloadFile',
    // FIXME: 'fibonacciUpload',
    'functionValueFromPlot',
    'multiplyTwoMatrices',
    'multiplyTwoNumbers',
    'positionTimeGraph',
    'addBinary',
    'addComplexNumbers',
    'codeHighlight',
    'multiplyTwoComplexMatrices',
    // FIXME: 'rotateObject',
];

describe('Auto-test questions', function() {
    this.timeout(60000);

    before('set up testing server', function(callback) {
        // Explicitly call with this so that timeout(...) calls work
        helperServer.before.call(this, (err) => {
            if (ERR(err, callback)) return;
            // It's now safe to read from the config object
            locals.siteUrl = 'http://localhost:' + config.serverPort;
            locals.baseUrl = locals.siteUrl + '/pl';
            locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
            locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
            locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
            locals.isStudentPage = false;
            callback(null);
        });
    });
    after('shut down testing server', helperServer.after);

    qids.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
