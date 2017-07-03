var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var handlebars = require('handlebars');
var cheerio = require('cheerio');

var elements = require('./freeformElements');

module.exports = {
    renderExtraHeaders: function(question, course, locals, callback) {
        callback(null, '');
    },

    renderFile: function(filename, variant, question, submission, course, locals, callback) {
        var question_data = {
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
            submitted_answer: submission ? submission.submitted_answer : null,
            feedback: submission ? submission.feedback : null,
            clientFilesQuestion: locals.paths.clientFilesQuestion,
            editable: locals.allowAnswerEditing,
        };
        this.execTemplate(filename, question_data, question, course, (err, question_data, html, $) => {
            if (ERR(err, callback)) return;

            let index = 0;
            async.eachSeries(elements, ([elementName, elementModule], callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    elementModule.render($, element, index, question_data, (err, elementHtml) => {
                        if (ERR(err, callback)) return;
                        $(element).replaceWith(elementHtml);
                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null, $.html());
            });
        });
    },

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        this.renderFile('question.html', variant, question, submission, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        this.renderFile('submission.html', variant, question, submission, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        this.renderFile('answer.html', variant, question, null, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    execPythonServer: function(pythonCmd, pythonArgs, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);

        var callData = {pythonCmd, pythonArgs, question, course};

        var cmdInput = {
            cmd: pythonCmd,
            args: pythonArgs,
            question_dir: question_dir,
        };
        try {
            var input = JSON.stringify(cmdInput);
        } catch (e) {
            var err = new Error('Error encoding question JSON');
            err.data = {endcodeMsg: e.message, callData};
            return ERR(err, callback);
        }
        var cmdOptions = {
            cwd: question_dir,
            input: input,
            timeout: 10000, // milliseconds
            killSignal: 'SIGKILL',
        };
        var cmd = 'python';
        var args = [__dirname + '/python_caller.py'];
        var child = child_process.spawn(cmd, args, cmdOptions);

        var outputStdout = '';
        var outputStderr = '';

        child.stdout.on('data', (data) => {
            outputStdout += data;
        });
        
        child.stderr.on('data', (data) => {
            outputStderr += data;
        });
        
        child.on('close', (code) => {
            let err, output;
            if (code) {
                err = new Error('Error in question code execution');
                err.data = {code, callData, outputStdout, outputStderr};
                return ERR(err, callback);
            }
            try {
                output = JSON.parse(outputStdout);
            } catch (e) {
                err = new Error('Error decoding question JSON');
                err.data = {decodeMsg: e.message, callData, outputStdout, outputStderr};
                return ERR(err, callback);
            }
            callback(null, output);
        });
        
        child.on('error', (error) => {
            let err = new Error('Error executing python question code');
            err.data = {execMsg: error.message, callData};
            return ERR(err, callback);
        });

        child.stdin.write(input);
        child.stdin.end();
    },

    makeHandlebars: function() {
        var hb = handlebars.create();
        return hb;
    },

    execTemplate: function(filename, question_data, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        var question_html = path.join(question_dir, filename);
        fs.readFile(question_html, {encoding: 'utf8'}, (err, data) => {
            if (ERR(err, callback)) return;
            try {
                var hb = this.makeHandlebars();
                var template = hb.compile(data);
            } catch (err) {
                err.data = {question_data, question, course};
                return ERR(err, callback);
            }
            var html;
            try {
                html = template(question_data);
            } catch (err) {
                err.data = {question_data, question, course};
                return ERR(err, callback);
            }
            var $;
            try {
                $ = cheerio.load(html, {
                    recognizeSelfClosing: true,
                });
            } catch (err) {
                err.data = {question_data, question, course};
                return ERR(err, callback);
            }
            callback(null, question_data, html, $);
        });
    },

    getData: function(question, course, variant_seed, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);

        var pythonArgs = {
            variant_seed: variant_seed,
            options: _.defaults({}, course.options, question.options),
            question_dir: question_dir,
        };
        this.execPythonServer('get_data', pythonArgs, question, course, (err, result) => {
            if (ERR(err, callback)) return;
            var question_data = result.question_data;
            _.defaults(question_data.options, course.options, question.options);
            question_data.params = question_data.params || {};
            question_data.params._gradeSubmission = question_data.params._gradeSubmission || {};
            question_data.params._weights = question_data.params._weights || {};
            question_data.true_answer = question_data.true_answer || {};
            this.execTemplate('question.html', question_data, question, course, (err, question_data, html, $) => {
                if (ERR(err, callback)) return;

                let index = 0;
                async.eachSeries(elements, ([elementName, elementModule], callback) => {
                    async.eachSeries($(elementName).toArray(), (element, callback) => {
                        elementModule.prepare($, element, parseInt(variant_seed, 36), index, question_data, (err) => {
                            if (ERR(err, callback)) return;
                            index++;
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, question_data);
                });
            });
        });
    },

    getFile: function(filename, variant, question, course, callback) {
        callback(new Error('not implemented'));
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        const question_data = {
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
            submitted_answer: submission.submitted_answer,
        };
        let component_scores = {}, component_feedbacks = {};
        async.mapValuesSeries(question_data.params._gradeSubmission, (element, name, callback) => {
            if (!elements.has(element)) return callback(null, {score: 0, feedback: 'Invalid element name: ' + element});
            elementModule = elements.get(element);
            elementModule.gradeSubmission(name, question_data, question, course, (err, elementGrading) => {
                if (ERR(err, callback)) return;
                callback(null, elementGrading);
            });
        }, (err, elementGradings) => {
            if (ERR(err, callback)) return;
            const feedback = {
                _component_scores: _.mapValues(elementGradings, 'score'),
                _component_feedbacks: _.mapValues(elementGradings, 'feedback'),
            }
            let total_weight = 0, total_weight_score = 0;
            _.each(feedback._component_scores, (score, key) => {
                const weight = _.get(question_data, ['params', '_weights', key], 1);
                total_weight += weight;
                total_weight_score += weight * score;
            });
            const score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
            const correct = (score >= 1);
            const grading = {score, feedback, correct};

            // FIXME: compute tentative score/feedback from components
            // FIXME: call server.gradeSubmission()

            // FIXME: rationalize block/element/component
            // FIXME: rationalize element attrib/name verus name/type
        
            callback(null, grading);
        });
    },
};
