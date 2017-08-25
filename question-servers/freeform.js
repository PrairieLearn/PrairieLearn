var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var mustache = require('mustache');
var cheerio = require('cheerio');

var { elements } = require('./elements');
var codeCaller = require('../lib/code-caller');

module.exports = {

    getElementFilename: function(elementName) {
        if (!elements.has(elementName)) {
            return 'No such element: "' + elementName + '"';
        }
        const elementModule = elements.get(elementName);
        return path.join(__dirname, 'elements', elementModule);
    },

    elementFunction: function(pc, fcn, elementName, $, element, index, data, context, callback) {
        let elementModule;
        let cwd;
        if (context.course_elements.has(elementName)) {
            cwd = context.course_elements_dir;
            elementModule = context.course_elements.get(elementName);
        } else if (elements.has(elementName)) {
            cwd = path.join(__dirname, 'elements');
            elementModule = elements.get(elementName);
        } else {
            return callback(new Error('Invalid element name: ' + elementName), null);
        }
        if (_.isString(elementModule)) {
            // python module
            const elementHtml = $(element).clone().wrap('<container/>').parent().html();
            const pythonArgs = [elementHtml, index, data];
            const pythonFile = elementModule.replace(/\.[pP][yY]$/, '');
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
            elementModule[fcn](...jsArgs, (err, ret) => {
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
        } else if (phase == 'get_dependencies') {
            return {
                globalStyles: [],
                globalScripts: [],
                styles: [],
                scripts: []
            };
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
        let allPhases = ['generate', 'prepare', 'render', 'get_dependencies', 'parse', 'grade', 'test', 'file'];
        let allPhasesButGetDependencies = _.pull([...allPhases], 'get_dependencies');

        if (!allPhases.includes(phase)) return `unknown phase: ${phase}`;

        /**************************************************************************************************************************************/
        //              property                 type       presentPhases                         changePhases
        /**************************************************************************************************************************************/
        err = checkProp('params',                'object',  allPhasesButGetDependencies,          ['generate', 'prepare']);    if (err) return err;
        err = checkProp('correct_answers',       'object',  allPhasesButGetDependencies,          ['generate', 'prepare']);    if (err) return err;
        err = checkProp('variant_seed',          'integer', allPhasesButGetDependencies,          []);                         if (err) return err;
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

        const isGetDependencies = phase === 'get_dependencies';

        var fileData = Buffer.from('');

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseErr = new Error('Invalid state before ' + phase + ': ' + checkErr);
            courseErr.fatal = true;
            courseErrs.push(courseErr);
            return callback(null, courseErrs, isGetDependencies ? elementDependencies : data, '', fileData);
        }

        const htmlFilename = path.join(context.question_dir, 'question.html');
        this.execTemplate(htmlFilename, data, (err, html, $) => {
            if (err) {
                const courseErr = new Error(htmlFilename + ': ' + err.toString());
                courseErr.fatal = true;
                courseErrs.push(courseErr);
                return callback(null, courseErrs, isGetDependencies ? elementDependencies : data, '', fileData);
            }

            const questionElements = new Set([...elements.keys(), ...context.course_elements.keys()]).values();

            let index = 0;
            async.eachSeries(questionElements, (elementName, callback) => {
                async.eachSeries($(elementName).toArray(), (element, callback) => {
                    if (phase === 'get_dependencies' && _.includes(renderedElementNames, element)) {
                        return callback(null);
                    }

                    renderedElementNames.push(elementName);
                    this.elementFunction(pc, phase, elementName, $, element, index, data, context, (err, ret_val, consoleLog) => {
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
                        } else if (phase == 'file') {
                            // Convert ret_val from base64 back to buffer (this always works,
                            // whether or not ret_val is valid base64)
                            var buf = Buffer.from(ret_val, 'base64');

                            // If the buffer has non-zero length...
                            if (buf.length > 0) {
                                if (fileData.length > 0) {
                                    // If fileData already has non-zero length, throw an error
                                    const elementFile = module.exports.getElementFilename(elementName);
                                    const courseErr = new Error(elementFile + ': Error calling ' + phase + '(): attempting to overwrite non-empty fileData');
                                    courseErr.fatal = true;
                                    courseErrs.push(courseErr);
                                    return callback(courseErr);
                                } else {
                                    // If not, replace fileData with buffer
                                    fileData = buf;
                                }
                            }
                        } else if (phase === 'get_dependencies') {
                            let depdendencyTypes = ['globalStyles', 'globalScripts', 'styles', 'scripts'];
                            for (const type of depdendencyTypes) {
                                // For course elements, track dependencies separately so
                                // we can properly construct the URLs
                                let mappedDepType = type;
                                if (context.course_elements.has(elementName)) {
                                    if (type === 'styles') {
                                        mappedDepType = 'courseStyles';
                                    } else if (type === 'scripts') {
                                        mappedDepType = 'courseScripts';
                                    }
                                }

                                if (_.has(ret_val, type)) {
                                    if (_.isArray(ret_val[type])) {
                                        for (const dep of ret_val[type]) {
                                            if (!_.includes(elementDependencies[mappedDepType], dep)) {
                                                elementDependencies[mappedDepType].push(dep);
                                            }
                                        }
                                    } else {
                                        const elementFile = module.exports.getElementFilename(elementName);
                                        const courseErr = new Error(`${elementFile}: Error calling ${phase}: "${type}" is not an array`);
                                        courseErr.data = {ret_val};
                                        courseErr.fatal = true;
                                        courseErrs.push(courseErr);
                                    }
                                }
                            }
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

                callback(null, courseErrs, isGetDependencies ? elementDependencies : data, $.html(), fileData);
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
            module.exports.processQuestionHtml(phase, pc, data, context, (err, courseErrs, data, html, fileData) => {
                if (ERR(err, callback)) return;
                const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                if (hasFatalError) return callback(null, courseErrs, data, html, fileData);
                module.exports.processQuestionServer(phase, pc, data, html, fileData, context, (err, ret_courseErrs, data, html, fileData) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    callback(null, courseErrs, data, html, fileData);
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
        const context = module.exports.getContext(question, course);
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('generate', pc, data, context, (err, courseErrs, data, _html, _fileData) => {
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
        if (variant.broken) return callback(new Error('attemped to prepare broken variant'));
        const data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
        };
        const context = module.exports.getContext(question, course);
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('prepare', pc, data, context, (err, courseErrs, data, _html, _fileData) => {
            pc.done();
            if (ERR(err, callback)) return;
            const ret_vals = {
                params: data.params,
                true_answer: data.correct_answers,
            };
            callback(null, courseErrs, ret_vals);
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
        const context = module.exports.getContext(question, course);

        // Put base URLs in data.options for access by question code
        data.options.client_files_question_url = locals.clientFilesQuestionUrl;
        data.options.client_files_course_url = locals.clientFilesCourseUrl;
        data.options.client_files_question_dynamic_url = locals.clientFilesQuestionGeneratedFileUrl;

        module.exports.processQuestion('render', pc, data, context, (err, courseErrs, _data, html, _fileData) => {
            if (ERR(err, callback)) return;
            callback(null, courseErrs, html);
        });
    },

    render: function(renderSelection, variant, question, submission, submissions, course, locals, callback) {
        const htmls = {
            extraHeadersHtml: '',
            questionHtml: '',
            submissionHtmls: _.map(submissions, () => ''),
            answerHtml: '',
        };
        const courseErrs = [];
        const pc = new codeCaller.PythonCaller();
        async.series([
            // FIXME: suppprt 'header'
            (callback) => {
                if (!renderSelection.question) return callback(null);
                module.exports.renderPanel('question', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    htmls.questionHtml = html;
                    callback(null);
                });
            },
            (callback) => {
                if (!renderSelection.submissions) return callback(null);
                async.mapSeries(submissions, (submission, callback) => {
                    module.exports.renderPanel('submission', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html) => {
                        if (ERR(err, callback)) return;
                        courseErrs.push(...ret_courseErrs);
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
                module.exports.renderPanel('answer', pc, variant, question, submission, course, locals, (err, ret_courseErrs, html) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);
                    htmls.answerHtml = html;
                    callback(null);
                });
            },
            (callback) => {
                const data = {
                    options: _.get(variant, 'options', {}),
                };
                const context = module.exports.getContext(question, course);
                module.exports.processQuestionHtml('get_dependencies', pc, data, context, (err, ret_courseErrs, dependencies) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...ret_courseErrs);

                    // Transform dependency list into style/link tags
                    const globalScriptUrls = [];
                    const scriptUrls = [];
                    const styleUrls = [];
                    dependencies.styles.forEach((file) => styleUrls.push(`/pl/static/elements/${file}`));
                    dependencies.scripts.forEach((file) => scriptUrls.push(`/pl/static/elements/${file}`));
                    dependencies.globalStyles.forEach((file) => styleUrls.push(`/stylesheets/${file}`));
                    dependencies.globalScripts.forEach((file) => globalScriptUrls.push(`/javascripts/${file}`));
                    dependencies.courseStyles.forEach((file) => styleUrls.push(`/pl/course_instance/${course.id}/elements/${file}`));
                    dependencies.courseScripts.forEach((file) => scriptUrls.push(`/pl/course_instance/${course.id}/elements/${file}`));
                    const headerHtmls = [
                        ...styleUrls.map((url) => `<link href="${url}" rel="stylesheet" />`),
                        // It's important that any library-style scripts come first
                        ...globalScriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
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
        const data = {
            params: _.get(variant, 'params', {}),
            correct_answers: _.get(variant, 'true_answer', {}),
            variant_seed: parseInt(variant.variant_seed, 36),
            options: _.get(variant, 'options', {}),
            filename: filename,
        };
        const context = module.exports.getContext(question, course);
        const pc = new codeCaller.PythonCaller();
        module.exports.processQuestion('file', pc, data, context, (err, courseErrs, _data, _html, fileData) => {
            pc.done();
            if (ERR(err, callback)) return;
            callback(null, courseErrs, fileData);
        });

    },

    parse: function(submission, variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to parse broken variant'));
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
        const context = module.exports.getContext(question, course);
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
    },

    grade: function(submission, variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to grade broken variant'));
        if (submission.broken) return callback(new Error('attemped to grade broken submission'));
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
        const context = module.exports.getContext(question, course);
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
    },

    test: function(variant, question, course, callback) {
        if (variant.broken) return callback(new Error('attemped to test broken variant'));
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
        const context = module.exports.getContext(question, course);
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
    },

    getContext(question, course) {
        const context = {
            question,
            course,
            question_dir: path.join(course.path, 'questions', question.directory),
            course_elements_dir: path.join(course.path, 'elements'),
        };
        try {
            // Clear cache in case course code has been reloaded
            delete require.cache[require.resolve(context.course_elements_dir)];
            context.course_elements = require(context.course_elements_dir).elements;
        } catch (e) {
            // This course doesn't have custom elements
            context.course_elements = new Map();
        }

        return context;
    },
};
