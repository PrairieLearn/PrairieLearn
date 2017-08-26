var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var mustache = require('mustache');
var cheerio = require('cheerio');

var logger = require('../lib/logger');
var codeCaller = require('../lib/code-caller');
var jsonLoader = require('../lib/json-load');

// Maps core element names to element info
let coreElementsCache = {};
// Maps course IDs to course element info
const courseElementsCache = {};

module.exports = {

    init: function(callback) {
        // Populate the list of PrairieLearn elements
        module.exports.loadElements(path.join(__dirname, 'elements'), 'core', (err, results) => {
            if (ERR(err, callback)) return;
            coreElementsCache = results;
            return callback(null);
        });
    },

    /**
     * Takes a directory containing element directories and returns an object
     * mapping element names to that element's controller, dependencies, etc.
     * @param  {String}   sourceDir Absolute path to the directory of elements
     * @param  {Function} callback  Called with any errors and the results
     */
    loadElements: function(sourceDir, elementType, callback) {
        let elementSchema;
        async.waterfall([
            (callback) => {
                // Load the element schema
                let schemaName;
                switch (elementType) {
                    case 'core':
                        schemaName = 'infoElementCore.json';
                        break;
                    case 'course':
                        schemaName = 'infoElementCourse.json';
                        break;
                    default:
                        return callback(new Error(`Unknown element type ${elementType}`));
                }
                jsonLoader.readJSON(path.join(__dirname, '..', 'schemas', schemaName), (err, schema) => {
                    if (ERR(err, callback)) return;
                    elementSchema = schema;
                    callback(null);
                });
            },
            (callback) => {
                // Read all files in the given path
                fs.readdir(sourceDir, (err, files) => {
                    if (err && err.code === 'ENOENT') {
                        // Directory doesn't exist, most likely a course with not elements
                        // Proceed with an empty array
                        return callback(null, []);
                    }
                    if (ERR(err, callback)) return;
                    return callback(null, files);
                });
            },
            (files, callback) => {
                // Filter out any non-directories
                async.filter(files, (file, callback) => fs.lstat(path.join(sourceDir, file), (err, stats) => {
                    if (ERR(err, callback)) return;
                    callback(null, stats.isDirectory());
                }), (err, results) => {
                    if (ERR(err, callback)) return;
                    return callback(null, results);
                });
            },
            (elementNames, callback) => {
                const elements = {};
                async.each(elementNames, (elementName, callback) => {
                    const elementInfoPath = path.join(sourceDir, elementName, 'info.json');
                    fs.readJson(elementInfoPath, (err, info) => {
                        if (err && err.code === 'ENOENT') {
                            // This must not be an element directory, skip it
                            logger.verbose(`${elementInfoPath} not found, skipping...`);
                            return callback(null);
                        }
                        if (ERR(err, callback)) return;
                        jsonLoader.validateJSON(info, elementSchema, (err) => {
                            if (ERR(err, callback)) return;
                            elements[elementName] = info;
                            callback(null);
                        });
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, elements);
                });
            }
        ], (err, elements) => {
            if (ERR(err, callback)) return;
            return callback(null, elements);
        });
    },

    loadElementsForCourse(course, callback) {
        if (courseElementsCache[course.id] !== undefined) {
            return callback(null, courseElementsCache[course.id]);
        }
        module.exports.loadElements(path.join(course.path, 'elements'), 'course', (err, elements) => {
            if (ERR(err, callback)) return;
            courseElementsCache[course.id] = elements;
            callback(null, courseElementsCache[course.id]);
        });
    },

    // Skips the cache; used when syncing course from GitHub/disk
    reloadElementsForCourse(course, callback) {
        module.exports.loadElements(path.join(course.path, 'elements'), 'course', (err, elements) => {
            if (ERR(err, callback)) return;
            courseElementsCache[course.id] = elements;
            callback(null, courseElementsCache[course.id]);
        });
    },

    getElementFilename: function(elementName, context) {
        if (context.course_elements[elementName]) {
            const element = context.course_elements[elementName];
            return path.join(context.course.path, 'elements', elementName, element.controller);
        } else if (coreElementsCache[elementName]) {
            const element = coreElementsCache[elementName];
            return path.join(__dirname, 'elements', elementName, element.controller);
        } else {
            return 'No such element: "' + elementName + '"';
        }
    },

    elementFunction: function(pc, fcn, elementName, $, element, index, data, context, callback) {
        let controller, cwd;
        if (_.has(context.course_elements, elementName)) {
            cwd = path.join(context.course.path, 'elements', elementName);
            controller = context.course_elements[elementName].controller;
        } else if (_.has(coreElementsCache, elementName)) {
            cwd = path.join(__dirname, 'elements', elementName);
            controller = coreElementsCache[elementName].controller;
        } else {
            return callback(new Error('Invalid element name: ' + elementName), null);
        }
        if (_.isString(controller)) {
            // python module
            const elementHtml = $(element).clone().wrap('<container/>').parent().html();
            const pythonArgs = [elementHtml, index, data];
            const pythonFile = controller.replace(/\.[pP][yY]$/, '');
            const opts = {
                cwd,
                paths: [path.join(__dirname, 'freeformPythonLib')],
            };
            pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
                if (err instanceof codeCaller.FunctionMissingError) {
                    // function wasn't present in server
                    return callback(null, module.exports.defaultElementFunctionRet(fcn, data), '');
                }
                if (ERR(err, callback)) return;
                callback(null, ret, consoleLog);
            });
        } else {
            // JS module
            const jsArgs = [$, element, index, data];
            controller[fcn](...jsArgs, (err, ret) => {
                if (ERR(err, callback)) return;
                callback(null, ret, '');
            });
        }
    },

    defaultElementFunctionRet: function(phase, data) {
        if (phase == 'render') {
            return '';
        } else if (phase == 'file') {
            return '';
        } else {
            return data;
        }
    },

    defaultServerRet: function(phase, data, html, _context) {
        if (phase == 'render') {
            return html;
        } else if (phase == 'file') {
            return '';
        } else {
            return data;
        }
    },

    execPythonServer: function(pc, phase, data, html, context, callback) {
        const pythonFile = 'server';
        const pythonFunction = phase;
        const pythonArgs = [data];
        if (phase == 'render') pythonArgs.push(html);
        const opts = {
            cwd: context.question_dir,
            paths: [],
        };
        const fullFilename = path.join(context.question_dir, 'server.py');
        fs.access(fullFilename, fs.constants.R_OK, (err) => {
            if (err) {
                // server.py does not exist
                return callback(null, module.exports.defaultServerRet(phase, data, html, context), '');
            }

            pc.call(pythonFile, pythonFunction, pythonArgs, opts, (err, ret, consoleLog) => {
                if (err instanceof codeCaller.FunctionMissingError) {
                    // function wasn't present in server
                    return callback(null, module.exports.defaultServerRet(phase, data, html, context), '');
                }
                if (ERR(err, callback)) return;
                callback(null, ret, consoleLog);
            });
        });
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
        const checkProp = (prop, type, presentPhases, editPhases) => {
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
            if (!editPhases.includes(phase)) {
                if (!_.has(origData, prop)) return '"' + prop + '" is missing from "origData"';
                if (!_.isEqual(data[prop], origData[prop])) {
                    return `data.${prop} has been illegally modified, new value: "${data[prop]}", original value: "${origData[prop]}"`;
                }
            }
            checked.push(prop);
            return null;
        };

        let err;
        let allPhases = ['generate', 'prepare', 'render', 'parse', 'grade', 'test', 'file'];

        if (!allPhases.includes(phase)) return `unknown phase: ${phase}`;

        /**************************************************************************************************************************************/
        //              property                 type       presentPhases                         changePhases
        /**************************************************************************************************************************************/
        err = checkProp('params',                'object',  allPhases,                            ['generate', 'prepare']);    if (err) return err;
        err = checkProp('correct_answers',       'object',  allPhases,                            ['generate', 'prepare']);    if (err) return err;
        err = checkProp('variant_seed',          'integer', allPhases,                            []);                         if (err) return err;
        err = checkProp('options',               'object',  allPhases,                            []);                         if (err) return err;
        err = checkProp('submitted_answers',     'object',  ['render', 'parse', 'grade'],         ['parse', 'grade']);         if (err) return err;
        err = checkProp('format_errors',         'object',  ['render', 'parse', 'grade', 'test'], ['parse', 'grade', 'test']); if (err) return err;
        err = checkProp('raw_submitted_answers', 'object',  ['render', 'parse', 'grade', 'test'], ['test']);                   if (err) return err;
        err = checkProp('partial_scores',        'object',  ['render', 'grade', 'test'],          ['grade', 'test']);          if (err) return err;
        err = checkProp('score',                 'number',  ['render', 'grade', 'test'],          ['grade', 'test']);          if (err) return err;
        err = checkProp('feedback',              'object',  ['render', 'grade', 'test'],          ['grade', 'feedback']);      if (err) return err;
        err = checkProp('editable',              'boolean', ['render'],                           []);                         if (err) return err;
        err = checkProp('panel',                 'string',  ['render'],                           []);                         if (err) return err;
        err = checkProp('gradable',              'boolean', ['parse', 'grade', 'test'],           []);                         if (err) return err;
        err = checkProp('filename',              'string',  ['file'],                             []);                         if (err) return err;
        const extraProps = _.difference(_.keys(data), checked);
        if (extraProps.length > 0) return '"data" has invalid extra keys: ' + extraProps.join(', ');

        return null;
    },

    processQuestionHtml: function(phase, pc, data, context, callback) {
        const courseErrs = [];
        const origData = JSON.parse(JSON.stringify(data));
        const renderedElementNames = [];
        const elementDependencies = {
            globalStyles: [],
            globalScripts: [],
            styles: [],
            scripts: [],
            courseStyles: [],
            courseScripts: []
        };

        var fileData = Buffer.from('');

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseErr = new Error('Invalid state before ' + phase + ': ' + checkErr);
            courseErr.fatal = true;
            courseErrs.push(courseErr);
            return callback(null, courseErrs, data, '', fileData);
        }

        const htmlFilename = path.join(context.question_dir, 'question.html');
        this.execTemplate(htmlFilename, data, (err, html, $) => {
            if (err) {
                const courseErr = new Error(htmlFilename + ': ' + err.toString());
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data, '', fileData);
            }

            const questionElements = new Set([..._.keys(coreElementsCache), ..._.keys(context.course_elements)]).values();

            let index = 0;
            async.eachSeries(questionElements, (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    if (phase === 'render' && !_.includes(renderedElementNames, element)) {
                        renderedElementNames.push(elementName);
                    }

                    this.elementFunction(pc, phase, elementName, $, element, index, data, context, (err, ret_val, consoleLog) => {
                        if (err) {
                            const elementFile = module.exports.getElementFilename(elementName, context);
                            const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): ' + err.toString());
                            courseErr.data = err.data;
                            courseErr.fatal = true;
                            courseErrs.push(courseErr);
                            return callback(courseErr);
                        }
                        if (_.isString(consoleLog) && consoleLog.length > 0) {
                            const elementFile = module.exports.getElementFilename(elementName, context);
                            const courseErr = new Error(elementFile + ': output logged on console during ' + phase + '()');
                            courseErr.data = {outputBoth: consoleLog};
                            courseErr.fatal = false;
                            courseErrs.push(courseErr);
                        }

                        if (phase == 'render') {
                            if (!_.isString(ret_val)) {
                                const elementFile = module.exports.getElementFilename(elementName, context);
                                const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): return value is not a string');
                                courseErr.data = {ret_val};
                                courseErr.fatal = true;
                                courseErrs.push(courseErr);
                                return callback(courseErr);
                            }
                            $(element).replaceWith(ret_val);
                        } else if (phase == 'file') {
                            // Convert ret_val from base64 back to buffer (this always works,
                            // whether or not ret_val is valid base64)
                            var buf = Buffer.from(ret_val, 'base64');

                            // If the buffer has non-zero length...
                            if (buf.length > 0) {
                                if (fileData.length > 0) {
                                    // If fileData already has non-zero length, throw an error
                                    const elementFile = module.exports.getElementFilename(elementName, context);
                                    const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): attempting to overwrite non-empty fileData');
                                    courseErr.fatal = true;
                                    courseErrs.push(courseErr);
                                    return callback(courseErr);
                                } else {
                                    // If not, replace fileData with buffer
                                    fileData = buf;
                                }
                            }
                        } else {
                            data = ret_val;
                            const checkErr = module.exports.checkData(data, origData, phase);
                            if (checkErr) {
                                const elementFile = module.exports.getElementFilename(elementName, context);
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

                if (phase == 'grade' || phase == 'test') {
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

                callback(null, courseErrs, data, $.html(), fileData, renderedElementNames);
            });
        });
    },

    processQuestionServer: function(phase, pc, data, html, fileData, context, callback) {
        const courseErrs = [];
        const origData = JSON.parse(JSON.stringify(data));

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseErr = new Error('Invalid state before calling server.' + phase + '(): ' + checkErr);
            courseErr.fatal = true;
            courseErrs.push(courseErr);
            return callback(null, courseErrs, data, '');
        }

        this.execPythonServer(pc, phase, data, html, context, (err, ret_val, consoleLog) => {
            if (err) {
                const serverFile = path.join(context.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': Error calling ' + phase + '(): ' + err.toString());
                courseErr.data = err.data;
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data);
            }
            if (_.isString(consoleLog) && consoleLog.length > 0) {
                const serverFile = path.join(context.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': output logged on console');
                courseErr.data = {outputBoth: consoleLog};
                courseErr.fatal = false;
                courseErrs.push(courseErr);
            }

            if (phase == 'render') {
                html = ret_val;
            } else if (phase == 'file') {
                // Convert ret_val from base64 back to buffer (this always works,
                // whether or not ret_val is valid base64)
                var buf = Buffer.from(ret_val, 'base64');

                // If the buffer has non-zero length...
                if (buf.length > 0) {
                    if (fileData.length > 0) {
                        // If fileData already has non-zero length, throw an error
                        const serverFile = path.join(context.question_dir, 'server.py');
                        const courseErr = new Error(serverFile + ': Error calling ' + phase + '(): attempting to overwrite non-empty fileData');
                        courseErr.fatal = true;
                        courseErrs.push(courseErr);
                        return callback(null, courseErrs, data);
                    } else {
                        // If not, replace fileData with a copy of buffer
                        fileData = Buffer.from(buf);
                    }
                }
            } else {
                data = ret_val;
            }
            const checkErr = module.exports.checkData(data, origData, phase);
            if (checkErr) {
                const serverFile = path.join(context.question_dir, 'server.py');
                const courseErr = new Error(serverFile + ': Invalid state after ' + phase + '(): ' + checkErr);
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, data);
            }

            callback(null, courseErrs, data, html, fileData);
        });
    },

    processQuestion: function(phase, pc, data, context, callback) {
        if (phase == 'generate') {
            module.exports.processQuestionServer(phase, pc, data, '', Buffer.from(''), context, (err, courseErrs, data, html, fileData) => {
                if (ERR(err, callback)) return;
                callback(null, courseErrs, data, html, fileData);
            });
        } else {
            module.exports.processQuestionHtml(phase, pc, data, context, (err, courseErrs, data, html, fileData, renderedElementNames) => {
                if (ERR(err, callback)) return;
                const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                if (hasFatalError) return callback(null, courseErrs, data, html, fileData);
                module.exports.processQuestionServer(phase, pc, data, html, fileData, context, (err, ret_courseErrs, data, html, fileData) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    callback(null, courseErrs, data, html, fileData, renderedElementNames);
                });
            });
        }
    },

    generate: function(question, course, variant_seed, callback) {
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }
            const data = {
                params: {},
                correct_answers: {},
                variant_seed: parseInt(variant_seed, 36),
                options: _.defaults({}, course.options, question.options),
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('generate', pc, data, context, (err, courseErrs, data, _html, _fileData, _renderedElementNames) => {
                pc.done();
                if (ERR(err, callback)) return;
                const ret_vals = {
                    params: data.params,
                    true_answer: data.correct_answers,
                };
                callback(null, courseErrs, ret_vals);
            });
        });
    },

    prepare: function(question, course, variant, callback) {
        if (variant.broken) return callback(new Error('attemped to prepare broken variant'));
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            const data = {
                params: _.get(variant, 'params', {}),
                correct_answers: _.get(variant, 'true_answer', {}),
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('prepare', pc, data, context, (err, courseErrs, data, _html, _fileData, _renderedElementNames) => {
                pc.done();
                if (ERR(err, callback)) return;
                const ret_vals = {
                    params: data.params,
                    true_answer: data.correct_answers,
                };
                callback(null, courseErrs, ret_vals);
            });
        });
    },

    renderPanel: function(panel, pc, variant, question, submission, course, locals, callback) {
        // broken variant kills all rendering
        if (variant.broken) return callback(null, [], 'Broken question due to error in question code');

        // broken submission kills the submission panel, but we can
        // proceed with other panels, treating the submission as
        // missing
        if (submission && submission.broken) {
            if (panel == 'submission') {
                return callback(null, [], 'Broken submission due to error in question code');
            } else {
                submission = null;
            }
        }
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            const data = {
                params: _.get(variant, 'params', {}),
                correct_answers: _.get(variant, 'true_answer', {}),
                submitted_answers: submission ? _.get(submission, 'submitted_answer', {}) : {},
                format_errors: submission ? _.get(submission, 'format_errors', {}) : {},
                partial_scores: (!submission || submission.partial_scores == null) ? {} : submission.partial_scores,
                score: (!submission || submission.score == null) ? 0 : submission.score,
                feedback: (!submission || submission.feedback == null) ? {} : submission.feedback,
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
                raw_submitted_answers: submission ? _.get(submission, 'raw_submitted_answer', {}) : {},
                editable: !!locals.allowAnswerEditing,
                panel: panel,
            };

            // Put base URLs in data.options for access by question code
            data.options.client_files_question_url = locals.clientFilesQuestionUrl;
            data.options.client_files_course_url = locals.clientFilesCourseUrl;
            data.options.client_files_question_dynamic_url = locals.clientFilesQuestionGeneratedFileUrl;

            module.exports.processQuestion('render', pc, data, context, (err, courseErrs, _data, html, _fileData, renderedElementNames) => {
                if (ERR(err, callback)) return;
                callback(null, courseErrs, html, renderedElementNames);
            });
        });
    },

    render: function(renderSelection, variant, question, submission, submissions, course, locals, callback) {
        const htmls = {
            extraHeadersHtml: '',
            questionHtml: '',
            submissionHtmls: _.map(submissions, () => ''),
            answerHtml: '',
        };
        let allRenderedElementNames = [];
        const courseErrs = [];
        const pc = new codeCaller.PythonCaller();
        async.series([
            // FIXME: suppprt 'header'
            (callback) => {
                if (!renderSelection.question) return callback(null);
                module.exports.renderPanel('question', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html, renderedElementNames) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    htmls.questionHtml = html;
                    allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                    callback(null);
                });
            },
            (callback) => {
                if (!renderSelection.submissions) return callback(null);
                async.mapSeries(submissions, (submission, callback) => {
                    module.exports.renderPanel('submission', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html, renderedElementNames) => {
                        if (ERR(err, callback)) return;
                        courseErrs.push(...ret_courseErrs);
                        allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                        callback(null, html);
                    });
                }, (err, submissionHtmls) => {
                    if (ERR(err, callback)) return;
                    htmls.submissionHtmls = submissionHtmls;
                    callback(null);
                });
            },
            (callback) => {
                if (!renderSelection.answer) return callback(null);
                module.exports.renderPanel('answer', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html, renderedElementNames) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    htmls.answerHtml = html;
                    allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                    callback(null);
                });
            },
            (callback) => {
                module.exports.getContext(question, course, (err, context) => {
                    if (err) {
                        return callback(new Error(`Error generating options: ${err}`));
                    }

                    const dependencies = {
                        coreStyles: [],
                        coreScripts: [],
                        coreElementStyles: [],
                        coreElementScripts: [],
                        courseElementStyles: [],
                        courseElementScripts: [],
                        clientFilesCourseStyles: [],
                        clientFilesCourseScripts: []
                    };

                    // Gather dependencies for all rendered elements
                    allRenderedElementNames.forEach((elementName) => {
                        let elementDependencies;
                        let isCourseElement = false;
                        if (_.has(context.course_elements, elementName)) {
                            elementDependencies = context.course_elements[elementName].dependencies || {};
                            isCourseElement = true;
                        } else {
                            elementDependencies = coreElementsCache[elementName].dependencies || {};
                        }

                        elementDependencies = _.cloneDeep(elementDependencies);

                        // Transform non-global dependencies to be prefixed by the element name,
                        // since they'll be served from their element's directory
                        if (_.has(elementDependencies, 'elementStyles')) {
                            elementDependencies.elementStyles = elementDependencies.elementStyles.map(dep => `${elementName}/${dep}`);
                        }
                        if (_.has(elementDependencies, 'elementScripts')) {
                            elementDependencies.elementScripts = elementDependencies.elementScripts.map(dep => `${elementName}/${dep}`);
                        }

                        // Rename properties so we can track core and course
                        // element dependencies separately
                        if (isCourseElement) {
                            if (_.has(elementDependencies, 'elementStyles')) {
                                elementDependencies.courseElementStyles = elementDependencies.elementStyles;
                                delete elementDependencies.elementStyles;
                            }
                            if (_.has(elementDependencies, 'elementScripts')) {
                                elementDependencies.courseElementScripts = elementDependencies.elementScripts;
                                delete elementDependencies.elementScripts;
                            }
                        } else {
                            if (_.has(elementDependencies, 'elementStyles')) {
                                elementDependencies.coreElementStyles = elementDependencies.elementStyles;
                                delete elementDependencies.elementStyles;
                            }
                            if (_.has(elementDependencies, 'elementScripts')) {
                                elementDependencies.coreElementScripts = elementDependencies.elementScripts;
                                delete elementDependencies.elementScripts;
                            }
                        }

                        let depdendencyTypes = [
                            'coreStyles',
                            'coreScripts',
                            'clientFilesCourseStyles',
                            'clientFilesCourseScripts',
                            'coreElementStyles',
                            'coreElementScripts',
                            'courseElementStyles',
                            'courseElementScripts'
                        ];
                        for (const type of depdendencyTypes) {
                            if (_.has(elementDependencies, type)) {
                                if (_.isArray(elementDependencies[type])) {
                                    for (const dep of elementDependencies[type]) {
                                        if (!_.includes(dependencies[type], dep)) {
                                            dependencies[type].push(dep);
                                        }
                                    }
                                } else {
                                    const courseErr = new Error(`Error getting dependencies for ${elementName}: "${type}" is not an array`);
                                    courseErr.data = {elementDependencies};
                                    courseErr.fatal = true;
                                    courseErrs.push(courseErr);
                                }
                            }
                        }
                    });

                    // Transform dependency list into style/link tags
                    const coreScriptUrls = [];
                    const scriptUrls = [];
                    const styleUrls = [];
                    dependencies.coreStyles.forEach((file) => styleUrls.push(`/stylesheets/${file}`));
                    dependencies.coreScripts.forEach((file) => coreScriptUrls.push(`/javascripts/${file}`));
                    dependencies.clientFilesCourseStyles.forEach((file) => styleUrls.push(`/pl/course_instance/${course.id}/clientFilesCourse/${file}`));
                    dependencies.clientFilesCourseScripts.forEach((file) => scriptUrls.push(`/pl/course_instance/${course.id}/clientFilesCourse/${file}`));
                    dependencies.coreElementStyles.forEach((file) => styleUrls.push(`/pl/static/elements/${file}`));
                    dependencies.coreElementScripts.forEach((file) => scriptUrls.push(`/pl/static/elements/${file}`));
                    dependencies.courseElementStyles.forEach((file) => styleUrls.push(`/pl/course_instance/${course.id}/elements/${file}`));
                    dependencies.courseElementScripts.forEach((file) => scriptUrls.push(`/pl/course_instance/${course.id}/elements/${file}`));
                    const headerHtmls = [
                        ...styleUrls.map((url) => `<link href="${url}" rel="stylesheet" />`),
                        // It's important that any library-style scripts come first
                        ...coreScriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
                        ...scriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`)
                    ];
                    htmls.extraHeadersHtml = headerHtmls.join('\n');
                    callback(null);
                });
            }
        ], (err) => {
            pc.done();
            if (ERR(err, callback)) return;
            callback(null, courseErrs, htmls);
        });
    },

    file: function(filename, variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to get a file for a broken variant'));
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            const data = {
                params: _.get(variant, 'params', {}),
                correct_answers: _.get(variant, 'true_answer', {}),
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
                filename: filename,
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('file', pc, data, context, (err, courseErrs, _data, _html, fileData) => {
                pc.done();
                if (ERR(err, callback)) return;
                callback(null, courseErrs, fileData);
            });
        });
    },

    parse: function(submission, variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to parse broken variant'));
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            const data = {
                params: _.get(variant, 'params', {}),
                correct_answers: _.get(variant, 'true_answer', {}),
                submitted_answers: _.get(submission, 'submitted_answer', {}),
                format_errors: _.get(submission, 'format_errors', {}),
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
                raw_submitted_answers: _.get(submission, 'raw_submitted_answer', {}),
                gradable: _.get(submission, 'gradable', true),
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('parse', pc, data, context, (err, courseErrs, data, _html, _fileData) => {
                pc.done();
                if (ERR(err, callback)) return;
                if (_.size(data.format_errors) > 0) data.gradable = false;
                const ret_vals = {
                    params: data.params,
                    true_answer: data.correct_answers,
                    submitted_answer: data.submitted_answers,
                    raw_submitted_answer: data.raw_submitted_answers,
                    format_errors: data.format_errors,
                    gradable: data.gradable,
                };
                callback(null, courseErrs, ret_vals);
            });
        });
    },

    grade: function(submission, variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to grade broken variant'));
        if (submission.broken) return callback(new Error('attemped to grade broken submission'));
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            let data = {
                params: variant.params,
                correct_answers: variant.true_answer,
                submitted_answers: submission.submitted_answer,
                format_errors: submission.format_errors,
                partial_scores: (submission.partial_scores == null) ? {} : submission.partial_scores,
                score: (submission.score == null) ? 0 : submission.score,
                feedback: (submission.feedback == null) ? {} : submission.feedback,
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
                raw_submitted_answers: submission.raw_submitted_answer,
                gradable: submission.gradable,
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('grade', pc, data, context, (err, courseErrs, data, _html, _fileData) => {
                pc.done();
                if (ERR(err, callback)) return;
                if (_.size(data.format_errors) > 0) data.gradable = false;
                const ret_vals = {
                    params: data.params,
                    true_answer: data.correct_answers,
                    submitted_answer: data.submitted_answers,
                    format_errors: data.format_errors,
                    raw_submitted_answer: data.raw_submitted_answers,
                    partial_scores: data.partial_scores,
                    score: data.score,
                    feedback: data.feedback,
                    gradable: data.gradable,
                };
                callback(null, courseErrs, ret_vals);
            });
        });
    },

    test: function(variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to test broken variant'));
        module.exports.getContext(question, course, (err, context) => {
            if (err) {
                return callback(new Error(`Error generating options: ${err}`));
            }

            let data = {
                params: variant.params,
                correct_answers: variant.true_answer,
                format_errors: {},
                partial_scores: {},
                score: 0,
                feedback: {},
                variant_seed: parseInt(variant.variant_seed, 36),
                options: _.get(variant, 'options', {}),
                raw_submitted_answers: {},
                gradable: true,
            };
            const pc = new codeCaller.PythonCaller();
            module.exports.processQuestion('test', pc, data, context, (err, courseErrs, data, _html, _fileData) => {
                pc.done();
                if (ERR(err, callback)) return;
                if (_.size(data.format_errors) > 0) data.gradable = false;
                const ret_vals = {
                    params: data.params,
                    true_answer: data.correct_answers,
                    format_errors: data.format_errors,
                    raw_submitted_answer: data.raw_submitted_answers,
                    partial_scores: data.partial_scores,
                    score: data.score,
                    gradable: data.gradable,
                };
                callback(null, courseErrs, ret_vals);
            });
        });
    },

    getContext(question, course, callback) {
        const context = {
            question,
            course,
            question_dir: path.join(course.path, 'questions', question.directory),
            course_elements_dir: path.join(course.path, 'elements'),
        };
        module.exports.loadElementsForCourse(course, (err, elements) => {
            if (ERR(err, callback)) return;
            context.course_elements = elements;
            callback(null, context);
        });
    },
};
