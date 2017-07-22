var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var handlebars = require('handlebars');
var cheerio = require('cheerio');

var elements = require('./elements');

module.exports = {
    elementFunction: function(fcn, elementName, $, element, index, question_data, callback) {
        const jsArgs = [$, element, index, question_data];
        const elementHtml = $(element).clone().wrap('<container/>').parent().html();
        const pythonArgs = [elementHtml, index, question_data];
        if (!elements.has(elementName)) {
            return callback(null, 'ERROR: invalid element name: ' + elementName);
        }
        const elementModule = elements.get(elementName);
        if (_.isString(elementModule)) {
            // python module
            const pythonFile = elementModule.replace(/\.[pP][yY]$/, '');
            const pythonCwd = path.join(__dirname, 'elements');
            this.execPython(pythonFile, fcn, pythonArgs, pythonCwd, (err, ret, consoleLog) => {
                if (ERR(err, callback)) return;
                callback(null, ret, consoleLog);
            });
        } else {
            // JS module
            elementModule[fcn](...jsArgs, (err, ret) => {
                if (ERR(err, callback)) return;
                callback(null, ret, '');
            });
        }
    },

    renderExtraHeaders: function(question, course, locals, callback) {
        callback(null, '');
    },

    execPython: function(pythonFile, pythonFunction, pythonArgs, pythonCwd, callback) {
        var cmdInput = {
            file: pythonFile,
            fcn: pythonFunction,
            args: pythonArgs,
            cwd: pythonCwd,
            pylibdir: path.join(__dirname, 'freeformPythonLib'),
        };
        try {
            var input = JSON.stringify(cmdInput);
        } catch (e) {
            var err = new Error('Error encoding question JSON');
            err.data = {endcodeMsg: e.message, cmdInput};
            return ERR(err, callback);
        }
        var cmdOptions = {
            cwd: pythonCwd,
            input: input,
            timeout: 10000, // milliseconds
            killSignal: 'SIGKILL',
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
        };
        var cmd = 'python';
        var args = [__dirname + '/python_caller.py'];
        var child = child_process.spawn(cmd, args, cmdOptions);

        child.stderr.setEncoding('utf8');
        child.stdout.setEncoding('utf8');
        child.stdio[3].setEncoding('utf8');

        var outputStdout = '';
        var outputStderr = '';
        var outputBoth = '';
        var outputData = '';

        child.stdout.on('data', (data) => {
            outputStdout += data;
            outputBoth += data;

            // Temporary fix to write stderr to console while waiting for this
            // to be displayed in browser
            /* eslint-disable no-console */
            console.log('FIXME');
            console.log(data);
            /* eslint-enable no-console */
        });

        child.stderr.on('data', (data) => {
            outputStderr += data;
            outputBoth += data;

            // Temporary fix to write stderr to console while waiting for this
            // to be displayed in browser
            /* eslint-disable no-console */
            console.log('FIXME');
            console.log(data);
            /* eslint-enable no-console */
        });

        child.stdio[3].on('data', (data) => {
            outputData += data;
        });

        var callbackCalled = false;

        child.on('close', (code) => {
            let err, output;
            if (code) {
                err = new Error('Error in question code execution');
                err.data = {code, cmdInput, outputStdout, outputStderr, outputData};
                if (!callbackCalled) {
                    callbackCalled = true;
                    return ERR(err, callback);
                } else {
                    // FIXME: silently swallowing the error here
                    return;
                }
            }
            try {
                output = JSON.parse(outputData);
            } catch (e) {
                err = new Error('Error decoding question JSON');
                err.data = {decodeMsg: e.message, cmdInput, outputStdout, outputStderr, outputData};
                if (!callbackCalled) {
                    callbackCalled = true;
                    return ERR(err, callback);
                } else {
                    // FIXME: silently swallowing the error here
                    return;
                }
            }
            if (!callbackCalled) {
                callbackCalled = true;
                callback(null, output, outputBoth);
            } else {
                // FIXME: silently swallowing the output here
                return;
            }
        });

        child.on('error', (error) => {
            let err = new Error('Error executing python question code');
            err.data = {execMsg: error.message, cmdInput};
            if (!callbackCalled) {
                callbackCalled = true;
                return ERR(err, callback);
            } else {
                // FIXME: silently swallowing the error here
                return;
            }
        });

        child.stdin.write(input);
        child.stdin.end();
    },

    execPythonServer: function(pythonFunction, pythonArgs, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        this.execPython('server', pythonFunction, pythonArgs, question_dir, (err, output) => {
            if (ERR(err, callback)) return;
            callback(null, output);
        });
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

    checkQuestionData: function(question_data) {
        const checkedProps = [];
        const checkProp = (prop, type) => {
            if (!_.has(question_data, prop)) return '"' + prop + '" is missing from question_data';
            if (type == 'integer') {
                if (!_.isInteger(question_data[prop])) {
                    return 'question_data.' + prop + ' is not an integer: ' + String(question_data[prop]);
                }
            } else if (type == 'number') {
                if (!_.isFinite(question_data[prop])) {
                    return 'question_data.' + prop + ' is not a number: ' + String(question_data[prop]);
                }
            } else if (type == 'string') {
                if (!_.isString(question_data[prop])) {
                    return 'question_data.' + prop + ' is not a string: ' + String(question_data[prop]);
                }
            } else if (type == 'boolean') {
                if (!_.isBoolean(question_data[prop])) {
                    return 'question_data.' + prop + ' is not a boolean: ' + String(question_data[prop]);
                }
            } else if (type == 'object') {
                if (!_.isObject(question_data[prop])) {
                    return 'question_data.' + prop + ' is not an object: ' + String(question_data[prop]);
                }
            } else {
                return 'invalid type: ' + String(type);
            }
            checkedProps.push(prop);
            return null;
        };

        let err;
        err = checkProp('variant_seed', 'integer'); if (err) return err;
        err = checkProp('options', 'object'); if (err) return err;
        err = checkProp('params', 'object'); if (err) return err;
        err = checkProp('true_answer', 'object'); if (err) return err;
        err = checkProp('editable', 'boolean'); if (err) return err;
        err = checkProp('partial_scores', 'object'); if (err) return err;
        err = checkProp('raw_submitted_answer', 'object'); if (err) return err;
        err = checkProp('submitted_answer', 'object'); if (err) return err;
        err = checkProp('parse_errors', 'object'); if (err) return err;
        err = checkProp('score', 'number'); if (err) return err;
        err = checkProp('feedback', 'object'); if (err) return err;
        err = checkProp('panel', 'string'); if (err) return err;

        const extraProps = _.difference(_.keys(question_data), checkedProps);
        if (extraProps.length > 0) return 'question_data has invalid extra keys: ' + ', '.join(extraProps);
        return null;
    },

    getData: function(question, course, variant_seed, callback) {
        let question_dir = path.join(course.path, 'questions', question.directory);

        let pythonArgs = {
            variant_seed: parseInt(variant_seed, 36),
            options: _.defaults({}, course.options, question.options),
            question_dir: question_dir,
        };
        let consoleLog = '';
        /*
        let question_data = {
            variant_seed: parseInt(variant_seed, 36),
            options: _.defaults({}, course.options, question.options),
        }

        // FIXME: pass question_data to get_data(), rather than just returning it
        */

        this.execPythonServer('get_data', pythonArgs, question, course, (err, ret_question_data, ret_consoleLog) => {
            if (ERR(err, callback)) return;
            if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;

            var question_data = ret_question_data;
            question_data.variant_seed = parseInt(variant_seed, 36);
            question_data.options = question_data.options || {};
            _.defaults(question_data.options, course.options, question.options);

            question_data = _.defaults(question_data, {
                params: {},
                true_answer: {},
                editable: false,
                partial_scores: {},
                raw_submitted_answer: {},
                submitted_answer: {},
                parse_errors: {},
                score: 0,
                feedback: {},
                panel: 'question',
            });
            const checkErr = module.exports.checkQuestionData(question_data);
            if (err) {
                const err = new Error('Invalid question_data after server.get_data(): ' + checkErr);
                err.data = {question_data, question, course};
                return callback(err);
            }

            this.execTemplate('question.html', question_data, question, course, (err, question_data, html, $) => {
                if (ERR(err, callback)) return;

                let index = 0;
                async.eachSeries(elements.keys(), (elementName, callback) => {
                    async.eachSeries($(elementName).toArray(), (element, callback) => {
                        this.elementFunction('prepare', elementName, $, element, index, question_data, (err, new_question_data, ret_consoleLog) => {
                            if (ERR(err, callback)) return;
                            question_data = new_question_data;
                            const checkErr = module.exports.checkQuestionData(question_data);
                            if (checkErr) {
                                const err = new Error('Invalid question_data after element ' + index + ' ' + elementName + '.prepare(): ' + checkErr);
                                err.data = {question_data, question, course};
                                return callback(err);
                            }
                            if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                            index++;
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, question_data, consoleLog);
                });
            });
        });
    },

    getFile: function(filename, variant, question, course, callback) {
        callback(new Error('not implemented'));
    },

    renderFile: function(filename, panel, variant, question, submission, course, locals, callback) {
        var question_data = {
            variant_seed: parseInt(variant.variant_seed, 36),
            params: _.get(variant, 'params', {}),
            true_answer: _.get(variant, 'true_answer', {}),
            options: _.get(variant, 'options', {}),
            editable: !!locals.allowAnswerEditing,
            partial_scores: submission ? _.get(submission, 'partial_scores', {}) : {},
            raw_submitted_answer: submission ? _.get(submission, 'raw_submitted_answer', {}) : {},
            submitted_answer: submission ? _.get(submission, 'submitted_answer', {}) : {},
            parse_errors: submission ? _.get(submission, 'parse_errors', {}) : {},
            score: submission ? _.get(submission, 'score', 0) : 0,
            feedback: submission ? _.get(submission, 'feedback', {}) : {},
            panel: panel,
        };
        question_data.options.client_files_question_url = locals.paths.clientFilesQuestion;
        let consoleLog = '';

        const checkErr = module.exports.checkQuestionData(question_data);
        if (checkErr) {
            const err = new Error('Invalid question_data before render: ' + checkErr);
            err.data = {question_data, submission, variant, question, course};
            return callback(err);
        }

        this.execTemplate(filename, question_data, question, course, (err, question_data, html, $) => {
            if (ERR(err, callback)) return;

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction('render', elementName, $, element, index, question_data, (err, elementHtml, ret_consoleLog) => {
                        if (ERR(err, callback)) return;
                        $(element).replaceWith(elementHtml);
                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null, $.html(), consoleLog);
            });
        });
    },

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        this.renderFile('question.html', 'question', variant, question, submission, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        this.renderFile('question.html', 'submission', variant, question, submission, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        this.renderFile('question.html', 'answer', variant, question, null, course, locals, (err, html) => {
            if (ERR(err, callback)) return;
            callback(null, html);
        });
    },

    parseSubmission: function(submission, variant, question, course, callback) {
        const question_data = {
            variant_seed: parseInt(variant.variant_seed, 36),
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
            raw_submitted_answer: submission.raw_submitted_answer || {},
            submitted_answer: submission.submitted_answer || {},
            parse_errors: {},
            editable: false,
            partial_scores: {},
            score: 0,
            feedback: {},
            panel: 'question',
        };
        var consoleLog = '';

        const checkErr = module.exports.checkQuestionData(question_data);
        if (checkErr) {
            const err = new Error('Invalid question_data before parse: ' + checkErr);
            err.data = {question_data, submission, variant, question, course};
            return callback(err);
        }

        this.execTemplate('question.html', question_data, question, course, (err, question_data, html, $) => {
            if (ERR(err, callback)) return;

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction('parse', elementName, $, element, index, question_data, (err, new_question_data, ret_consoleLog) => {
                        if (ERR(err, callback)) return;
                        question_data = new_question_data;
                        const checkErr = module.exports.checkQuestionData(question_data);
                        if (checkErr) {
                            const err = new Error('Invalid question_data after element ' + index + ' ' + elementName + '.parse(): ' + checkErr);
                            err.data = {question_data, submission, variant, question, course};
                            return callback(err);
                        }
                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;

                let checkErr = module.exports.checkQuestionData(question_data);
                if (checkErr) {
                    const err = new Error('Invalid question_data before server.parse(): ' + checkErr);
                    err.data = {question_data, submission, variant, question, course};
                    return callback(err);
                }
                // FIXME: call server.parse()
                checkErr = module.exports.checkQuestionData(question_data);
                if (checkErr) {
                    const err = new Error('Invalid question_data after server.parse(): ' + checkErr);
                    err.data = {question_data, submission, variant, question, course};
                    return callback(err);
                }

                callback(null, question_data.submitted_answer, question_data.parse_errors, consoleLog);
            });
        });
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        const question_data = {
            variant_seed: parseInt(variant.variant_seed, 36),
            params: variant.params,
            true_answer: variant.true_answer,
            options: variant.options,
            raw_submitted_answer: submission.raw_submitted_answer,
            submitted_answer: submission.submitted_answer,
            parse_errors: submission.parse_errors,
            editable: false,
            partial_scores: {},
            score: 0,
            feedback: {},
            panel: 'question',
        };
        var consoleLog = '';

        const checkErr = module.exports.checkQuestionData(question_data);
        if (checkErr) {
            const err = new Error('Invalid question_data before grade: ' + checkErr);
            err.data = {question_data, submission, variant, question, course};
            return callback(err);
        }

        this.execTemplate('question.html', question_data, question, course, (err, question_data, html, $) => {
            if (ERR(err, callback)) return;

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction('grade', elementName, $, element, index, question_data, (err, new_question_data, ret_consoleLog) => {
                        if (ERR(err, callback)) return;
                        question_data = new_question_data;
                        const checkErr = module.exports.checkQuestionData(question_data);
                        if (checkErr) {
                            const err = new Error('Invalid question_data after element ' + index + ' ' + elementName + '.grade(): ' + checkErr);
                            err.data = {question_data, submission, variant, question, course};
                            return callback(err);
                        }
                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                let total_weight = 0, total_weight_score = 0;
                _.each(question_data.partial_scores, value => {
                    const score = _.get(value, 'score', 0);
                    const weight = _.get(value, 'weight', 1);
                    total_weight += weight;
                    total_weight_score += weight * score;
                });
                question_data.score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
                question_data.feedback = {};

                let checkErr = module.exports.checkQuestionData(question_data);
                if (checkErr) {
                    const err = new Error('Invalid question_data before server.grade(): ' + checkErr);
                    err.data = {question_data, submission, variant, question, course};
                    return callback(err);
                }
                // FIXME: call server.grade()
                checkErr = module.exports.checkQuestionData(question_data);
                if (checkErr) {
                    const err = new Error('Invalid question_data after server.grade(): ' + checkErr);
                    err.data = {question_data, submission, variant, question, course};
                    return callback(err);
                }

                callback(null, question_data, consoleLog);
            });
        });
    },
};
