var ERR = require('async-stacktrace');
var _ = require('lodash');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');
var helperZoneGradingAssessment = require('./helperZoneGradingAssessment');

const locals = {};

const questionsArray = [
    {qid: 'partialCredit1', type: 'Freeform', maxPoints: 10},
    {qid: 'partialCredit2', type: 'Freeform', maxPoints: 10},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 15},
    {qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 20},
];

const questions = _.keyBy(questionsArray, 'qid');

const assessmentMaxPoints = 20;

//     action: 'save', 'grade', 'store', 'save-stored-fail', 'grade-stored-fail'
//     score: value to submit, will be the percentage score for the submission
//     sub_points: additional awarded points for this submission
//     sub_total_points: additional total points for this submission
const zoneGradingTests = [
    [
        {qid: 'partialCredit1',     action: 'grade',    score: 80, sub_points: 8, sub_total_points: 5},
        {qid: 'partialCredit2',     action: 'grade',    score: 60, sub_points: 6, sub_total_points: 6},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit1',     action: 'grade',    score: 100, sub_points: 1, sub_total_points: 0},
        {qid: 'partialCredit2',     action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit3',     action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 100, sub_points: 5, sub_total_points: 5},
        {qid: 'partialCredit3',     action: 'grade',    score: 100, sub_points: 10, sub_total_points: 4},
    ],
];

describe('Zone grading exam assessment', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    zoneGradingTests.forEach(function(zoneGradingTest, iZoneGradingTest) {

        describe(`zone grading test #${iZoneGradingTest+1}`, function() {
            describe('server', function() {
                it('should shut down', function(callback) {
                    var that = this;
                    // pass "this" explicitly to enable this.timeout() calls
                    helperServer.after.call(that, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
                it('should start up', function(callback) {
                    var that = this;
                    // pass "this" explicitly to enable this.timeout() calls
                    helperServer.before.call(that, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            });

            helperZoneGradingAssessment.startExam(locals, questionsArray);

            zoneGradingTest.forEach(function(questionTest, iQuestionTest) {
                describe(`${questionTest.action} answer number #${iQuestionTest+1} for question ${questionTest.qid} with score ${questionTest.score}`, function() {
                    describe('setting up the submission data', function() {
                        it('should succeed', function() {
                            if (questionTest.action == 'check-closed') {
                                locals.shouldHaveButtons = [];
                            } else {
                                locals.shouldHaveButtons = ['grade', 'save'];
                            }
                            locals.postAction = questionTest.action;
                            locals.question = questions[questionTest.qid];
                            locals.question.points += questionTest.sub_points;
                            locals.totalPoints += questionTest.sub_total_points;
                            const submission_score = (questionTest.submission_score == null) ? questionTest.score : questionTest.submission_score;
                            locals.expectedResult = {
                                submission_score: (questionTest.action == 'save') ? null : (submission_score / 100),
                                submission_correct: (questionTest.action == 'save') ? null : (submission_score == 100),
                                instance_question_points: locals.question.points,
                                instance_question_score_perc: locals.question.points/locals.question.maxPoints * 100,
                                assessment_instance_points: locals.totalPoints,
                                assessment_instance_score_perc: locals.totalPoints/assessmentMaxPoints * 100,
                            };
                            locals.getSubmittedAnswer = function(_variant) {
                                return {
                                    s: String(questionTest.score),
                                };
                            };
                        });
                    });
                    if (questionTest.action == 'store') {
                        helperQuestion.getInstanceQuestion(locals);
                        describe('saving submission data', function() {
                            it('should succeed', function() {
                                locals.question.savedVariant = _.clone(locals.variant);
                                locals.question.questionSavedCsrfToken = locals.__csrf_token;
                            });
                        });
                    } else if (questionTest.action == 'save-stored-fail') {
                        describe('restoring submission data', function() {
                            it('should succeed', function() {
                                locals.postAction = 'save';
                                locals.variant = _.clone(locals.question.savedVariant);
                                locals.__csrf_token = locals.question.questionSavedCsrfToken;
                            });
                        });
                        helperQuestion.postInstanceQuestionAndFail(locals);
                    } else if (questionTest.action == 'grade-stored-fail') {
                        describe('restoring submission data', function() {
                            it('should succeed', function() {
                                locals.postAction = 'grade';
                                locals.variant = _.clone(locals.question.savedVariant);
                                locals.__csrf_token = locals.question.questionSavedCsrfToken;
                            });
                        });
                        helperQuestion.postInstanceQuestionAndFail(locals);
                    } else if (questionTest.action == 'check-closed') {
                        helperQuestion.getInstanceQuestion(locals);
                    } else if (questionTest.action == 'save' || questionTest.action == 'grade') {
                        helperQuestion.getInstanceQuestion(locals);
                        helperQuestion.postInstanceQuestion(locals);
                        helperQuestion.checkQuestionScore(locals);
                        helperQuestion.checkAssessmentScore(locals);
                    } else {
                        throw Error('unknown action: ' + questionTest.action);
                    }
                });
            });
        });
    });
});
