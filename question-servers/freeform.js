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

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        var question_data = {
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
            submitted_answer: submission ? submission.submitted_answer : null,
            feedback: submission ? submission.feedback : null,
            clientFilesQuestion: locals.paths.clientFilesQuestion,
        };
        this.execTemplate(question_data, question, course, (err, question_data, html, $) => {
            if (ERR(err, callback)) return;

            let index = 0;
            async.eachSeries(elements, ([elementName, elementModule], callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    elementModule.render($, element, index, question_data, (err, elementHtml) => {
                        if (ERR(err, callback)) return;
                        $(element).replaceWith(elementHtml);
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

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        callback(new Error('not implemented'));
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        callback(new Error('not implemented'));
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

    execTemplate: function(question_data, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        var question_html = path.join(question_dir, 'question.html');
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
                $ = cheerio.load(html);
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
            this.execTemplate(question_data, question, course, (err, question_data, html, $) => {
                if (ERR(err, callback)) return;

                let index = 0;
                async.eachSeries(elements, ([elementName, elementModule], callback) => {
                    async.eachSeries($(elementName).toArray(), (element, callback) => {
                        elementModule.prepare($, element, parseInt(variant_seed, 36), index, question_data, (err) => {
                            if (ERR(err, callback)) return;
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
        return {
            score: 0,
            correct: false,
            feedback: {},
        };
    },
};
