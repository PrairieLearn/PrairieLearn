const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

let page, elemList;

module.exports = {

    waitForJobSequence(locals) {
        describe('The job sequence', function() {
            it('should have an id', function(callback) {
                sqldb.queryOneRow(sql.select_last_job_sequence, [], (err, result) => {
                    if (ERR(err, callback)) return;
                    locals.job_sequence_id = result.rows[0].id;
                    callback(null);
                });
            });
            it('should complete', function(callback) {
                var checkComplete = function() {
                    var params = {job_sequence_id: locals.job_sequence_id};
                    sqldb.queryOneRow(sql.select_job_sequence, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        locals.job_sequence = result.rows[0];
                        if (locals.job_sequence.status == 'Running') {
                            setTimeout(checkComplete, 10);
                        } else {
                            callback(null);
                        }
                    });
                };
                setTimeout(checkComplete, 10);
            });
            it('should be successful', async () => {
                if (locals.job_sequence.status != 'Success') {
                    console.log(locals.job_sequence);
                    const params = {job_sequence_id: locals.job_sequence_id};
                    const result = await sqldb.queryAsync(sql.select_jobs, params);
                    console.log(result.rows);
                }
                assert.equal(locals.job_sequence.status, 'Success');
            });
        });
    },

    getInstanceQuestion(locals) {
        describe('GET to instance_question URL', function() {
            it('should load successfully', function(callback) {
                var questionUrl = locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
                request(questionUrl, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should contain question-data if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                elemList = locals.$('.question-data');
                assert.lengthOf(elemList, 1);
            });
            it('question-data should contain base64 data of Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                assert.nestedProperty(elemList[0], 'children.0.data');
                assert.lengthOf(elemList[0].children, 1);
                assert.property(elemList[0].children[0], 'data');
            });
            it('base64 data should parse to JSON if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                locals.questionData = JSON.parse(decodeURIComponent(Buffer.from(elemList[0].children[0].data, 'base64').toString()));
            });
            it('should have a variant_id in the questionData if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                assert.nestedProperty(locals.questionData, 'variant.id');
                locals.variant_id = locals.questionData.variant.id;
            });
            it('should have a variant_id input if Freeform with grade or save buttons', function() {
                if (locals.question.type != 'Freeform') return;
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return;
                elemList = locals.$('.question-form input[name="__variant_id"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.variant_id = elemList[0].attribs.value;
                locals.variant_id = Number.parseInt(locals.variant_id);
            });
            it('should have the variant in the DB if has grade or save button', function(callback) {
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return callback(null);
                var params = {
                    variant_id: locals.variant_id,
                };
                sqldb.queryOneRow(sql.select_variant, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.variant = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct variant.instance_question.id if has grade or save button and is student page', function() {
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return;
                if (!locals.isStudentPage) return;
                assert.equal(locals.variant.instance_question_id, locals.question.id);
            });
            it('should have the correct variant.question.id if has grade or save button and is instructor page', function() {
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return;
                if (locals.isStudentPage) return;
                assert.equal(locals.variant.question_id, locals.question.id);
            });
            it('should not be a broken variant if Freeform with grade or save button', function() {
                if (locals.question.type != 'Freeform') return;
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return;
                assert.equal(locals.variant.broken, false);
            });
            it('should have a CSRF token if has grade or save button', function() {
                if (!locals.shouldHaveButtons.includes('grade') && !locals.shouldHaveButtons.includes('save')) return;
                elemList = locals.$('.question-form input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
            it('should have or not have grade button', function() {
                if (locals.question.type == 'Freeform') {
                    elemList = locals.$('button[name="__action"][value="grade"]');
                    if (locals.shouldHaveButtons.includes('grade')) {
                        assert.lengthOf(elemList, 1);
                    } else {
                        assert.lengthOf(elemList, 0);
                    }
                } else {
                    elemList = locals.$('button.question-grade');
                    if (locals.shouldHaveButtons.includes('grade')) {
                        assert.lengthOf(elemList, 1);
                    } else {
                        assert.lengthOf(elemList, 0);
                    }
                }
            });
            it('should have or not have save button', function() {
                if (locals.question.type == 'Freeform') {
                    elemList = locals.$('button[name="__action"][value="save"]');
                    if (locals.shouldHaveButtons.includes('save')) {
                        assert.lengthOf(elemList, 1);
                    } else {
                        assert.lengthOf(elemList, 0);
                    }
                } else {
                    elemList = locals.$('button.question-save');
                    if (locals.shouldHaveButtons.includes('save')) {
                        assert.lengthOf(elemList, 1);
                    } else {
                        assert.lengthOf(elemList, 0);
                    }
                }
            });
            it('should have or not have newVariant button', function() {
                elemList = locals.$('a:contains(New variant)');
                if (locals.shouldHaveButtons.includes('newVariant')) {
                    assert.lengthOf(elemList, 1);
                } else {
                    assert.lengthOf(elemList, 0);
                }
            });
            it('should have or not have tryAgain button', function() {
                elemList = locals.$('a:contains(Try question again)');
                if (locals.shouldHaveButtons.includes('tryAgain')) {
                    assert.lengthOf(elemList, 1);
                } else {
                    assert.lengthOf(elemList, 0);
                }
            });
        });
    },

    postInstanceQuestion(locals) {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
            });
            it('should load successfully', function(callback) {
                let form;
                if (locals.question.type == 'Calculation') {
                    form = {
                        __action: locals.postAction,
                        __csrf_token: locals.__csrf_token,
                        postData: JSON.stringify({variant: locals.variant, submittedAnswer: locals.submittedAnswer}),
                    };
                } else if (locals.question.type == 'Freeform') {
                    form = {
                        __action: locals.postAction,
                        __csrf_token: locals.__csrf_token,
                        __variant_id: locals.variant.id,
                    };
                    _.assign(form, locals.submittedAnswer);
                } else {
                    throw Error('bad question.type:' + locals.question.type);
                }
                var questionUrl = locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
                locals.preEndTime = Date.now();
                request.post({url: questionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    locals.postEndTime = Date.now();
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should create a submission', function(callback) {
                var params = {variant_id: locals.variant.id};
                sqldb.query(sql.select_last_submission, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one submission, got: ' + result.rowCount));
                    }
                    locals.submission = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct submission.variant_id', function() {
                assert.equal(locals.submission.variant_id, locals.variant.id);
            });
            it('should not be broken if Freeform', function() {
                if (locals.question.type != 'Freeform') return;
                assert.equal(locals.submission.broken, false);
            });
            it('should select the assessment_instance duration from the DB if student page', function(callback) {
                if (!locals.isStudentPage) return callback(null);
                sqldb.query(sql.select_assessment_instance_durations, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one row, got: ' + result.rowCount));
                    }
                    locals.assessment_instance_duration = result.rows[0].duration;
                    callback(null);
                });
            });
            it('should have the correct assessment_instance duration if student page', function() {
                if (!locals.isStudentPage) return;
                var min_duration = (locals.preEndTime - locals.postStartTime) / 1000;
                var max_duration = (locals.postEndTime - locals.preStartTime) / 1000;
                assert.isAbove(locals.assessment_instance_duration, min_duration);
                assert.isBelow(locals.assessment_instance_duration, max_duration);
            });
        });
    },

    postInstanceQuestionAndFail(locals) {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
            });
            it('should error', function(callback) {
                let form;
                if (locals.question.type == 'Calculation') {
                    form = {
                        __action: locals.postAction,
                        __csrf_token: locals.__csrf_token,
                        postData: JSON.stringify({variant: locals.variant, submittedAnswer: locals.submittedAnswer}),
                    };
                } else if (locals.question.type == 'Freeform') {
                    form = {
                        __action: locals.postAction,
                        __csrf_token: locals.__csrf_token,
                        variant_id: locals.variant.id,
                    };
                    _.assign(form, locals.submittedAnswer);
                } else {
                    throw Error('bad question.type:' + locals.question.type);
                }
                var questionUrl = locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
                request.post({url: questionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 400 && response.statusCode != 500) {
                        return callback(new Error('bad status (expected 400 or 500): ' + response.statusCode));
                    }
                    page = body;
                    callback(null);
                });
            });
        });
    },

    checkSubmissionScore(locals) {
        describe('check submission score', function() {
            it('should have the submission', function(callback) {
                var params = {
                    question_id: locals.question.id,
                };
                sqldb.queryOneRow(sql.select_last_submission_for_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.submission = result.rows[0];
                    callback(null);
                });
            });
            it('should be graded with expected score', function() {
                assert.equal(locals.submission.score, locals.expectedResult.submission_score);
            });
            it('should be graded with expected correctness', function() {
                assert.equal(locals.submission.correct, locals.expectedResult.submission_correct);
            });
        });
    },

    checkQuestionScore(locals) {
        describe('check question score', function() {
            it('should have the submission', function(callback) {
                if (!_.has(locals.expectedResult, 'submission_score')) return callback(null); // skip check
                var params = {
                    instance_question_id: locals.question.id,
                };
                sqldb.queryOneRow(sql.select_last_submission_for_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.submission = result.rows[0];
                    callback(null);
                });
            });
            it('should be graded with expected score', function() {
                if (!_.has(locals.expectedResult, 'submission_score')) return; // skip check
                assert.equal(locals.submission.score, locals.expectedResult.submission_score);
            });
            it('should be graded with expected correctness', function() {
                if (!_.has(locals.expectedResult, 'submission_score')) return; // skip check
                assert.equal(locals.submission.correct, locals.expectedResult.submission_correct);
            });
            it('should still have the instance_question', function(callback) {
                var params = {
                    instance_question_id: locals.question.id,
                };
                sqldb.queryOneRow(sql.select_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.instance_question = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct instance_question points', function() {
                assert.approximately(locals.instance_question.points, locals.expectedResult.instance_question_points, 1e-6);
            });
            it('should have the correct instance_question score_perc', function() {
                assert.approximately(locals.instance_question.score_perc, locals.expectedResult.instance_question_score_perc, 1e-6);
            });
        });
    },

    checkAssessmentScore(locals) {
        describe('check assessment score', function() {
            it('should still have the assessment_instance', function(callback) {
                var params = {
                    assessment_instance_id: locals.assessment_instance.id,
                };
                sqldb.queryOneRow(sql.select_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_instance = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct assessment_instance points', function() {
                assert.approximately(locals.assessment_instance.points, locals.expectedResult.assessment_instance_points, 1e-6);
            });
            it('should have the correct assessment_instance score_perc', function() {
                assert.approximately(locals.assessment_instance.score_perc, locals.expectedResult.assessment_instance_score_perc, 1e-6);
            });
        });
    },

    checkQuestionFeedback(locals) {
        describe('check question feedback', function() {
            it('should still have ', function(callback) {
                var params = {
                    assessment_instance_id: locals.assessment_instance.id,
                    qid: locals.expectedFeedback.qid,
                    submission_id: locals.expectedFeedback.submission_id || null,
                };
                sqldb.queryOneRow(sql.select_question_feedback, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.question_feedback = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct feedback', function() {
                for (const p in locals.expectedFeedback.feedback) {
                    assert.deepEqual(locals.question_feedback.feedback[p], locals.expectedFeedback.feedback[p]);
                }
            });
        });
    },

    regradeAssessment(locals) {
        describe('GET to instructorAssessmentRegrading URL', function() {
            it('should succeed', function(callback) {
                locals.instructorAssessmentRegradingUrl = locals.courseInstanceBaseUrl + '/instructor/assessment/' + locals.assessment_id + '/regrading';
                request({url: locals.instructorAssessmentRegradingUrl}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = locals.$('form[name="regrade-all-form"] input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
        });
        describe('POST to instructorAssessmentRegrading URL for regrading', function() {
            it('should succeed', function(callback) {
                var form = {
                    __action: 'regrade_all',
                    __csrf_token: locals.__csrf_token,
                };
                request.post({url: locals.instructorAssessmentRegradingUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    callback(null);
                });
            });
        });
        module.exports.waitForJobSequence(locals);
    },

    uploadInstanceQuestionScores(locals) {
        describe('GET to instructorAssessmentUploads URL', function() {
            it('should succeed', function(callback) {
                locals.instructorAssessmentUploadsUrl = locals.courseInstanceBaseUrl + '/instructor/assessment/' + locals.assessment_id + '/uploads';
                request({url: locals.instructorAssessmentUploadsUrl}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        console.log(response);
                        console.log(body);
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = locals.$('form[name="upload-instance-question-scores-form"] input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
        });
        describe('POST to instructorAssessmentUploads URL for upload', function() {
            it('should succeed', function(callback) {
                var formData = {
                    __action: 'upload_instance_question_scores',
                    __csrf_token: locals.__csrf_token,
                    file: {
                        value: locals.csvData,
                        options: {
                            filename: 'data.csv',
                            contentType: 'text/csv',
                        },
                    },
                };
                request.post({url: locals.instructorAssessmentUploadsUrl, formData: formData, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        console.log(response);
                        console.log(body);
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    callback(null);
                });
            });
        });
        module.exports.waitForJobSequence(locals);
    },

    uploadAssessmentInstanceScores(locals) {
        describe('GET to instructorAssessmentUploads URL', function() {
            it('should succeed', function(callback) {
                locals.instructorAssessmentUploadsUrl = locals.courseInstanceBaseUrl + '/instructor/assessment/' + locals.assessment_id + '/uploads';
                request({url: locals.instructorAssessmentUploadsUrl}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        console.log(response);
                        console.log(body);
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = locals.$('form[name="upload-assessment-instance-scores-form"] input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
        });
        describe('POST to instructorAssessmentUploads URL for upload', function() {
            it('should succeed', function(callback) {
                var formData = {
                    __action: 'upload_assessment_instance_scores',
                    __csrf_token: locals.__csrf_token,
                    file: {
                        value: locals.csvData,
                        options: {
                            filename: 'data.csv',
                            contentType: 'text/csv',
                        },
                    },
                };
                request.post({url: locals.instructorAssessmentUploadsUrl, formData: formData, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        console.log(response);
                        console.log(body);
                        return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                    }
                    callback(null);
                });
            });
        });
        module.exports.waitForJobSequence(locals);
    },

    autoTestQuestion(locals, qid) {
        describe('auto-testing question ' + qid, function() {
            describe('the setup', function() {
                it('should find the question in the database', function(callback) {
                    sqldb.queryZeroOrOneRow(sql.select_question_by_qid, {qid}, function(err, result) {
                        if (ERR(err, callback)) return;
                        if (result.rowCount == 0) {
                            return callback(new Error(`QID "${qid}" not found in the database`));
                        }
                        locals.question = result.rows[0];
                        callback(null);
                    });
                });
                it('should be a Freeform question', function() {
                    assert.equal(locals.question.type, 'Freeform');
                });
                it('should have submission data', function() {
                    locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
                    locals.postAction = 'grade';
                });
            });
            module.exports.getInstanceQuestion(locals);
            describe('the question variant', function() {
                it('should produce no issues', function(callback) {
                    sqldb.query(sql.select_issues_for_last_variant, [], (err, result) => {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) {
                            callback(new Error(`found ${result.rowCount} issues (expected zero issues):\n`
                                               + JSON.stringify(result.rows, null, '    ')));
                            return;
                        }
                        callback(null);
                    });
                });
            });
            describe('GET to instructor question settings URL', function() {
                it('should load successfully', function(callback) {
                    const questionUrl = locals.questionBaseUrl + '/' + locals.question.id + (locals.questionSettingsTabUrl || '');
                    request(questionUrl, function (error, response, body) {
                        if (error) {
                            return callback(error);
                        }
                        if (response.statusCode != 200) {
                            return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                        }
                        page = body;
                        callback(null);
                    });
                });
                it('should parse', function() {
                    locals.$ = cheerio.load(page);
                });
                it('should have a CSRF token', function() {
                    elemList = locals.$('form[name="question-tests-form"] input[name="__csrf_token"]');
                    assert.lengthOf(elemList, 1);
                    assert.nestedProperty(elemList[0], 'attribs.value');
                    locals.__csrf_token = elemList[0].attribs.value;
                    assert.isString(locals.__csrf_token);
                });
            });
            describe('the test job sequence', function() {
                it('should start with POST to instructor question settings URL for test_once', function(callback) {
                    const form = {
                        __action: 'test_once',
                        __csrf_token: locals.__csrf_token,
                    };
                    var questionUrl = locals.questionBaseUrl + '/' + locals.question.id + (locals.questionSettingsTabUrl || '');
                    request.post({url: questionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                        if (error) {
                            return callback(error);
                        }
                        if (response.statusCode != 200) {
                            return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                        }
                        callback(null);
                    });
                });
                it('should have an id', function(callback) {
                    sqldb.queryOneRow(sql.select_last_job_sequence, [], (err, result) => {
                        if (ERR(err, callback)) return;
                        locals.job_sequence_id = result.rows[0].id;
                        callback(null);
                    });
                });
                it('should complete', function(callback) {
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
                it('should be successful', function() {
                    assert.equal(locals.job_sequence_status, 'Success');
                });
                it('should produce no issues', function(callback) {
                    sqldb.query(sql.select_issues_for_last_variant, [], (err, result) => {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) {
                            callback(new Error(`found ${result.rowCount} issues (expected zero issues):\n`
                                               + JSON.stringify(result.rows, null, '    ')));
                            return;
                        }
                        callback(null);
                    });
                });
            });
        });
    },
};
