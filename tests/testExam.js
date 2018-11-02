var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');
var helperExam = require('./helperExam');

const locals = {};

// each outer entry is a whole exam session
// each inner entry is a list of question submissions
//     score: value to submit, will be the percentage score for the submission
//     action: 'save', 'grade', 'store', 'save-stored-fail', 'grade-stored-fail'
//     sub_points: additional points awarded for this submission (NOT total points for the question)
//     open: true or false
const partialCreditTests = [
    [
        // answer every question correctly immediately
        {qid: 'partialCredit1', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'grade',             score: 100, sub_points: 19},
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 9},
        {qid: 'partialCredit3', action: 'grade',             score: 100, sub_points: 13},
        {qid: 'partialCredit1', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'save-stored-fail',  score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'save-stored-fail',  score: 0,   sub_points: 0},
    ],
    [
        // answer questions correctly on the second try
        {qid: 'partialCredit1', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'grade',             score: 100, sub_points: 19},
        {qid: 'partialCredit1', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 37,  sub_points: 9*0.37},
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 7*(1-0.37)},
        {qid: 'partialCredit2', action: 'save-stored-fail',  score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 71,  sub_points: 13*0.71},
        {qid: 'partialCredit3', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 100, sub_points: 13*(1-0.71)},
        {qid: 'partialCredit3', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'check-closed',      score: 0,   sub_points: 0},
    ],
    [
        // use all the attempts for each question
        {qid: 'partialCredit1', action: 'save',              score: 100, sub_points: 0},
        {qid: 'partialCredit1', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'grade',             score: 24,  sub_points: 19*0.24},
        {qid: 'partialCredit1', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'save-stored-fail',  score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'save',              score: 97,  sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 14,  sub_points: 7*0.14},
        {qid: 'partialCredit2', action: 'grade',             score: 8,   sub_points: 0},
        {qid: 'partialCredit2', action: 'save',              score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 27,  sub_points: 3*(0.27-0.14)},
        {qid: 'partialCredit2', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'save',              score: 100, sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 63,  sub_points: 13*0.63},
        {qid: 'partialCredit3', action: 'grade',             score: 63,  sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 64,  sub_points: 8*(0.64-0.63)},
        {qid: 'partialCredit3', action: 'save',              score: 72,  sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 7,   sub_points: 0},
        {qid: 'partialCredit3', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 97,  sub_points: 0.1*(0.97-0.64)},
        {qid: 'partialCredit3', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade-stored-fail', score: 0,   sub_points: 0},
    ],
    [
        // same as above, but in an interspersed order
        {qid: 'partialCredit2', action: 'save',              score: 97,  sub_points: 0},
        {qid: 'partialCredit2', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 63,  sub_points: 13*0.63},
        {qid: 'partialCredit1', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'save',              score: 100, sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 0,   sub_points: 0},
        {qid: 'partialCredit1', action: 'save',              score: 100, sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 63,  sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 14,  sub_points: 7*0.14},
        {qid: 'partialCredit2', action: 'save',              score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'save',              score: 72,  sub_points: 0},
        {qid: 'partialCredit1', action: 'grade',             score: 24,  sub_points: 19*0.24},
        {qid: 'partialCredit3', action: 'grade',             score: 64,  sub_points: 8*(0.64-0.63)},
        {qid: 'partialCredit3', action: 'store',             score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 7,   sub_points: 0},
        {qid: 'partialCredit1', action: 'save-stored-fail',  score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 8,   sub_points: 0},
        {qid: 'partialCredit1', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade',             score: 97,  sub_points: 0.1*(0.97-0.64)},
        {qid: 'partialCredit2', action: 'grade',             score: 27,  sub_points: 3*(0.27-0.14)},
        {qid: 'partialCredit3', action: 'check-closed',      score: 0,   sub_points: 0},
        {qid: 'partialCredit3', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'grade-stored-fail', score: 0,   sub_points: 0},
        {qid: 'partialCredit2', action: 'check-closed',      score: 0,   sub_points: 0},
    ],
];

describe('Exam assessment', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var elemList;

    helperExam.startExam(locals);

    describe('6. save correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'save';
                locals.question = helperExam.questions.addVectors;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/11 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('7. grade incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addVectors;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/11 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        wx: -500,
                        wy: 700,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('8. grade incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/5 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c + 1,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('9. grade incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/17 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('10. grade invalid answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addNumbers;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/17 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        c: 'not_a_number',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
        describe('check the submission is not gradable', function() {
            it('should succeed', function(callback) {
                sqldb.queryOneRow(sql.select_last_submission, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    const submission = result.rows[0];
                    if (submission.gradable) return callback(new Error('submission.gradable is true'));
                    callback(null);
                });
            });
        });
        describe('the submission panel contents', function() {
            it('should contain "INVALID"', function() {
                elemList = locals.$('div.submission-body :contains("INVALID")');
                assert.isAtLeast(elemList.length, 1);
            });
        });
    });

    describe('11. save incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'save';
                locals.question = helperExam.questions.addNumbers;
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c - 1,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('12. the brokenGeneration question', function() {
        describe('setting the question', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['tryAgain'];
                locals.postAction = 'save';
                locals.question = helperExam.questions.brokenGeneration;
            });
            it('should result in no variants', function(callback) {
                let params = {
                    qid: locals.question.qid,
                };
                sqldb.query(sql.select_variants_for_qid, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount == 0) {
                        callback(null);
                    } else {
                        callback(new Error(`Found ${result.rowCount} variants`));
                    }
                });
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('access the question', function() {
            it('should display "Broken question"', function() {
                elemList = locals.$('div.question-body:contains("Broken question")');
                assert.lengthOf(elemList, 1);
            });
            it('should have created one variant', function(callback) {
                let params = {
                    qid: locals.question.qid,
                };
                sqldb.query(sql.select_variants_for_qid, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount == 1) {
                        callback(null);
                    } else {
                        callback(new Error(`Found ${result.rowCount} variants`));
                    }
                });
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('access the question again', function() {
            it('should display "Broken question"', function() {
                elemList = locals.$('div.question-body:contains("Broken question")');
                assert.lengthOf(elemList, 1);
            });
            it('should have created two variants', function(callback) {
                let params = {
                    qid: locals.question.qid,
                };
                sqldb.query(sql.select_variants_for_qid, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount == 2) {
                        callback(null);
                    } else {
                        callback(new Error(`Found ${result.rowCount} variants`));
                    }
                });
            });
        });
    });

    describe('13. load question addNumbers page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.question = helperExam.questions.addNumbers;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('save data for later submission', function() {
            it('should succeed', function() {
                locals.savedVariant = _.clone(locals.variant);
                locals.questionSavedCsrfToken = locals.__csrf_token;
            });
        });
    });

    describe('14. grade correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 3,
                    instance_question_score_perc: 3/5 * 100,
                    assessment_instance_points: 3,
                    assessment_instance_score_perc: 3/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('15. save correct answer to saved question addNumbers page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.question = helperExam.questions.addNumbers;
                locals.postAction = 'save';
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c,
                    };
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                locals.variant = _.clone(locals.savedVariant);
                locals.__csrf_token = locals.questionSavedCsrfToken;
            });
        });
        helperQuestion.postInstanceQuestionAndFail(locals);
    });

    describe('16. save incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'save';
                locals.question = helperExam.questions.fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/17 * 100,
                    assessment_instance_points: 3,
                    assessment_instance_score_perc: 3/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('17. load question addVectors page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.question = helperExam.questions.addVectors;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('save data for later submission', function() {
            it('should succeed', function() {
                locals.savedVariant = _.clone(locals.variant);
                locals.questionSavedCsrfToken = locals.__csrf_token;
            });
        });
    });

    describe('18. grade incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addVectors;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/11 * 100,
                    assessment_instance_points: 3,
                    assessment_instance_score_perc: 3/helperExam.assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        wx: 2000,
                        wy: -3000,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('19. submit correct answer to saved question addVectors page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.question = helperExam.questions.addVectors;
                locals.postAction = 'save';
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                locals.variant = _.clone(locals.savedVariant);
                locals.__csrf_token = locals.questionSavedCsrfToken;
            });
        });
        helperQuestion.postInstanceQuestionAndFail(locals);
    });

    describe('20. load question fossilFuelsRadio page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.question = helperExam.questions.fossilFuelsRadio;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('save data for later submission', function() {
            it('should succeed', function() {
                locals.savedVariant = _.clone(locals.variant);
                locals.questionSavedCsrfToken = locals.__csrf_token;
            });
        });
    });

    describe('21. close exam', function() {
        it('should succeed', function(callback) {
            sqldb.queryOneRow(sql.close_all_assessment_instances, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('22. save correct answer to saved question fossilFuelsRadio page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.question = helperExam.questions.fossilFuelsRadio;
                locals.postAction = 'save';
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: variant.true_answer.key,
                    };
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                locals.variant = _.clone(locals.savedVariant);
                locals.__csrf_token = locals.questionSavedCsrfToken;
            });
        });
        helperQuestion.postInstanceQuestionAndFail(locals);
    });

    describe('23. regrading', function() {
        describe('set forceMaxPoints = true for question addVectors', function() {
            it('should succeed', function(callback) {
                sqldb.query(sql.update_addVectors_force_max_points, [], function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
        helperQuestion.regradeAssessment(locals);
        describe('check the regrading succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addNumbers;
                    locals.expectedResult = {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 3,
                        instance_question_score_perc: 3/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addVectors;
                    locals.expectedResult = {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 11,
                        instance_question_score_perc: 11/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.fossilFuelsRadio;
                    locals.expectedResult = {
                        submission_score: null,
                        submission_correct: null,
                        instance_question_points: 0,
                        instance_question_score_perc: 0/17 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 14,
                        assessment_instance_score_perc: 14/helperExam.assessmentMaxPoints * 100,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('24. instance question score_perc uploads', function() {
        let csvData = 'uid,instance,qid,score_perc\ndev@illinois.edu,1,addNumbers,40\ndev@illinois.edu,1,addVectors,50\n';
        helperQuestion.uploadInstanceQuestionScores(locals, csvData);
        describe('check the instance question score upload succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addNumbers;
                    locals.expectedResult = {
                        instance_question_points: 2,
                        instance_question_score_perc: 2/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addVectors;
                    locals.expectedResult = {
                        instance_question_points: 5.5,
                        instance_question_score_perc: 5.5/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.fossilFuelsRadio;
                    locals.expectedResult = {
                        instance_question_points: 0,
                        instance_question_score_perc: 0/17 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 7.5,
                        assessment_instance_score_perc: 7.5/helperExam.assessmentMaxPoints * 100,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('25. instance question points uploads', function() {
        let csvData = 'uid,instance,qid,points\ndev@illinois.edu,1,addNumbers,4.7\ndev@illinois.edu,1,addVectors,1.2\n';
        helperQuestion.uploadInstanceQuestionScores(locals, csvData);
        describe('check the instance question score upload succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addNumbers;
                    locals.expectedResult = {
                        instance_question_points: 4.7,
                        instance_question_score_perc: 4.7/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addVectors;
                    locals.expectedResult = {
                        instance_question_points: 1.2,
                        instance_question_score_perc: 1.2/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.fossilFuelsRadio;
                    locals.expectedResult = {
                        instance_question_points: 0,
                        instance_question_score_perc: 0/17 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 5.9,
                        assessment_instance_score_perc: 5.9/helperExam.assessmentMaxPoints * 100,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('26. assessment instance score_perc uploads', function() {
        let csvData = 'uid,instance,score_perc\ndev@illinois.edu,1,43.7\n';
        helperQuestion.uploadAssessmentInstanceScores(locals, csvData);
        describe('check the assessment instance score upload succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addNumbers;
                    locals.expectedResult = {
                        instance_question_points: 4.7,
                        instance_question_score_perc: 4.7/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addVectors;
                    locals.expectedResult = {
                        instance_question_points: 1.2,
                        instance_question_score_perc: 1.2/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.fossilFuelsRadio;
                    locals.expectedResult = {
                        instance_question_points: 0,
                        instance_question_score_perc: 0/17 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 43.7 / 100 * helperExam.assessmentMaxPoints,
                        assessment_instance_score_perc: 43.7,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('27. assessment instance points uploads', function() {
        let csvData = 'uid,instance,points\ndev@illinois.edu,1,29.6\n';
        helperQuestion.uploadAssessmentInstanceScores(locals, csvData);
        describe('check the assessment instance score upload succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addNumbers;
                    locals.expectedResult = {
                        instance_question_points: 4.7,
                        instance_question_score_perc: 4.7/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.addVectors;
                    locals.expectedResult = {
                        instance_question_points: 1.2,
                        instance_question_score_perc: 1.2/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = helperExam.questions.fossilFuelsRadio;
                    locals.expectedResult = {
                        instance_question_points: 0,
                        instance_question_score_perc: 0/17 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 29.6,
                        assessment_instance_score_perc: 29.6 / helperExam.assessmentMaxPoints * 100,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    partialCreditTests.forEach(function(partialCreditTest, iPartialCreditTest) {

        describe(`partial credit test #${iPartialCreditTest+1}`, function() {
            describe('server', function() {
                it('should shut down', function(callback) {
                    debug('partial credit test: server shutting down');
                    var that = this;
                    // pass "this" explicitly to enable this.timeout() calls
                    helperServer.after.call(that, function(err) {
                        debug('partial credit test: server shutdown complete');
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
                it('should start up', function(callback) {
                    debug('partial credit test: server starting up');
                    var that = this;
                    // pass "this" explicitly to enable this.timeout() calls
                    helperServer.before.call(that, function(err) {
                        debug('partial credit test: server startup complete');
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            });

            helperExam.startExam(locals);

            partialCreditTest.forEach(function(questionTest, iQuestionTest) {
                describe(`${questionTest.action} answer number #${iQuestionTest+1} for question ${questionTest.qid} with score ${questionTest.score}`, function() {
                    describe('setting up the submission data', function() {
                        it('should succeed', function() {
                            if (questionTest.action == 'check-closed') {
                                locals.shouldHaveButtons = [];
                            } else {
                                locals.shouldHaveButtons = ['grade', 'save'];
                            }
                            locals.postAction = questionTest.action;
                            locals.question = helperExam.questions[questionTest.qid];
                            locals.question.points += questionTest.sub_points;
                            locals.totalPoints += questionTest.sub_points;
                            locals.expectedResult = {
                                submission_score: (questionTest.action == 'save') ? null : (questionTest.score / 100),
                                submission_correct: (questionTest.action == 'save') ? null : (questionTest.score == 100),
                                instance_question_points: locals.question.points,
                                instance_question_score_perc: locals.question.points/locals.question.maxPoints * 100,
                                assessment_instance_points: locals.totalPoints,
                                assessment_instance_score_perc: locals.totalPoints/helperExam.assessmentMaxPoints * 100,
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
