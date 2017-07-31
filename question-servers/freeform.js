var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var mustache = require('mustache');
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

    defaultServerRet: function(phase, data, html, options) {
        if (phase == 'render') {
            return html;
        } else {
            return data;
        }
    },

    execPythonServer: function(pc, phase, data, html, options, callback) {
        const pythonFile = 'server';
        const pythonFunction = phase;
        const pythonArgs = [data];
        if (phase == 'render') pythonArgs.push(html);
        const opts = {
            cwd: options.question_dir,
            paths: [],
        };
        const fullFilename = path.join(options.question_dir, 'server.py');
        fs.access(fullFilename, fs.constants.R_OK, (err) => {
            if (err) {
                // server.py does not exist
                callback(null, module.exports.defaultServerRet(phase, data, html, options), '');
            } else {
                // server.py exists
                pc.call(pythonFile, pythonFunction, pythonArgs, opts, (err, ret, consoleLog) => {
                    if (ERR(err, callback)) return;
                    callback(null, ret, consoleLog);
                });
            }
        });
    },

    makeHandlebars: function() {
        var hb = handlebars.create();
        return hb;
    },

    execTemplate: function(htmlFilename, data, callback) {
        fs.readFile(htmlFilename, {encoding: 'utf8'}, (err, raw_file) => {
            if (ERR(err, callback)) return;
            let html;
            err = null;
            try {
                html = mustache.render(raw_file, data);
            } catch (e) {
                err = e;
            }
            if (ERR(err, callback)) return;
            let $;
            try {
                $ = cheerio.load(html, {
                    recognizeSelfClosing: true,
                });
            } catch (e) {
                err = e;
            }
            if (ERR(err, callback)) return;
            callback(null, html, $);
        });
    },

    checkData: function(data, origData, phase) {
        const checked = [];
        const checkProp = (prop, type, presentPhases, fixedPhases) => {
            if (!presentPhases.includes(phase)) return null;
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
            if (fixedPhases.includes(phase)) {
                if (!_.has(origData, prop)) return '"' + prop + '" is missing from "origData"';
                if (!_.isEqual(data[prop], origData[prop])) {
                    return 'data.' + prop + ' has been modified, which is not permitted at this time'
                }
            }
            checked.push(prop);
            return null;
        };

        let err;
        let allPhases = ['generate', 'prepare', 'render', 'parse', 'grade'];
        err = checkProp('params',                 'object',  allPhases,                    ['render']); if (err) return err;
        err = checkProp('correct_answers',        'object',  allPhases,                    ['render']); if (err) return err;
        err = checkProp('variant_seed',           'integer', allPhases,                    ['render']); if (err) return err;
        err = checkProp('options',                'object',  allPhases,                    ['render']); if (err) return err;
        err = checkProp('submitted_answers',      'object',  ['render', 'parse', 'grade'], ['render']); if (err) return err;
        err = checkProp('parse_errors',           'object',  ['render', 'parse', 'grade'], ['render']); if (err) return err;
        err = checkProp('raw_submitted_answers',  'object',  ['render', 'parse', 'grade'], allPhases);  if (err) return err;
        err = checkProp('partial_scores',         'object',  ['render', 'grade'],          ['render']); if (err) return err;
        err = checkProp('score',                  'number',  ['render', 'grade'],          ['render']); if (err) return err;
        err = checkProp('feedback',               'object',  ['render', 'grade'],          ['render']); if (err) return err;
        err = checkProp('editable',               'boolean', ['render'],                   ['render']); if (err) return err;
        err = checkProp('panel',                  'string',  ['render'],                   ['render']); if (err) return err;
        const extraProps = _.difference(_.keys(data), checked);
        if (extraProps.length > 0) return '"data" has invalid extra keys: ' + extraProps.join(', ');

        return null;
    },

    processQuestionHtml: function(phase, pc, data, options, callback) {
        const courseErrs = []
        const origData = JSON.parse(JSON.stringify(data));

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseErr = new Error('Invalid state before ' + phase + ': ' + checkErr);
            courseErr.fatal = true;
            courseErrs.push(courseErr);
            return callback(null, courseErrs, data, '');
        }

        const htmlFilename = path.join(options.question_dir, 'question.html');
        this.execTemplate(htmlFilename, data, (err, html, $) => {
            if (err) {
                const courseErr = new Error(htmlFilename + ': ' + err.toString());
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data, '');
            }

            let index = 0;
            async.eachSeries(elements.keys(), (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    this.elementFunction(pc, phase, elementName, $, element, index, data, (err, ret_val, consoleLog) => {
                        if (err) {
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): ' + err.toString());
                            courseErr.data = err.data;
                            courseErr.fatal = true;
                            courseErrs.push(courseErr);
                            return callback(courseErr);
                        }
                        if (_.isString(consoleLog) && consoleLog.length > 0) {
                            const elementFile = module.exports.getElementFilename(elementName);
                            const courseErr = new Error(elementFile + ': output logged on console during ' + phase + '()');
                            courseErr.data = {outputBoth: consoleLog};
                            courseErr.fatal = false;
                            courseErrs.push(courseErr);
                        }

                        if (phase == 'render') {
                            if (!_.isString(ret_val)) {
                                const elementFile = module.exports.getElementFilename(elementName);
                                const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): return value is not a string');
                                courseErr.data = {ret_val};
                                courseErr.fatal = true;
                                courseErrs.push(courseErr);
                                return callback(courseErr);
                            }
                            $(element).replaceWith(ret_val);
                        } else {
                            data = ret_val;
                            const checkErr = module.exports.checkData(data, origData, phase);
                            if (checkErr) {
                                const elementFile = module.exports.getElementFilename(elementName);
                                const courseErr = new Error(elementFile + ': Invalid state after ' + phase + '(): ' + checkErr);
                                courseErr.fatal = true;
                                courseErrs.push(courseErr);
                                return callback(courseErr);
                            }
                        }

                        index++;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                ERR(err, () => {});

                if (phase == 'grade') {
                    let total_weight = 0, total_weight_score = 0;
                    _.each(data.partial_scores, value => {
                        const score = _.get(value, 'score', 0);
                        const weight = _.get(value, 'weight', 1);
                        total_weight += weight;
                        total_weight_score += weight * score;
                    });
                    data.score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
                    data.feedback = {};
                }

                callback(null, courseErrs, data, $.html());
            });
        });
    },

    processQuestionServer: function(phase, pc, data, html, options, callback) {
        const courseErrs = []
        const origData = JSON.parse(JSON.stringify(data));

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseErr = new Error('Invalid state before calling server.' + phase + '(): ' + checkErr);
            courseErr.fatal = true;
            courseErrs.push(courseErr);
            return callback(null, courseErrs, data, '');
        }

        this.execPythonServer(pc, phase, data, html, options, (err, ret_val, consoleLog) => {
            if (err) {
                const serverFile = path.join(options.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': Error calling ' + phase + '(): ' + err.toString());
                courseErr.data = err.data;
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data);
            }
            if (_.isString(consoleLog) && consoleLog.length > 0) {
                const serverFile = path.join(options.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': output logged on console');
                courseErr.data = {outputBoth: consoleLog};
                courseErr.fatal = false;
                courseErrs.push(courseErr);
            }
            
            if (phase == 'render') {
                html = ret_val;
            } else {
                data = ret_val;
            }
            const checkErr = module.exports.checkData(data, origData, phase);
            if (checkErr) {
                const serverFile = path.join(options.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': Invalid state after ' + phase + '(): ' + checkErr);
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data);
            }

            callback(null, courseErrs, data, html);
        });
    },

    processQuestion: function(phase, pc, data, options, callback) {
        if (phase == 'generate') {
            module.exports.processQuestionServer(phase, pc, data, '', options, (err, courseErrs, data, html) => {
                if (ERR(err, callback)) return;
                callback(null, courseErrs, data, html);
            });
        } else {
            module.exports.processQuestionHtml(phase, pc, data, options, (err, courseErrs, data, html) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestionServer(phase, pc, data, html, options, (err, ret_courseErrs, data, html) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    callback(null, courseErrs, data, html);
                });
            });
        }
    },

    generate: function(question, course, variant_seed, callback) {
        const data = {
            params: {},
            correct_answers: {},
            variant_seed: parseInt(variant_seed, 36),
            options: _.defaults({}, course.options, question.options),
        };
        const options = {
            question_dir: path.join(course.path, 'questions', question.directory),
        };
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('generate', pc, data, options, (err, courseErrs, data, _html) => {
            pc.done();
            if (ERR(err, callback)) return;
            const ret_vals = {
                params: data.params,
                true_answer: data.correct_answers,
            };
            callback(null, courseErrs, ret_vals);
        });
    },
    
    prepare: function(question, course, variant, callback) {
        const data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
        };
        const options = {
            question_dir: path.join(course.path, 'questions', question.directory),
        };
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('prepare', pc, data, options, (err, courseErrs, data, _html) => {
            pc.done();
            if (ERR(err, callback)) return;
            const ret_vals = {
                params: data.params,
                true_answer: data.correct_answers,
            };
            callback(null, courseErrs, ret_vals);
        });
    },

    render: function(panel, variant, question, submission, course, locals, callback) {
        if (panel == 'header') return callback(null, [], ''); // FIXME
        const data = {
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
        const options = {
            question_dir: path.join(course.path, 'questions', question.directory),
        };
        data.options.client_files_question_url = locals.paths.clientFilesQuestion;
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('render', pc, data, options, (err, courseErrs, _data, html) => {
            pc.done();
            if (ERR(err, callback)) return;
            callback(null, courseErrs, html);
        });
    },

    parse: function(submission, variant, question, course, callback) {
        const data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            submitted_answers: _.get(submission, 'submitted_answer', {}),
            parse_errors: _.get(submission, 'parse_errors', {}),
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
            raw_submitted_answers: _.get(submission, 'raw_submitted_answer', {}),
        };
        const options = {
            question_dir: path.join(course.path, 'questions', question.directory),
        };
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('parse', pc, data, options, (err, courseErrs, data, _html) => {
            pc.done();
            if (ERR(err, callback)) return;
            const ret_vals = {
                params: data.params,
                true_answer: data.correct_answers,
                submitted_answer: data.submitted_answers,
                parse_errors: data.parse_errors,
            };
            callback(null, courseErrs, ret_vals);
        });
    },

    grade: function(submission, variant, question, course, callback) {
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
        const options = {
            question_dir: path.join(course.path, 'questions', question.directory),
        };
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('grade', pc, data, options, (err, courseErrs, data, _html) => {
            pc.done();
            if (ERR(err, callback)) return;
            const ret_vals = {
                params: data.params,
                true_answer: data.correct_answers,
                submitted_answer: data.submitted_answers,
                parse_errors: data.parse_errors,
                raw_submitted_answer: data.raw_submitted_answers,
                partial_scores: data.partial_scores,
                score: data.score,
                feedback: data.feedback,
            };
            callback(null, courseErrs, ret_vals);
        });
    },
};
