var ERR = require('async-stacktrace');
var path = require('path');
var _ = require('lodash');

var error = require('@prairielearn/prairielib/error');
var filePaths = require('../lib/file-paths');
var requireFrontend = require('../lib/require-frontend');

module.exports = {
    loadServer: function(question, course, callback) {
        filePaths.questionFilePath('server.js', question.directory, course.path, question, function(err, questionServerPath) {
            if (ERR(err, callback)) return;
            var configRequire = requireFrontend.config({
                paths: {
                    clientFilesCourse: path.join(course.path, 'clientFilesCourse'),
                    serverFilesCourse: path.join(course.path, 'serverFilesCourse'),
                    clientCode: path.join(course.path, 'clientFilesCourse'),
                    serverCode: path.join(course.path, 'serverFilesCourse'),
                },
            });
            configRequire([questionServerPath], function(server) {
                if (server === undefined) return callback('Unable to load "server.js" for qid: ' + question.qid);
                setTimeout(function() {
                    // use a setTimeout() to get out of requireJS error handling
                    return callback(null, server);
                }, 0);
            });
        });
    },

    render: function(renderSelection, variant, question, submission, submissions, course, course_instance, locals, callback) {
        const htmls = {
            extraHeadersHtml: '',
            questionHtml: '',
            submissionHtmls: _.map(submissions, () => ''),
            answerHtml: '',
        };
        callback(null, [], htmls);
    },

    generate: function(question, course, variant_seed, callback) {
        var questionDir = path.join(course.path, 'questions', question.directory);
        module.exports.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var options = question.options || {};
            try {
                var vid = variant_seed;
                var questionData = server.getData(vid, options, questionDir);
            } catch (err) {
                let data = {
                    variant_seed: variant_seed,
                    question: question,
                    course: course,
                };
                err.status = 500;
                return ERR(error.addData(err, data), callback);
            }
            let data = {
                params: questionData.params,
                true_answer: questionData.trueAnswer,
                options: questionData.options || question.options || {},
            };
            callback(null, [], data);
        });
    },

    prepare: function(question, course, variant, callback) {
        const data = {
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
        };
        callback(null, [], data);
    },

    getFile: function(filename, variant, question, course, callback) {
        module.exports.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var fileData;
            try {
                var vid = variant.variant_seed;
                var params = variant.params;
                var trueAnswer = variant.true_answer;
                var options = variant.options;
                var questionDir = path.join(course.path, 'questions', question.directory);
                fileData = server.getFile(filename, vid, params, trueAnswer, options, questionDir);
            } catch (err) {
                var data = {
                    variant: variant,
                    question: question,
                    course: course,
                };
                err.status = 500;
                return ERR(error.addData(err, data), callback);
            }
            callback(null, fileData);
        });
    },

    parse: function(submission, variant, question, course, callback) {
        const data = {
            params: variant.params,
            true_answer: variant.true_answer,
            submitted_answer: submission.submitted_answer,
            raw_submitted_answer: submission.raw_submitted_answer,
            format_errors: {},
            gradable: true,
        };
        callback(null, [], data);
    },

    grade: function(submission, variant, question, course, callback) {
        module.exports.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var grading;
            try {
                var vid = variant.variant_seed;
                var params = variant.params;
                var trueAnswer = variant.true_answer;
                var submittedAnswer = submission.submitted_answer;
                var options = variant.options;
                var questionDir = path.join(course.path, 'questions', question.directory);
                grading = server.gradeAnswer(vid, params, trueAnswer, submittedAnswer, options, questionDir);
            } catch (err) {
                const data = {
                    submission: submission,
                    variant: variant,
                    question: question,
                    course: course,
                };
                err.status = 500;
                return ERR(error.addData(err, data), callback);
            }

            let score = grading.score;
            if (!question.partial_credit) {
                // legacy Calculation questions round the score to 0 or 1 (with 0.5 rounding up)
                score = (grading.score >= 0.5) ? 1 : 0;
            }
            const data = {
                score: score,
                v2_score: grading.score,
                feedback: grading.feedback,
                partial_scores: {},
                submitted_answer: submission.submitted_answer,
                format_errors: {},
                gradable: true,
                params: variant.params,
                true_answer: variant.true_answer,
            };
            callback(null, [], data);
        });
    },
};
