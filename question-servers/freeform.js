var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var handlebars = require('handlebars');
var cheerio = require('cheerio');

var elements = require('./elements');
var codeCaller = require('../lib/code-caller');

module.exports = {
    getElementFilename: function(elementName) {
        if (!elements.has(elementName)) {
            return 'No such element: "' + elementName + '"';
        }
        const elementModule = elements.get(elementName);
        return path.join(__dirname, 'elements', elementModule);
    },

    elementFunction: function(pc, fcn, elementName, $, element, index, data, callback) {
        const jsArgs = [$, element, index, data];
        const elementHtml = $(element).clone().wrap('<container/>').parent().html();
        const pythonArgs = [elementHtml, index, data];
        if (!elements.has(elementName)) {
            return callback(null, 'ERROR: invalid element name: ' + elementName);
        }
        const elementModule = elements.get(elementName);
        if (_.isString(elementModule)) {
            // python module
            const pythonFile = elementModule.replace(/\.[pP][yY]$/, '');
            const pythonCwd = path.join(__dirname, 'elements');
            const opts = {
                cwd: pythonCwd,
                paths: [path.join(__dirname, 'freeformPythonLib')],
            };
            pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
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

    execPythonServer: function(pc, pythonFunction, pythonArgs, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        const pythonFile = 'server';
        const opts = {
            cwd: question_dir,
            paths: [],
        };
        pc.call(pythonFile, pythonFunction, pythonArgs, opts, (err, ret, consoleLog) => {
            if (ERR(err, callback)) return;
            callback(null, ret, consoleLog);
        });
    },

    makeHandlebars: function() {
        var hb = handlebars.create();
        return hb;
    },

    execTemplate: function(filename, data, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        var question_html = path.join(question_dir, filename);
        fs.readFile(question_html, {encoding: 'utf8'}, (err, raw_file) => {
            if (ERR(err, callback)) return;
            try {
                var hb = this.makeHandlebars();
                var template = hb.compile(raw_file);
            } catch (err) {
                err.data = {data, question, course};
                return ERR(err, callback);
            }
            var html;
            try {
                html = template(data);
            } catch (err) {
                err.data = {data, question, course};
                return ERR(err, callback);
            }
            var $;
            try {
                $ = cheerio.load(html, {
                    recognizeSelfClosing: true,
                });
            } catch (err) {
                err.data = {data, question, course};
                return ERR(err, callback);
            }
            callback(null, html, $);
        });
    },

    checkQuestionData: function(data, checkOptions) {
        const checked = [];
        const checkProp = (prop, type) => {
            if (!_.has(data, prop)) return '"' + prop + '" is missing from "data"';
            if (type == 'integer') {
                if (!_.isInteger(data[prop])) {
                    return 'data.' + prop + ' is not an integer: ' + String(data[prop]);
                }
            } else if (type == 'number') {
                if (!_.isFinite(data[prop])) {
                    return 'data.' + prop + ' is not a number: ' + String(data[prop]);
                }
            } else if (type == 'string') {
                if (!_.isString(data[prop])) {
                    return 'data.' + prop + ' is not a string: ' + String(data[prop]);
                }
            } else if (type == 'boolean') {
                if (!_.isBoolean(data[prop])) {
                    return 'data.' + prop + ' is not a boolean: ' + String(data[prop]);
                }
            } else if (type == 'object') {
                if (!_.isObject(data[prop])) {
                    return 'data.' + prop + ' is not an object: ' + String(data[prop]);
                }
            } else {
                return 'invalid type: ' + String(type);
            }
            checked.push(prop);
            return null;
        };

        let err;
        err = checkProp('params', 'object'); if (err) return err;
        err = checkProp('correct_answers', 'object'); if (err) return err;
        err = checkProp('variant_seed', 'integer'); if (err) return err;
        err = checkProp('options', 'object'); if (err) return err;
        if (checkOptions.has_submission) {
            err = checkProp('submitted_answers', 'object'); if (err) return err;
            err = checkProp('parse_errors', 'object'); if (err) return err;
            err = checkProp('raw_submitted_answers', 'object'); if (err) return err;
        }
        if (checkOptions.has_grading) {
            err = checkProp('partial_scores', 'object'); if (err) return err;
            err = checkProp('score', 'number'); if (err) return err;
            err = checkProp('feedback', 'object'); if (err) return err;
        }
        if (checkOptions.for_render) {
            err = checkProp('editable', 'boolean'); if (err) return err;
            err = checkProp('panel', 'string'); if (err) return err;
        }
        const extraProps = _.difference(_.keys(data), checked);
        if (extraProps.length > 0) return '"data" has invalid extra keys: ' + extraProps.join(', ');

        return null;
    },

    getData: function(question, course, variant_seed, callback) {
        const pc = new codeCaller.PythonCaller();
        const question_dir = path.join(course.path, 'questions', question.directory);
        let consoleLog = '';
        let data = {
            params: {},
            correct_answers: {},
            variant_seed: parseInt(variant_seed, 36),
            options: _.defaults({}, course.options, question.options),
        };

        const checkOptions = {has_submission: false, has_grading: false, for_render: false};
        const checkErr = module.exports.checkQuestionData(data, checkOptions);
        if (checkErr) {
            const courseErr = new Error('Invalid state before server.get_data(): ' + checkErr);
            return callback(null, courseErr, data, consoleLog);
        }

        let pythonArgs = [data];
        this.execPythonServer(pc, 'get_data', pythonArgs, question, course, (err, ret_data, ret_consoleLog) => {
            if (err) {
                consoleLog += _.get(err, ['data', 'outputBoth'], '');
                const courseErr = new Error(path.join(question_dir, 'server.py') + ': Error calling get_data(): ' + err.toString());
                courseErr.data = err.data;
                return callback(null, courseErr, data, consoleLog);
            }

            if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
            data = ret_data;
            const checkErr = module.exports.checkQuestionData(data, checkOptions);
            if (checkErr) {
                const fullFilename = path.join(question_dir, 'server.py');
                const courseErr = new Error(fullFilename + ': Invalid state after get_data(): ' + checkErr);
                return callback(null, courseErr, data, consoleLog);
            }

            this.execTemplate('question.html', data, question, course, (err, html, $) => {
                if (err) {
                    const fullFilename = path.join(question_dir, 'question.html');
                    const courseErr = new Error(fullFilename + ': ' + err.toString());
                    return callback(null, courseErr, data, consoleLog);
                }

                let index = 0;
                async.eachSeries(elements.keys(), (elementName, callback) => {
                    async.eachSeries($(elementName).toArray(), (element, callback) => {
                        this.elementFunction(pc, 'prepare', elementName, $, element, index, data, (err, ret_data, ret_consoleLog) => {
                            if (err) {
                                consoleLog += _.get(err, ['data', 'outputBoth'], '');
                                const elementFile = module.exports.getElementFilename(elementName);
                                const courseErr = new Error(elementFile + ': Error calling prepare(): ' + err.toString());
                                courseErr.data = err.data;
                                return callback(courseErr);
                            }

                            if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                            data = ret_data;
                            const checkErr = module.exports.checkQuestionData(data, checkOptions);
                            if (checkErr) {
                                consoleLog += _.get(err, ['data', 'outputBoth'], '');
                                const elementFile = module.exports.getElementFilename(elementName);
                                const courseErr = new Error(elementFile + ': Invalid state after prepare(): ' + checkErr);
                                return callback(courseErr);
                            }

                            index++;
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    pc.done();
                    if (err) return callback(null, err, data, consoleLog);
                    data = {
                        params: data.params,
                        true_answer: data.correct_answers,
                    };
                    callback(null, null, data, consoleLog);
                });
            });
        });
    },

    getFile: function(filename, variant, question, course, callback) {
        callback(new Error('not implemented'));
    },

    render: function(panel, variant, question, submission, course, locals, callback) {
        const pc = new codeCaller.PythonCaller();
        if (panel == 'header') return callback(null, null, '', ''); // FIXME

        const question_dir = path.join(course.path, 'questions', question.directory);
        let data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            submitted_answers: submission ? _.get(submission, 'submitted_answer', {}) : {},
            parse_errors: submission ? _.get(submission, 'parse_errors', {}) : {},
            partial_scores: submission ? _.get(submission, 'partial_scores', {}) : {},
            score: submission ? _.get(submission, 'score', 0) : 0,
            feedback: submission ? _.get(submission, 'feedback', {}) : {},
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
            raw_submitted_answers: submission ? _.get(submission, 'raw_submitted_answer', {}) : {},
            editable: !!locals.allowAnswerEditing,
            panel: panel,
        };
        data.options.client_files_question_url = locals.paths.clientFilesQuestion;
        let consoleLog = '';

        const checkOptions = {has_submission: true, has_grading: true, for_render: true};
        const checkErr = module.exports.checkQuestionData(data, checkOptions);
        if (checkErr) {
            const fullFilename = path.join(question_dir, 'question.html');
            const courseErr = new Error('Error rendering panel "' + panel + '" from ' + fullFilename + ': Invalid state before render: ' + checkErr);
            return callback(null, courseErr, data, consoleLog);
        }

        this.execTemplate('question.html', data, question, course, (err, html, $) => {
            if (err) {
                const fullFilename = path.join(question_dir, 'question.html');
                const courseErr = new Error('Error rendering panel "' + panel + '" from ' + fullFilename + ': ' + err.toString());
                return callback(null, courseErr, data, consoleLog);
            }

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction(pc, 'render', elementName, $, element, index, data, (err, elementHtml, ret_consoleLog) => {
                        if (err) {
                            consoleLog += _.get(err, ['data', 'outputBoth'], '');
                            const fullFilename = path.join(question_dir, 'question.html');
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error('Error rendering panel "' + panel + '" from ' + fullFilename + ': ' + elementFile + ': Error calling render(): ' + err.toString());
                            courseErr.data = err.data;
                            return callback(courseErr);
                        }
                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        $(element).replaceWith(elementHtml);
                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                pc.done();
                if (err) return callback(null, err, data, consoleLog);
                callback(null, null, $.html(), consoleLog);
            });
        });
    },

    parseSubmission: function(submission, variant, question, course, callback) {
        const pc = new codeCaller.PythonCaller();
        const question_dir = path.join(course.path, 'questions', question.directory);
        var consoleLog = '';
        let data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            submitted_answers: _.get(submission, 'submitted_answer', {}),
            parse_errors: _.get(submission, 'parse_errors', {}),
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
            raw_submitted_answers: _.get(submission, 'raw_submitted_answer', {}),
        };

        const checkOptions = {has_submission: true, has_grading: false, for_render: false};
        const checkErr = module.exports.checkQuestionData(data, checkOptions);
        if (checkErr) {
            const courseErr = new Error('Invalid state before parse: ' + checkErr);
            return callback(null, courseErr, data, consoleLog);
        }

        this.execTemplate('question.html', data, question, course, (err, html, $) => {
            if (err) {
                const fullFilename = path.join(question_dir, 'question.html');
                const courseErr = new Error(fullFilename + ': ' + err.toString());
                courseErr.data = err.data;
                return callback(null, courseErr, data, consoleLog);
            }

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction(pc, 'parse', elementName, $, element, index, data, (err, ret_data, ret_consoleLog) => {
                        if (err) {
                            consoleLog += _.get(err, ['data', 'outputBoth'], '');
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': Error calling parse(): ' + err.toString());
                            courseErr.data = err.data;
                            return callback(courseErr);
                        }

                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        data = ret_data;
                        const checkErr = module.exports.checkQuestionData(data, checkOptions);
                        if (checkErr) {
                            consoleLog += _.get(err, ['data', 'outputBoth'], '');
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': Invalid state after parse(): ' + checkErr);
                            return callback(courseErr);
                        }

                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                pc.done();
                if (err) return callback(null, err, data, consoleLog);

                // FIXME: call server.parse()
                const checkErr = module.exports.checkQuestionData(data, checkOptions);
                if (checkErr) {
                    const fullFilename = path.join(question_dir, 'server.py');
                    const courseErr = new Error(fullFilename + ': Invalid state after parse(): ' + checkErr);
                    return callback(null, courseErr, data, consoleLog);
                }

                data = {
                    params: data.params,
                    true_answer: data.correct_answers,
                    submitted_answer: data.submitted_answers,
                    parse_errors: data.parse_errors,
                    raw_submitted_answer: data.raw_submitted_answers,
                };
                callback(null, null, data, consoleLog);
            });
        });
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        const pc = new codeCaller.PythonCaller();
        const question_dir = path.join(course.path, 'questions', question.directory);
        var consoleLog = '';
        let data = {
            params: variant.params,
            correct_answers: variant.true_answer,
            submitted_answers: submission.submitted_answer,
            parse_errors: submission.parse_errors,
            partial_scores: (submission.partial_scores == null) ? {} : submission.partial_scores,
            score: (submission.score == null) ? 0 : submission.score,
            feedback: (submission.feedback == null) ? {} : submission.feedback,
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
            raw_submitted_answers: submission.raw_submitted_answer,
        };

        const checkOptions = {has_submission: true, has_grading: true, for_render: false};
        const checkErr = module.exports.checkQuestionData(data, checkOptions);
        if (checkErr) {
            const courseErr = new Error('Invalid state before grade: ' + checkErr);
            return callback(null, courseErr, data, consoleLog);
        }

        this.execTemplate('question.html', data, question, course, (err, html, $) => {
            if (err) {
                const fullFilename = path.join(question_dir, 'question.html');
                const courseErr = new Error(fullFilename + ': ' + err.toString());
                return callback(null, courseErr, data, consoleLog);
            }

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction(pc, 'grade', elementName, $, element, index, data, (err, ret_data, ret_consoleLog) => {
                        if (err) {
                            consoleLog += _.get(err, ['data', 'outputBoth'], '');
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': Error calling grade(): ' + err.toString());
                            courseErr.data = err.data;
                            return callback(courseErr);
                        }

                        if (_.isString(ret_consoleLog)) consoleLog += ret_consoleLog;
                        data = ret_data;
                        const checkErr = module.exports.checkQuestionData(data, checkOptions);
                        if (checkErr) {
                            consoleLog += _.get(err, ['data', 'outputBoth'], '');
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': Invalid state after grade(): ' + checkErr);
                            return callback(courseErr);
                        }

                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (err) return callback(null, err, data, consoleLog);
                console.log('a', 'data', data);

                let total_weight = 0, total_weight_score = 0;
                _.each(data.partial_scores, value => {
                    const score = _.get(value, 'score', 0);
                    const weight = _.get(value, 'weight', 1);
                    total_weight += weight;
                    total_weight_score += weight * score;
                });
                data.score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
                data.feedback = {};

                let checkErr = module.exports.checkQuestionData(data, checkOptions);
                if (checkErr) {
                    const fullFilename = path.join(question_dir, 'server.py');
                    const courseErr = new Error(fullFilename + ': Invalid state before server.grade(): ' + checkErr);
                    return callback(null, courseErr, data, consoleLog);
                }
                // FIXME: call server.grade()
                checkErr = module.exports.checkQuestionData(data, checkOptions);
                if (checkErr) {
                    const fullFilename = path.join(question_dir, 'server.py');
                    const courseErr = new Error(fullFilename + ': Invalid state after server.grade(): ' + checkErr);
                    return callback(null, courseErr, data, consoleLog);
                }

                pc.done();
                data = {
                    params: data.params,
                    true_answer: data.correct_answers,
                    submitted_answer: data.submitted_answers,
                    parse_errors: data.parse_errors,
                    raw_submitted_answer: data.raw_submitted_answers,
                    partial_scores: data.partial_scores,
                    score: data.score,
                    feedback: data.feedback,
                };
                console.log('b', 'data', data);
                callback(null, null, data, consoleLog);
            });
        });
    },
};
