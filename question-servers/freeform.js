const ERR = require('async-stacktrace');
const async = require('async');
const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');
const mustache = require('mustache');
const cheerio = require('cheerio');
const hash = require('crypto').createHash;
const parse5 = require('parse5');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('../lib/logger');
const codeCaller = require('../lib/code-caller');
const workers = require('../lib/workers');
const jsonLoader = require('../lib/json-load');
const cache = require('../lib/cache');
const courseUtil = require('../lib/courseUtil');

// Maps core element names to element info
let coreElementsCache = {};
// Maps course IDs to course element info
const courseElementsCache = {};

module.exports = {

    init: function(callback) {
        // Populate the list of PrairieLearn elements
        module.exports.loadElements(path.join(__dirname, '..', 'elements'), 'core', (err, results) => {
            if (ERR(err, callback)) return;
            coreElementsCache = results;
            return callback(null);
        });
    },

    close: function(callback) {
        codeCaller.waitForFinish((err) => {
            if (ERR(err, callback)) return;
            callback(null);
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
                            info.name = elementName;
                            info.directory = path.join(sourceDir, elementName);
                            info.type = elementType;
                            elements[elementName] = info;
                            // For backwards compatibility
                            // TODO remove once everyone is using the new version
                            if (elementType === 'core') {
                                elements[elementName.replace(/-/g, '_')] = info;
                            }
                            callback(null);
                        });
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, elements);
                });
            },
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
            courseElementsCache[course.courseId] = elements;
            callback(null, courseElementsCache[course.courseId]);
        });
    },

    resolveElement: function(elementName, context) {
        if (_.has(context.course_elements, elementName)) {
            return context.course_elements[elementName];
        } else if (_.has(coreElementsCache, elementName)) {
            return coreElementsCache[elementName];
        } else {
            throw new Error(`No such element: ${elementName}`);
        }
    },

    getElementController: function(elementName, context) {
        const element = module.exports.resolveElement(elementName, context);
        return path.join(element.directory, element.controller);
    },

    elementFunction: async function(pc, fcn, elementName, elementHtml, data, context) {
        return new Promise((resolve, reject) => {
            const resolvedElement = module.exports.resolveElement(elementName, context);
            const cwd = resolvedElement.directory;
            const controller = resolvedElement.controller;
            const pythonArgs = [elementHtml, data];
            const pythonFile = controller.replace(/\.[pP][yY]$/, '');
            const opts = {
                cwd,
                paths: [path.join(__dirname, 'freeformPythonLib')],
            };
            pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
                if (err instanceof codeCaller.FunctionMissingError) {
                    // function wasn't present in server
                    return resolve([module.exports.defaultElementFunctionRet(fcn, data), '']);
                }
                if (ERR(err, reject)) return;
                resolve([ret, consoleLog]);
            });
        });
    },

    legacyElementFunction: function(pc, fcn, elementName, $, element, data, context, callback) {
        let resolvedElement;
        try {
            resolvedElement = module.exports.resolveElement(elementName, context);
        } catch (e) {
            return callback(e);
        }

        const cwd = resolvedElement.directory;
        const controller = resolvedElement.controller;

        if (_.isString(controller)) {
            // python module
            const elementHtml = $(element).clone().wrap('<container/>').parent().html();
            const pythonArgs = [elementHtml, data];
            const pythonFile = controller.replace(/\.[pP][yY]$/, '');
            const opts = {
                cwd,
                paths: [path.join(__dirname, 'freeformPythonLib')],
            };
            debug(`elementFunction(): pc.call(pythonFile=${pythonFile}, pythonFunction=${fcn})`);
            pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
                if (err instanceof codeCaller.FunctionMissingError) {
                    // function wasn't present in server
                    debug(`elementFunction(): function not present`);
                    return callback(null, module.exports.defaultElementFunctionRet(fcn, data), '');
                }
                if (ERR(err, callback)) return;
                debug(`elementFunction(): completed`);
                callback(null, ret, consoleLog);
            });
        } else {
            // JS module (FIXME: delete this block of code in future)
            const jsArgs = [$, element, null, data];
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
            paths: [path.join(__dirname, 'freeformPythonLib'), path.join(context.course_dir, 'serverFilesCourse')],
        };
        const fullFilename = path.join(context.question_dir, 'server.py');
        fs.access(fullFilename, fs.constants.R_OK, (err) => {
            if (err) {
                // server.py does not exist
                return callback(null, module.exports.defaultServerRet(phase, data, html, context), '');
            }

            debug(`execPythonServer(): pc.call(pythonFile=${pythonFile}, pythonFunction=${pythonFunction})`);
            pc.call(pythonFile, pythonFunction, pythonArgs, opts, (err, ret, consoleLog) => {
                if (err instanceof codeCaller.FunctionMissingError) {
                    // function wasn't present in server
                    debug(`execPythonServer(): function not present`);
                    return callback(null, module.exports.defaultServerRet(phase, data, html, context), '');
                }
                if (ERR(err, callback)) return;
                debug(`execPythonServer(): completed`);
                callback(null, ret, consoleLog);
            });
        });
    },

    execTemplate: function(htmlFilename, data, callback) {
        fs.readFile(htmlFilename, { encoding: 'utf8' }, (err, rawFile) => {
            if (ERR(err, callback)) return;
            let html;
            err = null;
            try {
                html = mustache.render(rawFile, data);
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
                    return `data.${prop} has been illegally modified, new value: "${JSON.stringify(data[prop])}", original value: "${JSON.stringify(origData[prop])}"`;
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

    travserseQuestionAndExecuteFunctions: async function(phase, pc, data, context, html, callback) {
        const origData = JSON.parse(JSON.stringify(data));
        const renderedElementNames = [];
        const courseIssues = [];
        let fileData = Buffer.from('');
        const questionElements = new Set([..._.keys(coreElementsCache), ..._.keys(context.course_elements)]);

        const visitNode = async (node) => {
            if (node.tagName && questionElements.has(node.tagName)) {
                const elementName = node.tagName;
                const elementFile = module.exports.getElementController(elementName, context);
                if (phase === 'render' && !_.includes(renderedElementNames, elementName)) {
                    renderedElementNames.push(elementName);
                }
                // We need to wrap it in another node, since only child nodes
                // are serialized
                const serializedNode = parse5.serialize({
                    childNodes: [node],
                });
                let ret_val, consoleLog;
                try {
                    [ret_val, consoleLog] = await module.exports.elementFunction(pc, phase, elementName, serializedNode, data, context);
                } catch (e) {
                    const courseIssue = new Error(`${elementFile}: Error calling ${phase}(): ${e.toString()}`);
                    courseIssue.data = e.data;
                    courseIssue.fatal = true;
                    // We'll catch this and add it to the course issues list
                    throw courseIssue;
                }
                if (_.isString(consoleLog) && consoleLog.length > 0) {
                    const courseIssue = new Error(`${elementFile}: output logged on console during ${phase}()`);
                    courseIssue.data = { outputBoth: consoleLog };
                    courseIssue.fatal = false;
                    courseIssues.push(courseIssue);
                }
                if (phase == 'render') {
                    if (!_.isString(ret_val)) {
                        const courseIssue = new Error(`${elementFile}: Error calling ${phase}(): return value is not a string`);
                        courseIssue.data = { ret_val };
                        courseIssue.fatal = true;
                        throw courseIssue;
                    }
                    node = parse5.parseFragment(ret_val);
                } else if (phase == 'file') {
                    // Convert ret_val from base64 back to buffer (this always works,
                    // whether or not ret_val is valid base64)
                    const buf = Buffer.from(ret_val, 'base64');
                    // If the buffer has non-zero length...
                    if (buf.length > 0) {
                        if (fileData.length > 0) {
                            // If fileData already has non-zero length, throw an error
                            const courseIssue = new Error(`${elementFile}: Error calling ${phase}(): attempting to overwrite non-empty fileData`);
                            courseIssue.fatal = true;
                            throw courseIssue;
                        } else {
                            // If not, replace fileData with buffer
                            fileData = buf;
                        }
                    }
                } else {
                    data = ret_val;
                    const checkErr = module.exports.checkData(data, origData, phase);
                    if (checkErr) {
                        const courseIssue = new Error(`${elementFile}: Invalid state after ${phase}(): ${checkErr}`);
                        courseIssue.fatal = true;
                        throw courseIssue;
                    }
                }
            }
            const newChildren = [];
            for (let i = 0; i < (node.childNodes || []).length; i++) {
                const childRes = await visitNode(node.childNodes[i]);
                if (childRes) {
                    if (childRes.nodeName === '#document-fragment') {
                        newChildren.push(...childRes.childNodes);
                    } else {
                        newChildren.push(childRes);
                    }
                }
            }
            node.childNodes = newChildren;
            return node;
        };
        let questionHtml = '';
        try {
            const res = await visitNode(parse5.parseFragment(html));
            questionHtml = parse5.serialize(res);
        } catch (e) {
            courseIssues.push(e);
        }
        callback(courseIssues, data, questionHtml, fileData, renderedElementNames);
    },

    legacyTraverseQuestionAndExecuteFunctions: function(phase, pc, data, context, $, callback) {
        const origData = JSON.parse(JSON.stringify(data));
        const renderedElementNames = [];
        const courseIssues = [];
        let fileData = Buffer.from('');
        const questionElements = new Set([..._.keys(coreElementsCache), ..._.keys(context.course_elements)]).values();

        async.eachSeries(questionElements, (elementName, callback) => {
            async.eachSeries($(elementName).toArray(), (element, callback) => {
                if (phase === 'render' && !_.includes(renderedElementNames, element)) {
                    renderedElementNames.push(elementName);
                }

                const elementFile = module.exports.getElementController(elementName, context);

                module.exports.legacyElementFunction(pc, phase, elementName, $, element, data, context, (err, ret_val, consoleLog) => {
                    if (err) {
                        const courseIssue = new Error(elementFile + ': Error calling ' + phase + '(): ' + err.toString());
                        courseIssue.data = err.data;
                        courseIssue.fatal = true;
                        courseIssues.push(courseIssue);
                        return callback(courseIssue);
                    }
                    if (_.isString(consoleLog) && consoleLog.length > 0) {
                        const courseIssue = new Error(elementFile + ': output logged on console during ' + phase + '()');
                        courseIssue.data = { outputBoth: consoleLog };
                        courseIssue.fatal = false;
                        courseIssues.push(courseIssue);
                    }

                    if (phase == 'render') {
                        if (!_.isString(ret_val)) {
                            const courseIssue = new Error(elementFile + ': Error calling ' + phase + '(): return value is not a string');
                            courseIssue.data = { ret_val };
                            courseIssue.fatal = true;
                            courseIssues.push(courseIssue);
                            return callback(courseIssue);
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
                                const courseIssue = new Error(elementFile + ': Error calling ' + phase + '(): attempting to overwrite non-empty fileData');
                                courseIssue.fatal = true;
                                courseIssues.push(courseIssue);
                                return callback(courseIssue);
                            } else {
                                // If not, replace fileData with buffer
                                fileData = buf;
                            }
                        }
                    } else {
                        data = ret_val;
                        const checkErr = module.exports.checkData(data, origData, phase);
                        if (checkErr) {
                            const courseIssue = new Error(elementFile + ': Invalid state after ' + phase + '(): ' + checkErr);
                            courseIssue.fatal = true;
                            courseIssues.push(courseIssue);
                            return callback(courseIssue);
                        }
                    }

                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, (err) => {
            // Black-hole any errors, they were (should have been) handled by course issues
            ERR(err, () => {});
            callback(courseIssues, data, $.html(), fileData, renderedElementNames);
        });
    },

    processQuestionHtml: function(phase, pc, data, context, callback) {
        const courseIssues = [];
        const origData = JSON.parse(JSON.stringify(data));

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseIssue = new Error('Invalid state before ' + phase + ': ' + checkErr);
            courseIssue.fatal = true;
            courseIssues.push(courseIssue);
            return callback(null, courseIssues, data, '', Buffer.from(''));
        }

        const htmlFilename = path.join(context.question_dir, 'question.html');
        module.exports.execTemplate(htmlFilename, data, (err, html, $) => {
            if (err) {
                const courseIssue = new Error(htmlFilename + ': ' + err.toString());
                courseIssue.fatal = true;
                courseIssues.push(courseIssue);
                return callback(null, courseIssues, data, '', Buffer.from(''));
            }

            // Switch based on which renderer is enabled for this course
            const useNewQuestionRenderer = _.get(context, 'course.options.useNewQuestionRenderer', false);
            let processFunction;
            let args;
            if (useNewQuestionRenderer) {
                processFunction = module.exports.travserseQuestionAndExecuteFunctions;
                args = [phase, pc, data, context, html];
            } else {
                processFunction = module.exports.legacyTraverseQuestionAndExecuteFunctions;
                args = [phase, pc, data, context, $];
            }

            processFunction(...args, (courseIssues, data, questionHtml, fileData, renderedElementNames) => {
                if (phase == 'grade' || phase == 'test') {
                    if (context.question.partial_credit) {
                        let total_weight = 0, total_weight_score = 0;
                        _.each(data.partial_scores, value => {
                            const score = _.get(value, 'score', 0);
                            const weight = _.get(value, 'weight', 1);
                            total_weight += weight;
                            total_weight_score += weight * score;
                        });
                        data.score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
                        data.feedback = {};
                    } else {
                        let score = 0;
                        if (_.size(data.partial_scores) > 0 && _.every(data.partial_scores, value => _.get(value, 'score', 0) >= 1)) {
                            score = 1;
                        }
                        data.score = score;
                        data.feedback = {};
                    }
                }

                callback(null, courseIssues, data, questionHtml, fileData, renderedElementNames);
            });
        });
    },

    processQuestionServer: function(phase, pc, data, html, fileData, context, callback) {
        const courseIssues = [];
        const origData = JSON.parse(JSON.stringify(data));

        const checkErr = module.exports.checkData(data, origData, phase);
        if (checkErr) {
            const courseIssue = new Error('Invalid state before calling server.' + phase + '(): ' + checkErr);
            courseIssue.fatal = true;
            courseIssues.push(courseIssue);
            return callback(null, courseIssues, data, '');
        }

        module.exports.execPythonServer(pc, phase, data, html, context, (err, ret_val, consoleLog) => {
            if (err) {
                const serverFile = path.join(context.question_dir, 'server.py');
                const courseIssue = new Error(serverFile + ': Error calling ' + phase + '(): ' + err.toString());
                courseIssue.data = err.data;
                courseIssue.fatal = true;
                courseIssues.push(courseIssue);
                return callback(null, courseIssues, data);
            }
            if (_.isString(consoleLog) && consoleLog.length > 0) {
                const serverFile = path.join(context.question_dir, 'server.py');
                const courseIssue = new Error(serverFile + ': output logged on console');
                courseIssue.data = { outputBoth: consoleLog };
                courseIssue.fatal = false;
                courseIssues.push(courseIssue);
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
                        const courseIssue = new Error(serverFile + ': Error calling ' + phase + '(): attempting to overwrite non-empty fileData');
                        courseIssue.fatal = true;
                        courseIssues.push(courseIssue);
                        return callback(null, courseIssues, data);
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
                const courseIssue = new Error(serverFile + ': Invalid state after ' + phase + '(): ' + checkErr);
                courseIssue.fatal = true;
                courseIssues.push(courseIssue);
                return callback(null, courseIssues, data);
            }

            callback(null, courseIssues, data, html, fileData);
        });
    },

    processQuestion: function(phase, pc, data, context, callback) {
        if (phase == 'generate') {
            module.exports.processQuestionServer(phase, pc, data, '', Buffer.from(''), context, (err, courseIssues, data, html, fileData) => {
                if (ERR(err, callback)) return;
                callback(null, courseIssues, data, html, fileData);
            });
        } else {
            module.exports.processQuestionHtml(phase, pc, data, context, (err, courseIssues, data, html, fileData, renderedElementNames) => {
                if (ERR(err, callback)) return;
                const hasFatalError = _.some(_.map(courseIssues, 'fatal'));
                if (hasFatalError) return callback(null, courseIssues, data, html, fileData);
                module.exports.processQuestionServer(phase, pc, data, html, fileData, context, (err, ret_courseIssues, data, html, fileData) => {
                    if (ERR(err, callback)) return;
                    courseIssues.push(...ret_courseIssues);
                    callback(null, courseIssues, data, html, fileData, renderedElementNames);
                });
            });
        }
    },

    generate: function(question, course, variant_seed, callback) {
        debug('generate()');
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('generate', pc, data, context, (err, courseIssues, data, _html, _fileData, _renderedElementNames) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
                        if (ERR(err, callback)) return;
                        const ret_vals = {
                            params: data.params,
                            true_answer: data.correct_answers,
                        };
                        debug(`generate(): completed`);
                        callback(null, courseIssues, ret_vals);
                    });
                });
            });
        });
    },

    prepare: function(question, course, variant, callback) {
        debug('prepare()');
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('prepare', pc, data, context, (err, courseIssues, data, _html, _fileData, _renderedElementNames) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
                        if (ERR(err, callback)) return;
                        const ret_vals = {
                            params: data.params,
                            true_answer: data.correct_answers,
                        };
                        debug(`prepare(): completed`);
                        callback(null, courseIssues, ret_vals);
                    });
                });
            });
        });
    },

    _getCacheKey: function(course, data, callback) {
        courseUtil.getOrUpdateCourseCommitHash(course, (err, commitHash) => {
            if (ERR(err, callback)) return;
            const dataHash = hash('sha1').update(JSON.stringify(data)).digest('base64');
            callback(null, `${commitHash}-${dataHash}`);
        });
    },

    renderPanel: function(panel, pc, variant, question, submission, course, locals, callback) {
        debug(`renderPanel(${panel})`);
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

            // Put key paths in data.options
            data.options.question_path = context.question_dir;
            data.options.client_files_question_path = path.join(context.question_dir, 'clientFilesQuestion');

            // This function will render the panel and then cache the results
            // if cacheKey is not null
            const doRender = (cacheKey) => {
                module.exports.processQuestion('render', pc, data, context, (err, courseIssues, _data, html, _fileData, renderedElementNames) => {
                    if (ERR(err, callback)) return;
                    if (cacheKey) {
                        cache.set(cacheKey, {
                            courseIssues,
                            html,
                            renderedElementNames,
                        });
                    }
                    const cacheHit = false; // Cache miss
                    callback(null, courseIssues, html, renderedElementNames, cacheHit);
                });
            };

            // This function will check the cache for the specified cache key
            // and either return the cached render for a cache hit, or render
            // the panel for a cache miss
            const getFromCacheOrRender = (cacheKey) => {
                cache.get(cacheKey, (err, cachedData) => {
                    // We don't actually want to fail if the cache has an error; we'll
                    // just render the panel as normal
                    ERR(err, (e) => logger.error(e));
                    if (!err && cachedData !== null) {
                        const {
                            courseIssues,
                            html,
                            renderedElementNames,
                        } = cachedData;

                        const cacheHit = true;
                        callback(null, courseIssues, html, renderedElementNames, cacheHit);
                    } else {
                        doRender(cacheKey);
                    }
                });
            };

            if (locals.devMode) {
                // In dev mode, we should skip caching so that we'll immediately
                // pick up new changes from disk
                doRender(null);
            } else {
                module.exports._getCacheKey(course, data, (err, cacheKey) => {
                    // If for some reason we failed to get a cache key, don't
                    // actually fail the request, just skip the cache entirely
                    // and render as usual
                    ERR(err, e => logger.error(e));
                    if (err || !cacheKey) {
                        doRender(null);
                    } else {
                        getFromCacheOrRender(cacheKey);
                    }
                });
            }
        });
    },

    render: function(renderSelection, variant, question, submission, submissions, course, course_instance, locals, callback) {
        debug(`render()`);
        const htmls = {
            extraHeadersHtml: '',
            questionHtml: '',
            submissionHtmls: _.map(submissions, () => ''),
            answerHtml: '',
        };
        let allRenderedElementNames = [];
        const courseIssues = [];
        let panelCount = 0, cacheHitCount = 0;
        workers.getPythonCaller((err, pc) => {
            if (ERR(err, callback)) return;
            async.series([
                // FIXME: suppprt 'header'
                (callback) => {
                    if (!renderSelection.question) return callback(null);
                    module.exports.renderPanel('question', pc, variant, question, submission, course, locals, (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                        if (ERR(err, callback)) return;
                        courseIssues.push(...ret_courseIssues);
                        htmls.questionHtml = html;
                        panelCount++;
                        if (cacheHit) cacheHitCount++;
                        allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                        callback(null);
                    });
                },
                (callback) => {
                    if (!renderSelection.submissions) return callback(null);
                    async.mapSeries(submissions, (submission, callback) => {
                        module.exports.renderPanel('submission', pc, variant, question, submission, course, locals, (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                            if (ERR(err, callback)) return;
                            courseIssues.push(...ret_courseIssues);
                            panelCount++;
                            if (cacheHit) cacheHitCount++;
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
                    module.exports.renderPanel('answer', pc, variant, question, submission, course, locals, (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                        if (ERR(err, callback)) return;
                        courseIssues.push(...ret_courseIssues);
                        htmls.answerHtml = html;
                        panelCount++;
                        if (cacheHit) cacheHitCount++;
                        allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                        callback(null);
                    });
                },
                (callback) => {
                    // The logPageView middleware knows to write this to the DB
                    // when we log the page view - sorry for mutable object hell
                    locals.panel_render_count = panelCount;
                    locals.panel_render_cache_hit_count = cacheHitCount;
                    callback(null);
                },
                (callback) => {
                    module.exports.getContext(question, course, (err, context) => {
                        if (err) {
                            return callback(new Error(`Error generating options: ${err}`));
                        }

                        const dependencies = {
                            coreStyles: [],
                            coreScripts: [],
                            nodeModulesStyles: [],
                            nodeModulesScripts: [],
                            coreElementStyles: [],
                            coreElementScripts: [],
                            courseElementStyles: [],
                            courseElementScripts: [],
                            clientFilesCourseStyles: [],
                            clientFilesCourseScripts: [],
                        };

                        // Gather dependencies for all rendered elements
                        allRenderedElementNames.forEach((elementName) => {
                            let resolvedElement = module.exports.resolveElement(elementName, context);
                            const elementDependencies = _.cloneDeep(resolvedElement.dependencies || {});

                            // Transform non-global dependencies to be prefixed by the element name,
                            // since they'll be served from their element's directory
                            if (_.has(elementDependencies, 'elementStyles')) {
                                elementDependencies.elementStyles = elementDependencies.elementStyles.map(dep => `${resolvedElement.name}/${dep}`);
                            }
                            if (_.has(elementDependencies, 'elementScripts')) {
                                elementDependencies.elementScripts = elementDependencies.elementScripts.map(dep => `${resolvedElement.name}/${dep}`);
                            }

                            // Rename properties so we can track core and course
                            // element dependencies separately
                            if (resolvedElement.type === 'course') {
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
                                'nodeModulesStyles',
                                'nodeModulesScripts',
                                'clientFilesCourseStyles',
                                'clientFilesCourseScripts',
                                'coreElementStyles',
                                'coreElementScripts',
                                'courseElementStyles',
                                'courseElementScripts',
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
                                        const courseIssue = new Error(`Error getting dependencies for ${resolvedElement.name}: "${type}" is not an array`);
                                        courseIssue.data = { elementDependencies };
                                        courseIssue.fatal = true;
                                        courseIssues.push(courseIssue);
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
                        dependencies.nodeModulesStyles.forEach((file) => styleUrls.push(`/node_modules/${file}`));
                        dependencies.nodeModulesScripts.forEach((file) => coreScriptUrls.push(`/node_modules/${file}`));
                        dependencies.clientFilesCourseStyles.forEach((file) => styleUrls.push(`/pl/course_instance/${course_instance.id}/clientFilesCourse/${file}`));
                        dependencies.clientFilesCourseScripts.forEach((file) => scriptUrls.push(`/pl/course_instance/${course_instance.id}/clientFilesCourse/${file}`));
                        dependencies.coreElementStyles.forEach((file) => styleUrls.push(`/pl/static/elements/${file}`));
                        dependencies.coreElementScripts.forEach((file) => scriptUrls.push(`/pl/static/elements/${file}`));
                        dependencies.courseElementStyles.forEach((file) => styleUrls.push(`/pl/course_instance/${course_instance.id}/elements/${file}`));
                        dependencies.courseElementScripts.forEach((file) => scriptUrls.push(`/pl/course_instance/${course_instance.id}/elements/${file}`));
                        const headerHtmls = [
                            ...styleUrls.map((url) => `<link href="${url}" rel="stylesheet" />`),
                            // It's important that any library-style scripts come first
                            ...coreScriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
                            ...scriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
                        ];
                        htmls.extraHeadersHtml = headerHtmls.join('\n');
                        callback(null);
                    });
                },
            ], (err) => {
                // don't immediately error here; we have to return the pythonCaller
                workers.returnPythonCaller(pc, (pcErr) => {
                    if (ERR(pcErr, callback)) return;
                    if (ERR(err, callback)) return;
                    callback(null, courseIssues, htmls);
                });
            });
        });
    },

    file: function(filename, variant, question, course, callback) {
        debug(`file()`);
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('file', pc, data, context, (err, courseIssues, _data, _html, fileData) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
                        if (ERR(err, callback)) return;
                        callback(null, courseIssues, fileData);
                    });
                });
            });
        });
    },

    parse: function(submission, variant, question, course, callback) {
        debug(`parse()`);
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('parse', pc, data, context, (err, courseIssues, data, _html, _fileData) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
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
                        callback(null, courseIssues, ret_vals);
                    });
                });
            });
        });
    },

    grade: function(submission, variant, question, course, callback) {
        debug(`grade()`);
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('grade', pc, data, context, (err, courseIssues, data, _html, _fileData) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
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
                        callback(null, courseIssues, ret_vals);
                    });
                });
            });
        });
    },

    test: function(variant, question, course, callback) {
        debug(`test()`);
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
            workers.getPythonCaller((err, pc) => {
                if (ERR(err, callback)) return;
                module.exports.processQuestion('test', pc, data, context, (err, courseIssues, data, _html, _fileData) => {
                    // don't immediately error here; we have to return the pythonCaller
                    workers.returnPythonCaller(pc, (pcErr) => {
                        if (ERR(pcErr, callback)) return;
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
                        callback(null, courseIssues, ret_vals);
                    });
                });
            });
        });
    },

    getContext(question, course, callback) {
        const context = {
            question,
            course,
            course_dir: course.path,
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
