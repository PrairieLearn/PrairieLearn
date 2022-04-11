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
const { promisify, callbackify } = require('util');

const schemas = require('../schemas');
const config = require('../lib/config');
const logger = require('../lib/logger');
const codeCaller = require('../lib/code-caller');
const workers = require('../lib/workers');
const jsonLoader = require('../lib/json-load');
const cache = require('../lib/cache');
const courseUtil = require('../lib/courseUtil');
const markdown = require('../lib/markdown');
const chunks = require('../lib/chunks');
const assets = require('../lib/assets');

// Maps core element names to element info
let coreElementsCache = {};
// Maps course IDs to course element info
let courseElementsCache = {};
/* Maps course IDs to course element extension info */
let courseExtensionsCache = {};

module.exports = {
  init: function (callback) {
    // Populate the list of PrairieLearn elements
    module.exports.loadElements(path.join(__dirname, '..', 'elements'), 'core', (err, results) => {
      if (ERR(err, callback)) return;
      coreElementsCache = results;
      return callback(null);
    });
  },

  close: function (callback) {
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
  loadElements: function (sourceDir, elementType, callback) {
    let elementSchema;
    async.waterfall(
      [
        (callback) => {
          switch (elementType) {
            case 'core':
              elementSchema = schemas.infoElementCore;
              break;
            case 'course':
              elementSchema = schemas.infoElementCourse;
              break;
            default:
              return callback(new Error(`Unknown element type ${elementType}`));
          }
          callback(null);
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
        async (files) => {
          /* Filter out any non-directories */
          return async.filter(files, async (file) => {
            const stats = await fs.promises.lstat(path.join(sourceDir, file));
            return stats.isDirectory();
          });
        },
        (elementNames, callback) => {
          const elements = {};
          async.each(
            elementNames,
            (elementName, callback) => {
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

                    if ('additionalNames' in info) {
                      info.additionalNames.forEach((name) => {
                        elements[name] = info;
                        elements[name.replace(/-/g, '_')] = info;
                      });
                    }
                  }
                  callback(null);
                });
              });
            },
            (err) => {
              if (ERR(err, callback)) return;
              return callback(null, elements);
            }
          );
        },
      ],
      (err, elements) => {
        if (ERR(err, callback)) return;
        return callback(null, elements);
      }
    );
  },

  async loadElementsAsync(sourceDir, elementType) {
    return promisify(module.exports.loadElements)(sourceDir, elementType);
  },

  async loadElementsForCourseAsync(course) {
    if (
      courseElementsCache[course.id] !== undefined &&
      courseElementsCache[course.id].commit_hash &&
      courseElementsCache[course.id].commit_hash === course.commit_hash
    ) {
      return courseElementsCache[course.id].data;
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    const elements = await module.exports.loadElementsAsync(
      path.join(coursePath, 'elements'),
      'course'
    );
    courseElementsCache[course.id] = {
      commit_hash: course.commit_hash,
      data: elements,
    };
    return elements;
  },

  /**
   * Takes a directory containing an extension directory and returns a new
   * object mapping element names to each extension, which itself an object
   * that contains relevant extension scripts and styles.
   * @param  {String}   sourceDir Absolute path to the directory of extensions
   */
  async loadExtensionsAsync(sourceDir) {
    const readdir = promisify(fs.readdir);
    const readJson = promisify(fs.readJson);

    /* Load each root element extension folder */
    let elementFolders;
    try {
      elementFolders = await readdir(sourceDir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // We don't really care if there are no extensions, just return an empty array.
        return [];
      } else {
        throw err;
      }
    }

    /* Get extensions from each element folder.  Each is stored as [ 'element name', 'extension name' ] */
    const elementArrays = (
      await async.map(elementFolders, async (element) => {
        const extensions = await readdir(path.join(sourceDir, element));
        return extensions.map((ext) => [element, ext]);
      })
    ).flat();

    /* Populate element map */
    const elements = {};
    elementArrays.forEach((extension) => {
      if (!(extension[0] in elements)) {
        elements[extension[0]] = {};
      }
    });

    /* Load extensions */
    await async.each(elementArrays, async (extension) => {
      const [element, extensionDir] = extension;
      const infoPath = path.join(sourceDir, element, extensionDir, 'info.json');

      let info;
      try {
        info = await readJson(infoPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          /* Not an extension directory, skip it. */
          logger.verbose(`${infoPath} not found, skipping...`);
          return;
        } else if (err.code === 'ENOTDIR') {
          /* Random file, skip it as well. */
          logger.verbose(`Found stray file ${infoPath}, skipping...`);
          return;
        } else {
          throw err;
        }
      }

      await jsonLoader.validateJSONAsync(info, schemas.infoElementExtension);
      info.name = extensionDir;
      info.directory = path.join(sourceDir, element, extensionDir);
      elements[element][extensionDir] = info;
    });

    return elements;
  },

  async loadExtensionsForCourseAsync(course) {
    if (
      courseExtensionsCache[course.id] !== undefined &&
      courseExtensionsCache[course.id].commit_hash &&
      courseExtensionsCache[course.id].commit_hash === course.commit_hash
    ) {
      return courseExtensionsCache[course.id].data;
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    let extensions = await module.exports.loadExtensionsAsync(
      path.join(coursePath, 'elementExtensions')
    );
    courseExtensionsCache[course.id] = {
      commit_hash: course.commit_hash,
      data: extensions,
    };
    return extensions;
  },

  /**
   * Wipes the element and extension cache.  This is only needed in
   * dev mode because each cache tracks Git commit hashes.
   */
  flushElementCache: function () {
    courseElementsCache = {};
    courseExtensionsCache = {};
  },

  resolveElement: function (elementName, context) {
    if (_.has(context.course_elements, elementName)) {
      return context.course_elements[elementName];
    } else if (_.has(coreElementsCache, elementName)) {
      return coreElementsCache[elementName];
    } else {
      throw new Error(`No such element: ${elementName}`);
    }
  },

  getElementController: function (elementName, context) {
    const element = module.exports.resolveElement(elementName, context);
    return path.join(element.directory, element.controller);
  },

  /**
   * Add clientFiles urls for elements and extensions.
   * Returns a copy of data with the new urls inserted.
   */
  getElementClientFiles: function (data, elementName, context) {
    let dataCopy = _.cloneDeep(data);
    /* The options field wont contain URLs unless in the 'render' stage, so check
           if it is populated before adding the element url */
    if ('base_url' in data.options) {
      /* Join the URL using Posix join to avoid generating a path with backslashes,
               as would be the case when running on Windows */
      dataCopy.options.client_files_element_url = path.posix.join(
        data.options.base_url,
        'elements',
        elementName,
        'clientFilesElement'
      );
      dataCopy.options.client_files_extensions_url = {};

      if (_.has(context.course_element_extensions, elementName)) {
        Object.keys(context.course_element_extensions[elementName]).forEach((extension) => {
          const url = path.posix.join(
            data.options.base_url,
            'elementExtensions',
            elementName,
            extension,
            'clientFilesExtension'
          );
          dataCopy.options.client_files_extensions_url[extension] = url;
        });
      }
    }
    return dataCopy;
  },

  elementFunction: async function (pc, fcn, elementName, elementHtml, data, context) {
    return new Promise((resolve, reject) => {
      const resolvedElement = module.exports.resolveElement(elementName, context);
      const cwd = resolvedElement.directory;
      const controller = resolvedElement.controller;
      const dataCopy = module.exports.getElementClientFiles(data, elementName, context);

      const pythonArgs = [elementHtml, dataCopy];
      const pythonFile = controller.replace(/\.[pP][yY]$/, '');
      const paths = [path.join(__dirname, 'freeformPythonLib')];
      if (resolvedElement.type === 'course') {
        paths.push(path.join(context.course_dir, 'serverFilesCourse'));
      }
      const opts = {
        cwd,
        paths,
      };
      pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
        if (err instanceof codeCaller.FunctionMissingError) {
          // function wasn't present in server
          return resolve([module.exports.defaultElementFunctionRet(fcn, dataCopy), '']);
        }
        if (ERR(err, reject)) return;
        resolve([ret, consoleLog]);
      });
    });
  },

  legacyElementFunction: function (pc, fcn, elementName, $, element, data, context, callback) {
    let resolvedElement;
    try {
      resolvedElement = module.exports.resolveElement(elementName, context);
    } catch (e) {
      return callback(e);
    }

    const cwd = resolvedElement.directory;
    const controller = resolvedElement.controller;
    const dataCopy = module.exports.getElementClientFiles(data, elementName, context);

    if (_.isString(controller)) {
      // python module
      const elementHtml = $(element).clone().wrap('<container/>').parent().html();
      const pythonArgs = [elementHtml, dataCopy];
      const pythonFile = controller.replace(/\.[pP][yY]$/, '');
      const paths = [path.join(__dirname, 'freeformPythonLib')];
      if (resolvedElement.type === 'course') {
        paths.push(path.join(context.course_dir, 'serverFilesCourse'));
      }
      const opts = {
        cwd,
        paths,
      };
      debug(`elementFunction(): pc.call(pythonFile=${pythonFile}, pythonFunction=${fcn})`);
      pc.call(pythonFile, fcn, pythonArgs, opts, (err, ret, consoleLog) => {
        if (err instanceof codeCaller.FunctionMissingError) {
          // function wasn't present in server
          debug(`elementFunction(): function not present`);
          return callback(null, module.exports.defaultElementFunctionRet(fcn, dataCopy), '');
        }
        if (ERR(err, callback)) return;
        debug(`elementFunction(): completed`);
        callback(null, ret, consoleLog);
      });
    } else {
      // JS module (FIXME: delete this block of code in future)
      const jsArgs = [$, element, null, dataCopy];
      controller[fcn](...jsArgs, (err, ret) => {
        if (ERR(err, callback)) return;
        callback(null, ret, '');
      });
    }
  },

  defaultElementFunctionRet: function (phase, data) {
    if (phase === 'render') {
      return '';
    } else if (phase === 'file') {
      return '';
    } else {
      return data;
    }
  },

  defaultServerRet: function (phase, data, html, _context) {
    if (phase === 'render') {
      return html;
    } else if (phase === 'file') {
      return '';
    } else {
      return data;
    }
  },

  execPythonServer: function (pc, phase, data, html, context, callback) {
    const pythonFile = 'server';
    const pythonFunction = phase;
    const pythonArgs = [data];
    if (phase === 'render') pythonArgs.push(html);
    const opts = {
      cwd: context.question_dir,
      paths: [
        path.join(__dirname, 'freeformPythonLib'),
        path.join(context.course_dir, 'serverFilesCourse'),
      ],
    };
    const fullFilename = path.join(context.question_dir, 'server.py');
    fs.access(fullFilename, fs.constants.R_OK, (err) => {
      if (err) {
        // server.py does not exist
        return callback(null, module.exports.defaultServerRet(phase, data, html, context), '');
      }

      debug(
        `execPythonServer(): pc.call(pythonFile=${pythonFile}, pythonFunction=${pythonFunction})`
      );
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

  execTemplate: function (htmlFilename, data, callback) {
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
      try {
        html = markdown.processQuestion(html);
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

  checkData: function (data, origData, phase) {
    const checked = [];
    const checkProp = (prop, type, presentPhases, editPhases) => {
      if (!presentPhases.includes(phase)) return null;
      if (!_.has(data, prop)) return '"' + prop + '" is missing from "data"';
      if (type === 'integer') {
        if (!_.isInteger(data[prop])) {
          return 'data.' + prop + ' is not an integer: ' + String(data[prop]);
        }
      } else if (type === 'number') {
        if (!_.isFinite(data[prop])) {
          return 'data.' + prop + ' is not a number: ' + String(data[prop]);
        }
      } else if (type === 'string') {
        if (!_.isString(data[prop])) {
          return 'data.' + prop + ' is not a string: ' + String(data[prop]);
        }
      } else if (type === 'boolean') {
        if (!_.isBoolean(data[prop])) {
          return 'data.' + prop + ' is not a boolean: ' + String(data[prop]);
        }
      } else if (type === 'object') {
        if (!_.isObject(data[prop])) {
          return 'data.' + prop + ' is not an object: ' + String(data[prop]);
        }
      } else {
        return 'invalid type: ' + String(type);
      }
      if (!editPhases.includes(phase)) {
        if (!_.has(origData, prop)) return '"' + prop + '" is missing from "origData"';
        if (!_.isEqual(data[prop], origData[prop])) {
          return `data.${prop} has been illegally modified, new value: "${JSON.stringify(
            data[prop]
          )}", original value: "${JSON.stringify(origData[prop])}"`;
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
    // The following code is deliberately formatted as it is to aid in comprehension,
    // so we prevent Prettier from reformatting the code to span multiple lines.
    // prettier-ignore
    err = checkProp('params',                'object',  allPhases,                            ['generate', 'prepare', 'grade']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('correct_answers',       'object',  allPhases,                            ['generate', 'prepare', 'parse', 'grade']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('variant_seed',          'integer', allPhases,                            []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('options',               'object',  allPhases,                            []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('submitted_answers',     'object',  ['render', 'parse', 'grade'],         ['parse', 'grade']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('format_errors',         'object',  ['render', 'parse', 'grade', 'test'], ['parse', 'grade', 'test']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('raw_submitted_answers', 'object',  ['render', 'parse', 'grade', 'test'], ['test']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('partial_scores',        'object',  ['render', 'grade', 'test'],          ['grade', 'test']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('score',                 'number',  ['render', 'grade', 'test'],          ['grade', 'test']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('feedback',              'object',  ['render', 'grade', 'test'],          ['grade', 'feedback']);
    if (err) return err;
    // prettier-ignore
    err = checkProp('editable',              'boolean', ['render'],                           []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('manual_grading',        'boolean', ['render'],                           []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('panel',                 'string',  ['render'],                           []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('gradable',              'boolean', ['parse', 'grade', 'test'],           []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('filename',              'string',  ['file'],                             []);
    if (err) return err;
    // prettier-ignore
    err = checkProp('test_type',             'string',  ['test'],                             []);
    if (err) return err;

    const extraProps = _.difference(_.keys(data), checked);
    if (extraProps.length > 0) return '"data" has invalid extra keys: ' + extraProps.join(', ');

    return null;
  },

  traverseQuestionAndExecuteFunctions: async function (phase, pc, data, context, html, callback) {
    const origData = JSON.parse(JSON.stringify(data));
    const renderedElementNames = [];
    const courseIssues = [];
    let fileData = Buffer.from('');
    const questionElements = new Set([
      ..._.keys(coreElementsCache),
      ..._.keys(context.course_elements),
    ]);

    const visitNode = async (node) => {
      if (node.tagName && questionElements.has(node.tagName)) {
        const elementName = node.tagName;
        const elementFile = module.exports.getElementController(elementName, context);
        if (phase === 'render' && !_.includes(renderedElementNames, elementName)) {
          renderedElementNames.push(elementName);
        }
        /* Populate the extensions used by this element */
        data.extensions = [];
        if (_.has(context.course_element_extensions, elementName)) {
          data.extensions = context.course_element_extensions[elementName];
        }
        // We need to wrap it in another node, since only child nodes
        // are serialized
        const serializedNode = parse5.serialize({
          childNodes: [node],
        });
        let ret_val, consoleLog;
        try {
          [ret_val, consoleLog] = await module.exports.elementFunction(
            pc,
            phase,
            elementName,
            serializedNode,
            data,
            context
          );
        } catch (e) {
          const courseIssue = new Error(
            `${elementFile}: Error calling ${phase}(): ${e.toString()}`
          );
          courseIssue.data = e.data;
          courseIssue.fatal = true;
          // We'll catch this and add it to the course issues list
          throw courseIssue;
        }
        /* We'll be sneaky and remove the extensions, since they're not used elsewhere */
        delete data.extensions;
        delete ret_val.extensions;
        if (_.isString(consoleLog) && consoleLog.length > 0) {
          const courseIssue = new Error(
            `${elementFile}: output logged on console during ${phase}()`
          );
          courseIssue.data = { outputBoth: consoleLog };
          courseIssue.fatal = false;
          courseIssues.push(courseIssue);
        }
        if (phase === 'render') {
          if (!_.isString(ret_val)) {
            const courseIssue = new Error(
              `${elementFile}: Error calling ${phase}(): return value is not a string`
            );
            courseIssue.data = { ret_val };
            courseIssue.fatal = true;
            throw courseIssue;
          }
          node = parse5.parseFragment(ret_val);
        } else if (phase === 'file') {
          // Convert ret_val from base64 back to buffer (this always works,
          // whether or not ret_val is valid base64)
          const buf = Buffer.from(ret_val, 'base64');
          // If the buffer has non-zero length...
          if (buf.length > 0) {
            if (fileData.length > 0) {
              // If fileData already has non-zero length, throw an error
              const courseIssue = new Error(
                `${elementFile}: Error calling ${phase}(): attempting to overwrite non-empty fileData`
              );
              courseIssue.fatal = true;
              throw courseIssue;
            } else {
              // If not, replace fileData with buffer
              fileData = buf;
            }
          }
        } else {
          // the following line is safe because we can't be in multiple copies of this function simultaneously
          data = ret_val; // eslint-disable-line require-atomic-updates
          const checkErr = module.exports.checkData(data, origData, phase);
          if (checkErr) {
            const courseIssue = new Error(
              `${elementFile}: Invalid state after ${phase}(): ${checkErr}`
            );
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
      // the following line is safe because we can't be in multiple copies of this function simultaneously
      node.childNodes = newChildren; // eslint-disable-line require-atomic-updates
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

  legacyTraverseQuestionAndExecuteFunctions: function (phase, pc, data, context, $, callback) {
    const origData = JSON.parse(JSON.stringify(data));
    const renderedElementNames = [];
    const courseIssues = [];
    let fileData = Buffer.from('');
    const questionElements = new Set([
      ..._.keys(coreElementsCache),
      ..._.keys(context.course_elements),
    ]).values();

    async.eachSeries(
      questionElements,
      (elementName, callback) => {
        async.eachSeries(
          $(elementName).toArray(),
          (element, callback) => {
            if (phase === 'render' && !_.includes(renderedElementNames, element)) {
              renderedElementNames.push(elementName);
            }

            const elementFile = module.exports.getElementController(elementName, context);
            /* Populate the extensions used by this element */
            data.extensions = [];
            if (_.has(context.course_element_extensions, elementName)) {
              data.extensions = context.course_element_extensions[elementName];
            }

            module.exports.legacyElementFunction(
              pc,
              phase,
              elementName,
              $,
              element,
              data,
              context,
              (err, ret_val, consoleLog) => {
                if (err) {
                  const courseIssue = new Error(
                    elementFile + ': Error calling ' + phase + '(): ' + err.toString()
                  );
                  courseIssue.data = err.data;
                  courseIssue.fatal = true;
                  courseIssues.push(courseIssue);
                  return callback(courseIssue);
                }
                delete data.extensions;
                delete ret_val.extensions;
                if (_.isString(consoleLog) && consoleLog.length > 0) {
                  const courseIssue = new Error(
                    elementFile + ': output logged on console during ' + phase + '()'
                  );
                  courseIssue.data = { outputBoth: consoleLog };
                  courseIssue.fatal = false;
                  courseIssues.push(courseIssue);
                }

                if (phase === 'render') {
                  if (!_.isString(ret_val)) {
                    const courseIssue = new Error(
                      elementFile + ': Error calling ' + phase + '(): return value is not a string'
                    );
                    courseIssue.data = { ret_val };
                    courseIssue.fatal = true;
                    courseIssues.push(courseIssue);
                    return callback(courseIssue);
                  }
                  $(element).replaceWith(ret_val);
                } else if (phase === 'file') {
                  // Convert ret_val from base64 back to buffer (this always works,
                  // whether or not ret_val is valid base64)
                  var buf = Buffer.from(ret_val, 'base64');

                  // If the buffer has non-zero length...
                  if (buf.length > 0) {
                    if (fileData.length > 0) {
                      // If fileData already has non-zero length, throw an error
                      const courseIssue = new Error(
                        elementFile +
                          ': Error calling ' +
                          phase +
                          '(): attempting to overwrite non-empty fileData'
                      );
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
                    const courseIssue = new Error(
                      elementFile + ': Invalid state after ' + phase + '(): ' + checkErr
                    );
                    courseIssue.fatal = true;
                    courseIssues.push(courseIssue);
                    return callback(courseIssue);
                  }
                }

                callback(null);
              }
            );
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
      (err) => {
        // Black-hole any errors, they were (should have been) handled by course issues
        ERR(err, () => {});
        callback(courseIssues, data, $.html(), fileData, renderedElementNames);
      }
    );
  },

  processQuestionHtml: function (phase, pc, data, context, callback) {
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
        processFunction = module.exports.traverseQuestionAndExecuteFunctions;
        args = [phase, pc, data, context, html];
      } else {
        processFunction = module.exports.legacyTraverseQuestionAndExecuteFunctions;
        args = [phase, pc, data, context, $];
      }

      processFunction(
        ...args,
        (courseIssues, data, questionHtml, fileData, renderedElementNames) => {
          if (phase === 'grade' || phase === 'test') {
            if (context.question.partial_credit) {
              let total_weight = 0,
                total_weight_score = 0;
              _.each(data.partial_scores, (value) => {
                const score = _.get(value, 'score', 0);
                const weight = _.get(value, 'weight', 1);
                total_weight += weight;
                total_weight_score += weight * score;
              });
              data.score = total_weight_score / (total_weight === 0 ? 1 : total_weight);
              data.feedback = {};
            } else {
              let score = 0;
              if (
                _.size(data.partial_scores) > 0 &&
                _.every(data.partial_scores, (value) => _.get(value, 'score', 0) >= 1)
              ) {
                score = 1;
              }
              data.score = score;
              data.feedback = {};
            }
          }

          callback(null, courseIssues, data, questionHtml, fileData, renderedElementNames);
        }
      );
    });
  },

  processQuestionServer: function (phase, pc, data, html, fileData, context, callback) {
    const courseIssues = [];
    const origData = JSON.parse(JSON.stringify(data));

    const checkErr = module.exports.checkData(data, origData, phase);
    if (checkErr) {
      const courseIssue = new Error(
        'Invalid state before calling server.' + phase + '(): ' + checkErr
      );
      courseIssue.fatal = true;
      courseIssues.push(courseIssue);
      return callback(null, courseIssues, data, '');
    }

    module.exports.execPythonServer(pc, phase, data, html, context, (err, ret_val, consoleLog) => {
      if (err) {
        const serverFile = path.join(context.question_dir, 'server.py');
        const courseIssue = new Error(
          serverFile + ': Error calling ' + phase + '(): ' + err.toString()
        );
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

      if (phase === 'render') {
        html = ret_val;
      } else if (phase === 'file') {
        // Convert ret_val from base64 back to buffer (this always works,
        // whether or not ret_val is valid base64)
        var buf = Buffer.from(ret_val, 'base64');

        // If the buffer has non-zero length...
        if (buf.length > 0) {
          if (fileData.length > 0) {
            // If fileData already has non-zero length, throw an error
            const serverFile = path.join(context.question_dir, 'server.py');
            const courseIssue = new Error(
              serverFile +
                ': Error calling ' +
                phase +
                '(): attempting to overwrite non-empty fileData'
            );
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
        const courseIssue = new Error(
          serverFile + ': Invalid state after ' + phase + '(): ' + checkErr
        );
        courseIssue.fatal = true;
        courseIssues.push(courseIssue);
        return callback(null, courseIssues, data);
      }

      callback(null, courseIssues, data, html, fileData);
    });
  },

  processQuestion: function (phase, pc, data, context, callback) {
    if (phase === 'generate') {
      module.exports.processQuestionServer(
        phase,
        pc,
        data,
        '',
        Buffer.from(''),
        context,
        (err, courseIssues, data, html, fileData) => {
          if (ERR(err, callback)) return;
          callback(null, courseIssues, data, html, fileData);
        }
      );
    } else {
      module.exports.processQuestionHtml(
        phase,
        pc,
        data,
        context,
        (err, courseIssues, data, html, fileData, renderedElementNames) => {
          if (ERR(err, callback)) return;
          const hasFatalError = _.some(_.map(courseIssues, 'fatal'));
          if (hasFatalError) return callback(null, courseIssues, data, html, fileData);
          module.exports.processQuestionServer(
            phase,
            pc,
            data,
            html,
            fileData,
            context,
            (err, ret_courseIssues, data, html, fileData) => {
              if (ERR(err, callback)) return;
              courseIssues.push(...ret_courseIssues);
              callback(null, courseIssues, data, html, fileData, renderedElementNames);
            }
          );
        }
      );
    }
  },

  /**
   * Gets any options that are available in any freeform phase.
   * These include file paths that are relevant for questions and elements.
   * URLs are not included here because those are only applicable during 'render'.
   */
  getContextOptions: function (context) {
    /* These options are always available in any phase. */

    let options = {};
    options.question_path = context.question_dir;
    options.client_files_question_path = path.join(context.question_dir, 'clientFilesQuestion');
    options.client_files_course_path = path.join(context.course_dir, 'clientFilesCourse');
    options.server_files_course_path = path.join(context.course_dir, 'serverFilesCourse');
    options.course_extensions_path = path.join(context.course_dir, 'elementExtensions');
    return options;
  },

  generate: function (question, course, variant_seed, callback) {
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
      _.extend(data.options, module.exports.getContextOptions(context));
      workers.getPythonCaller((err, pc) => {
        if (ERR(err, callback)) return;
        module.exports.processQuestion(
          'generate',
          pc,
          data,
          context,
          (err, courseIssues, data, _html, _fileData, _renderedElementNames) => {
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
          }
        );
      });
    });
  },

  prepare: function (question, course, variant, callback) {
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
      _.extend(data.options, module.exports.getContextOptions(context));
      workers.getPythonCaller((err, pc) => {
        if (ERR(err, callback)) return;
        module.exports.processQuestion(
          'prepare',
          pc,
          data,
          context,
          (err, courseIssues, data, _html, _fileData, _renderedElementNames) => {
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
          }
        );
      });
    });
  },

  renderPanel: function (panel, pc, variant, question, submission, course, locals, callback) {
    debug(`renderPanel(${panel})`);
    // broken variant kills all rendering
    if (variant.broken) return callback(null, [], 'Broken question due to error in question code');

    // broken submission kills the submission panel, but we can
    // proceed with other panels, treating the submission as
    // missing
    if (submission && submission.broken) {
      if (panel === 'submission') {
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
        partial_scores:
          !submission || submission.partial_scores == null ? {} : submission.partial_scores,
        score: !submission || submission.score == null ? 0 : submission.score,
        feedback: !submission || submission.feedback == null ? {} : submission.feedback,
        variant_seed: parseInt(variant.variant_seed, 36),
        options: _.get(variant, 'options', {}),
        raw_submitted_answers: submission ? _.get(submission, 'raw_submitted_answer', {}) : {},
        editable: !!(locals.allowAnswerEditing && !locals.manualGradingInterface),
        manual_grading: !!locals.manualGradingInterface,
        panel: panel,
      };

      // Put base URLs in data.options for access by question code
      data.options.client_files_question_url = locals.clientFilesQuestionUrl;
      data.options.client_files_course_url = locals.clientFilesCourseUrl;
      data.options.client_files_question_dynamic_url = locals.clientFilesQuestionGeneratedFileUrl;
      data.options.base_url = locals.baseUrl;
      data.options.workspace_url = locals.workspaceUrl || null;

      // Put key paths in data.options
      _.extend(data.options, module.exports.getContextOptions(context));

      module.exports.getCachedDataOrCompute(
        course,
        data,
        context,
        (callback) => {
          // function to do the actual render and return the cachedData
          module.exports.processQuestion(
            'render',
            pc,
            data,
            context,
            (err, courseIssues, _data, html, _fileData, renderedElementNames) => {
              if (ERR(err, callback)) return;
              const cachedData = {
                courseIssues,
                html,
                renderedElementNames,
              };
              callback(null, cachedData);
            }
          );
        },
        (cachedData, cacheHit) => {
          // function to process the cachedData, whether we
          // just rendered it or whether it came from cache
          const { courseIssues, html, renderedElementNames } = cachedData;
          callback(null, courseIssues, html, renderedElementNames, cacheHit);
        },
        callback // error-handling function
      );
    });
  },

  render: function (
    renderSelection,
    variant,
    question,
    submission,
    submissions,
    course,
    course_instance,
    locals,
    callback
  ) {
    debug(`render()`);
    const htmls = {
      extraHeadersHtml: '',
      questionHtml: '',
      submissionHtmls: _.map(submissions, () => ''),
      answerHtml: '',
    };
    let allRenderedElementNames = [];
    const courseIssues = [];
    let panelCount = 0,
      cacheHitCount = 0;
    workers.getPythonCaller((err, pc) => {
      if (ERR(err, callback)) return;
      async.series(
        [
          // FIXME: support 'header'
          (callback) => {
            if (!renderSelection.question) return callback(null);
            module.exports.renderPanel(
              'question',
              pc,
              variant,
              question,
              submission,
              course,
              locals,
              (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                if (ERR(err, callback)) return;
                courseIssues.push(...ret_courseIssues);
                htmls.questionHtml = html;
                panelCount++;
                if (cacheHit) cacheHitCount++;
                allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                callback(null);
              }
            );
          },
          (callback) => {
            if (!renderSelection.submissions) return callback(null);
            async.mapSeries(
              submissions,
              (submission, callback) => {
                module.exports.renderPanel(
                  'submission',
                  pc,
                  variant,
                  question,
                  submission,
                  course,
                  locals,
                  (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                    if (ERR(err, callback)) return;
                    courseIssues.push(...ret_courseIssues);
                    panelCount++;
                    if (cacheHit) cacheHitCount++;
                    allRenderedElementNames = _.union(
                      allRenderedElementNames,
                      renderedElementNames
                    );
                    callback(null, html);
                  }
                );
              },
              (err, submissionHtmls) => {
                if (ERR(err, callback)) return;
                htmls.submissionHtmls = submissionHtmls;
                callback(null);
              }
            );
          },
          (callback) => {
            if (!renderSelection.answer) return callback(null);
            module.exports.renderPanel(
              'answer',
              pc,
              variant,
              question,
              submission,
              course,
              locals,
              (err, ret_courseIssues, html, renderedElementNames, cacheHit) => {
                if (ERR(err, callback)) return;
                courseIssues.push(...ret_courseIssues);
                htmls.answerHtml = html;
                panelCount++;
                if (cacheHit) cacheHitCount++;
                allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
                callback(null);
              }
            );
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

              const extensions = context.course_element_extensions;
              const dependencies = {
                coreStyles: [],
                coreScripts: [],
                nodeModulesStyles: [],
                nodeModulesScripts: [],
                coreElementStyles: [],
                coreElementScripts: [],
                courseElementStyles: [],
                courseElementScripts: [],
                extensionStyles: [],
                extensionScripts: [],
                clientFilesCourseStyles: [],
                clientFilesCourseScripts: [],
                clientFilesQuestionStyles: [],
                clientFilesQuestionScripts: [],
              };

              /* Question dependencies are checked via schema on sync-time, so there's no need for sanity checks here. */
              for (let type in question.dependencies) {
                for (let dep of question.dependencies[type]) {
                  if (!_.includes(dependencies[type], dep)) {
                    dependencies[type].push(dep);
                  }
                }
              }

              // Gather dependencies for all rendered elements
              allRenderedElementNames.forEach((elementName) => {
                let resolvedElement = module.exports.resolveElement(elementName, context);
                const elementDependencies = _.cloneDeep(resolvedElement.dependencies || {});

                // Transform non-global dependencies to be prefixed by the element name,
                // since they'll be served from their element's directory
                if (_.has(elementDependencies, 'elementStyles')) {
                  elementDependencies.elementStyles = elementDependencies.elementStyles.map(
                    (dep) => `${resolvedElement.name}/${dep}`
                  );
                }
                if (_.has(elementDependencies, 'elementScripts')) {
                  elementDependencies.elementScripts = elementDependencies.elementScripts.map(
                    (dep) => `${resolvedElement.name}/${dep}`
                  );
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

                const dependencyTypes = [
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
                for (const type of dependencyTypes) {
                  if (_.has(elementDependencies, type)) {
                    if (_.isArray(elementDependencies[type])) {
                      for (const dep of elementDependencies[type]) {
                        if (!_.includes(dependencies[type], dep)) {
                          dependencies[type].push(dep);
                        }
                      }
                    } else {
                      const courseIssue = new Error(
                        `Error getting dependencies for ${resolvedElement.name}: "${type}" is not an array`
                      );
                      courseIssue.data = { elementDependencies };
                      courseIssue.fatal = true;
                      courseIssues.push(courseIssue);
                    }
                  }
                }

                /* Load any extensions if they exist */
                if (_.has(extensions, elementName)) {
                  for (const extensionName of Object.keys(extensions[elementName])) {
                    if (!_.has(extensions[elementName][extensionName], 'dependencies')) {
                      continue;
                    }

                    const extension = _.cloneDeep(
                      extensions[elementName][extensionName]
                    ).dependencies;
                    if (_.has(extension, 'extensionStyles')) {
                      extension.extensionStyles = extension.extensionStyles.map(
                        (dep) => `${elementName}/${extensionName}/${dep}`
                      );
                    }
                    if (_.has(extension, 'extensionScripts')) {
                      extension.extensionScripts = extension.extensionScripts.map(
                        (dep) => `${elementName}/${extensionName}/${dep}`
                      );
                    }

                    const dependencyTypes = [
                      'coreStyles',
                      'coreScripts',
                      'nodeModulesStyles',
                      'nodeModulesScripts',
                      'clientFilesCourseStyles',
                      'clientFilesCourseScripts',
                      'extensionStyles',
                      'extensionScripts',
                    ];

                    for (const type of dependencyTypes) {
                      if (_.has(extension, type)) {
                        if (_.isArray(extension[type])) {
                          for (const dep of extension[type]) {
                            if (!_.includes(dependencies[type], dep)) {
                              dependencies[type].push(dep);
                            }
                          }
                        } else {
                          const courseIssue = new Error(
                            `Error getting dependencies for extension ${extension.name}: "${type}" is not an array`
                          );
                          courseIssue.data = { elementDependencies };
                          courseIssue.fatal = true;
                          courseIssues.push(courseIssue);
                        }
                      }
                    }
                  }
                }
              });

              // Transform dependency list into style/link tags
              const coreScriptUrls = [];
              const scriptUrls = [];
              const styleUrls = [];
              dependencies.coreStyles.forEach((file) =>
                styleUrls.push(assets.assetPath(`stylesheets/${file}`))
              );
              dependencies.coreScripts.forEach((file) =>
                coreScriptUrls.push(assets.assetPath(`javascripts/${file}`))
              );
              dependencies.nodeModulesStyles.forEach((file) =>
                styleUrls.push(assets.nodeModulesAssetPath(file))
              );
              dependencies.nodeModulesScripts.forEach((file) =>
                coreScriptUrls.push(assets.nodeModulesAssetPath(file))
              );
              dependencies.clientFilesCourseStyles.forEach((file) =>
                styleUrls.push(`${locals.urlPrefix}/clientFilesCourse/${file}`)
              );
              dependencies.clientFilesCourseScripts.forEach((file) =>
                scriptUrls.push(`${locals.urlPrefix}/clientFilesCourse/${file}`)
              );
              dependencies.clientFilesQuestionStyles.forEach((file) =>
                styleUrls.push(`${locals.clientFilesQuestionUrl}/${file}`)
              );
              dependencies.clientFilesQuestionScripts.forEach((file) =>
                scriptUrls.push(`${locals.clientFilesQuestionUrl}/${file}`)
              );
              dependencies.coreElementStyles.forEach((file) =>
                styleUrls.push(assets.coreElementAssetPath(file))
              );
              dependencies.coreElementScripts.forEach((file) =>
                scriptUrls.push(assets.coreElementAssetPath(file))
              );
              dependencies.courseElementStyles.forEach((file) =>
                styleUrls.push(
                  assets.courseElementAssetPath(course.commit_hash, locals.urlPrefix, file)
                )
              );
              dependencies.courseElementScripts.forEach((file) =>
                scriptUrls.push(
                  assets.courseElementAssetPath(course.commit_hash, locals.urlPrefix, file)
                )
              );
              dependencies.extensionStyles.forEach((file) =>
                styleUrls.push(
                  assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file)
                )
              );
              dependencies.extensionScripts.forEach((file) =>
                scriptUrls.push(
                  assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file)
                )
              );

              const headerHtmls = [
                ...styleUrls.map((url) => `<link href="${url}" rel="stylesheet" />`),
                // It's important that any library-style scripts come first
                ...coreScriptUrls.map(
                  (url) => `<script type="text/javascript" src="${url}"></script>`
                ),
                ...scriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
              ];
              htmls.extraHeadersHtml = headerHtmls.join('\n');
              callback(null);
            });
          },
        ],
        (err) => {
          // don't immediately error here; we have to return the pythonCaller
          workers.returnPythonCaller(pc, (pcErr) => {
            if (ERR(pcErr, callback)) return;
            if (ERR(err, callback)) return;
            callback(null, courseIssues, htmls);
          });
        }
      );
    });
  },

  file: function (filename, variant, question, course, callback) {
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

      module.exports.getCachedDataOrCompute(
        course,
        data,
        context,
        (callback) => {
          // function to compute the file data and return the cachedData
          workers.getPythonCaller((err, pc) => {
            if (ERR(err, callback)) return;
            module.exports.processQuestion(
              'file',
              pc,
              data,
              context,
              (err, courseIssues, _data, _html, fileData) => {
                // don't immediately error here; we have to return the pythonCaller
                workers.returnPythonCaller(pc, (pcErr) => {
                  if (ERR(pcErr, callback)) return;
                  if (ERR(err, callback)) return;
                  const fileDataBase64 = (fileData || '').toString('base64');
                  const cachedData = { courseIssues, fileDataBase64 };
                  callback(null, cachedData);
                });
              }
            );
          });
        },
        (cachedData, _cacheHit) => {
          // function to process the cachedData, whether we
          // just rendered it or whether it came from cache
          const { courseIssues, fileDataBase64 } = cachedData;
          const fileData = Buffer.from(fileDataBase64, 'base64');
          callback(null, courseIssues, fileData);
        },
        callback // error-handling function
      );
    });
  },

  parse: function (submission, variant, question, course, callback) {
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
      _.extend(data.options, module.exports.getContextOptions(context));
      workers.getPythonCaller((err, pc) => {
        if (ERR(err, callback)) return;
        module.exports.processQuestion(
          'parse',
          pc,
          data,
          context,
          (err, courseIssues, data, _html, _fileData) => {
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
          }
        );
      });
    });
  },

  grade: function (submission, variant, question, course, callback) {
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
        partial_scores: submission.partial_scores == null ? {} : submission.partial_scores,
        score: submission.score == null ? 0 : submission.score,
        feedback: submission.feedback == null ? {} : submission.feedback,
        variant_seed: parseInt(variant.variant_seed, 36),
        options: _.get(variant, 'options', {}),
        raw_submitted_answers: submission.raw_submitted_answer,
        gradable: submission.gradable,
      };
      _.extend(data.options, module.exports.getContextOptions(context));
      workers.getPythonCaller((err, pc) => {
        if (ERR(err, callback)) return;
        module.exports.processQuestion(
          'grade',
          pc,
          data,
          context,
          (err, courseIssues, data, _html, _fileData) => {
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
          }
        );
      });
    });
  },

  test: function (variant, question, course, test_type, callback) {
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
        test_type: test_type,
      };
      _.extend(data.options, module.exports.getContextOptions(context));
      workers.getPythonCaller((err, pc) => {
        if (ERR(err, callback)) return;
        module.exports.processQuestion(
          'test',
          pc,
          data,
          context,
          (err, courseIssues, data, _html, _fileData) => {
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
          }
        );
      });
    });
  },

  async getContextAsync(question, course) {
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    const chunksToLoad = [
      {
        type: 'question',
        questionId: question.id,
      },
      {
        type: 'clientFilesCourse',
      },
      {
        type: 'serverFilesCourse',
      },
      {
        type: 'elements',
      },
      {
        type: 'elementExtensions',
      },
    ];
    await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);

    const context = {
      question,
      course,
      course_dir: coursePath,
      question_dir: path.join(coursePath, 'questions', question.directory),
      course_elements_dir: path.join(coursePath, 'elements'),
    };

    /* Load elements and any extensions */
    const elements = await module.exports.loadElementsForCourseAsync(course);
    const extensions = await module.exports.loadExtensionsForCourseAsync(course);

    context.course_elements = elements;
    context.course_element_extensions = extensions;

    return context;
  },

  getContext: function (question, course, callback) {
    return callbackify(module.exports.getContextAsync)(question, course, (err, context) => {
      if (ERR(err, callback)) return;
      callback(null, context);
    });
  },

  getCacheKey: function (course, data, context, callback) {
    courseUtil.getOrUpdateCourseCommitHash(course, (err, commitHash) => {
      if (ERR(err, callback)) return;
      const dataHash = hash('sha1').update(JSON.stringify({ data, context })).digest('base64');
      callback(null, `${commitHash}-${dataHash}`);
    });
  },

  getCachedDataOrCompute: function (course, data, context, computeFcn, processFcn, errorFcn) {
    // This function will compute the cachedData and cache it if
    // cacheKey is not null
    const doCompute = (cacheKey) => {
      computeFcn((err, cachedData) => {
        if (ERR(err, errorFcn)) return;

        // Course issues during question/file rendering aren't actually
        // treated as errors - that is, the `err` value in this callback
        // will be undefined, even if there are course issues. However,
        // we still want to avoid caching anything that produced a course
        // issue, as that might be a transitive error that would go away
        // if the user refreshed, even if they didn't create a new variant.
        // Also, the `Error` objects that we use for course issues can't be
        // easily round-tripped through a cache, which means that pulling
        // an error out of the cache means the instructor would see an
        // error message of `[object Object]` which is useless.
        //
        // tl;dr: don't cache any results that would create course issues.
        const hasCourseIssues = cachedData?.courseIssues?.length > 0;
        if (cacheKey && !hasCourseIssues) {
          cache.set(cacheKey, cachedData);
        }

        const cacheHit = false;
        processFcn(cachedData, cacheHit);
      });
    };

    // This function will check the cache for the specified
    // cacheKey and either return the cachedData for a cache hit,
    // or compute the cachedData for a cache miss
    const getFromCacheOrCompute = (cacheKey) => {
      cache.get(cacheKey, (err, cachedData) => {
        // We don't actually want to fail if the cache has an error; we'll
        // just compute the cachedData as normal
        ERR(err, (e) => logger.error('Error in cache.get()', e));

        const hasCachedData = !err && cachedData;
        // Previously, there was a bug where we would cache operations
        // that failed with a course issue. We've since fixed that bug,
        // but so that we can gracefully deploy the fix alongside code
        // that may still be incorrectly caching errors, we'll ignore
        // any result from the cache that has course issues and
        // unconditionally recompute it.
        //
        // TODO: once this has been deployed in production for a while,
        // we can safely remove this check, as we can guarantee that the
        // cache will no longer contain any entries with `courseIssues`.
        const hasCachedCourseIssues = cachedData?.courseIssues?.length > 0;
        if (hasCachedData && !hasCachedCourseIssues) {
          const cacheHit = true;
          processFcn(cachedData, cacheHit);
        } else {
          doCompute(cacheKey);
        }
      });
    };

    if (config.devMode) {
      // In dev mode, we should skip caching so that we'll immediately
      // pick up new changes from disk
      doCompute(null);
    } else {
      module.exports.getCacheKey(course, data, context, (err, cacheKey) => {
        // If for some reason we failed to get a cache key, don't
        // actually fail the request, just skip the cache entirely
        // and compute as usual
        ERR(err, (e) => logger.error('Error in getCacheKey()', e));
        if (err || !cacheKey) {
          doCompute(null);
        } else {
          getFromCacheOrCompute(cacheKey);
        }
      });
    }
  },
};
