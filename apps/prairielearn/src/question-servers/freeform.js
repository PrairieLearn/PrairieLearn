// @ts-check

import * as async from 'async';
import * as _ from 'lodash';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as mustache from 'mustache';
// Use slim export, which relies on htmlparser2 instead of parse5. This provides
// support for questions with legacy renderer.
import * as cheerio from 'cheerio/lib/slim';
import * as parse5 from 'parse5';
import debugfn from 'debug';
const objectHash = require('object-hash');

import { instrumented, metrics, instrumentedWithMetrics } from '@prairielearn/opentelemetry';
import { logger } from '@prairielearn/logger';
import { cache } from '@prairielearn/cache';

import * as schemas from '../schemas';
import { config } from '../lib/config';
import { withCodeCaller, FunctionMissingError } from '../lib/code-caller';
import * as jsonLoad from '../lib/json-load';
import { getOrUpdateCourseCommitHash } from '../models/course';
import * as markdown from '../lib/markdown';
import * as chunks from '../lib/chunks';
import * as assets from '../lib/assets';
import { APP_ROOT_PATH } from '../lib/paths';
import { features } from '../lib/features';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));

/**
 * @typedef {Object} QuestionProcessingContext
 * @property {import('../lib/db-types').Course} course
 * @property {import('../lib/db-types').Question} question
 * @property {string} course_dir
 * @property {string} course_dir_host
 * @property {string} question_dir
 * @property {string} question_dir_host
 * @property {'experimental' | 'default' | 'legacy'} renderer
 * @property {any} course_elements
 * @property {any} course_element_extensions
 */

// Maps core element names to element info
let coreElementsCache = {};
// Maps course IDs to course element info
let courseElementsCache = {};
// Maps course IDs to course element extension info
let courseExtensionsCache = {};

/**
 * @typedef {Object} CourseIssueErrorOptions
 * @property {any} [data]
 * @property {boolean} [fatal]
 * @property {Error} [cause]
 */
class CourseIssueError extends Error {
  /**
   *
   * @param {string} message
   * @param {CourseIssueErrorOptions} options
   */
  constructor(message, options) {
    super(message, { cause: options?.cause });
    this.name = 'CourseIssueError';
    this.data = options.data;
    this.fatal = options.fatal;
  }
}

export async function init() {
  // Populate the list of PrairieLearn elements
  coreElementsCache = await loadElements(path.join(APP_ROOT_PATH, 'elements'), 'core');
}

/**
 * Takes a directory containing element directories and returns an object
 * mapping element names to that element's controller, dependencies, etc.
 *
 * @param {string}   sourceDir Absolute path to the directory of elements
 * @param {'core' | 'course'} elementType The type of element to be loaded
 */
async function loadElements(sourceDir, elementType) {
  let elementSchema;
  switch (elementType) {
    case 'core':
      elementSchema = schemas.infoElementCore;
      break;
    case 'course':
      elementSchema = schemas.infoElementCourse;
      break;
    default:
      throw new Error(`Unknown element type ${elementType}`);
  }

  let files;
  try {
    files = await fs.readdir(sourceDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Directory doesn't exist, most likely a course with no elements.
      // Proceed with an empty object.
      return {};
    }

    throw err;
  }

  // Filter out any non-directories.
  const elementNames = await async.filter(files, async (file) => {
    const stats = await fs.promises.lstat(path.join(sourceDir, file));
    return stats.isDirectory();
  });

  // Construct a dictionary mapping element names to their info.
  const elements = {};
  await async.each(elementNames, async (elementName) => {
    const elementInfoPath = path.join(sourceDir, elementName, 'info.json');
    let info;
    try {
      info = await fs.readJSON(elementInfoPath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // This must not be an element directory, skip it
        logger.verbose(`${elementInfoPath} not found, skipping...`);
        return;
      }

      throw err;
    }

    jsonLoad.validateJSON(info, elementSchema);
    info.name = elementName;
    info.directory = path.join(sourceDir, elementName);
    info.type = elementType;
    elements[elementName] = info;

    // For backwards compatibility.
    // TODO remove once everyone is using the new version.
    if (elementType === 'core') {
      elements[elementName.replace(/-/g, '_')] = info;

      if ('additionalNames' in info) {
        info.additionalNames.forEach((name) => {
          elements[name] = info;
          elements[name.replace(/-/g, '_')] = info;
        });
      }
    }
  });

  return elements;
}

export async function loadElementsForCourse(course) {
  if (
    courseElementsCache[course.id] !== undefined &&
    courseElementsCache[course.id].commit_hash &&
    courseElementsCache[course.id].commit_hash === course.commit_hash
  ) {
    return courseElementsCache[course.id].data;
  }

  const coursePath = chunks.getRuntimeDirectoryForCourse(course);
  const elements = await loadElements(path.join(coursePath, 'elements'), 'course');
  courseElementsCache[course.id] = {
    commit_hash: course.commit_hash,
    data: elements,
  };
  return elements;
}

/**
 * Takes a directory containing an extension directory and returns a new
 * object mapping element names to each extension, which itself an object
 * that contains relevant extension scripts and styles.
 *
 * @param {string} sourceDir Absolute path to the directory of extensions
 * @param {string} runtimeDir The path that the worker will load extensions from
 */
export async function loadExtensions(sourceDir, runtimeDir) {
  // Load each root element extension folder
  let elementFolders;
  try {
    elementFolders = await fs.readdir(sourceDir);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // We don't really care if there are no extensions, just return an empty object.
      return {};
    }

    throw err;
  }

  // Get extensions from each element folder.  Each is stored as
  // `['element name', 'extension name']`
  const elementArrays = (
    await async.map(elementFolders, async (element) => {
      const extensions = await fs.readdir(path.join(sourceDir, element));
      return extensions.map((ext) => [element, ext]);
    })
  ).flat();

  // Populate element map
  const elements = {};
  elementArrays.forEach((extension) => {
    if (!(extension[0] in elements)) {
      elements[extension[0]] = {};
    }
  });

  // Load extensions
  await async.each(elementArrays, async (extension) => {
    const [element, extensionDir] = extension;
    const infoPath = path.join(sourceDir, element, extensionDir, 'info.json');

    let info;
    try {
      info = await fs.readJson(infoPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Not an extension directory, skip it.
        logger.verbose(`${infoPath} not found, skipping...`);
        return;
      } else if (err.code === 'ENOTDIR') {
        // Random file, skip it as well.
        logger.verbose(`Found stray file ${infoPath}, skipping...`);
        return;
      } else {
        throw err;
      }
    }

    jsonLoad.validateJSON(info, schemas.infoElementExtension);
    info.name = extensionDir;
    info.directory = path.join(runtimeDir, element, extensionDir);
    elements[element][extensionDir] = info;
  });

  return elements;
}

async function loadExtensionsForCourse(context) {
  const { course, course_dir, course_dir_host } = context;
  if (
    courseExtensionsCache[course.id] !== undefined &&
    courseExtensionsCache[course.id].commit_hash &&
    courseExtensionsCache[course.id].commit_hash === course.commit_hash
  ) {
    return courseExtensionsCache[course.id].data;
  }

  const extensions = await loadExtensions(
    path.join(course_dir_host, 'elementExtensions'),
    path.join(course_dir, 'elementExtensions'),
  );
  courseExtensionsCache[course.id] = {
    commit_hash: course.commit_hash,
    data: extensions,
  };
  return extensions;
}

/**
 * Wipes the element and extension cache.  This is only needed in
 * dev mode because each cache tracks Git commit hashes.
 */
export function flushElementCache() {
  courseElementsCache = {};
  courseExtensionsCache = {};
}

function resolveElement(elementName, context) {
  if (_.has(context.course_elements, elementName)) {
    return context.course_elements[elementName];
  } else if (_.has(coreElementsCache, elementName)) {
    return coreElementsCache[elementName];
  } else {
    throw new Error(`No such element: ${elementName}`);
  }
}

function getElementController(elementName, context) {
  const element = resolveElement(elementName, context);
  return path.join(element.directory, element.controller);
}

/**
 * Add clientFiles urls for elements and extensions.
 * Returns a copy of data with the new urls inserted.
 */
function getElementClientFiles(data, elementName, context) {
  let dataCopy = _.cloneDeep(data);
  // The options field wont contain URLs unless in the 'render' stage, so
  // check if it is populated before adding the element url
  if ('base_url' in data.options) {
    // Join the URL using Posix join to avoid generating a path with
    // backslashes, as would be the case when running on Windows.
    dataCopy.options.client_files_element_url = path.posix.join(
      data.options.base_url,
      'elements',
      elementName,
      'clientFilesElement',
    );
    dataCopy.options.client_files_extensions_url = {};

    if (_.has(context.course_element_extensions, elementName)) {
      Object.keys(context.course_element_extensions[elementName]).forEach((extension) => {
        const url = path.posix.join(
          data.options.base_url,
          'elementExtensions',
          elementName,
          extension,
          'clientFilesExtension',
        );
        dataCopy.options.client_files_extensions_url[extension] = url;
      });
    }
  }
  return dataCopy;
}

async function elementFunction(codeCaller, fcn, elementName, elementHtml, data, context) {
  const resolvedElement = resolveElement(elementName, context);
  const { controller, type: resolvedElementType, name: resolvedElementName } = resolvedElement;
  const dataCopy = getElementClientFiles(data, elementName, context);

  const pythonArgs = [elementHtml, dataCopy];
  const pythonFile = controller.replace(/\.[pP][yY]$/, '');
  const type = `${resolvedElementType}-element`;
  const directory = resolvedElementName;

  try {
    return await codeCaller.call(type, directory, pythonFile, fcn, pythonArgs);
  } catch (err) {
    if (err instanceof FunctionMissingError) {
      // function wasn't present in server
      return {
        result: defaultElementFunctionRet(fcn, dataCopy),
        output: '',
      };
    }
    throw err;
  }
}

function defaultElementFunctionRet(phase, data) {
  if (phase === 'render') {
    return '';
  } else if (phase === 'file') {
    return '';
  } else {
    return data;
  }
}

function defaultServerRet(phase, data, html, _context) {
  if (phase === 'render') {
    return html;
  } else if (phase === 'file') {
    return '';
  } else {
    return data;
  }
}

async function execPythonServer(codeCaller, phase, data, html, context) {
  const pythonFile = 'server';
  const pythonFunction = phase;
  const pythonArgs = [data];
  if (phase === 'render') pythonArgs.push(html);
  const fullFilename = path.join(context.question_dir_host, 'server.py');
  const type = 'question';
  const directory = context.question.directory;

  try {
    await fs.access(fullFilename, fs.constants.R_OK);
  } catch (err) {
    // server.py does not exist
    return { result: defaultServerRet(phase, data, html, context), output: '' };
  }

  debug(
    `execPythonServer(): codeCaller.call(pythonFile=${pythonFile}, pythonFunction=${pythonFunction})`,
  );
  try {
    const { result, output } = await codeCaller.call(
      type,
      directory,
      pythonFile,
      pythonFunction,
      pythonArgs,
    );
    debug(`execPythonServer(): completed`);
    return { result, output };
  } catch (err) {
    if (err instanceof FunctionMissingError) {
      // function wasn't present in server
      debug(`execPythonServer(): function not present`);
      return {
        result: defaultServerRet(phase, data, html, context),
        output: '',
      };
    }
    throw err;
  }
}

async function execTemplate(htmlFilename, data) {
  const rawFile = await fs.readFile(htmlFilename, { encoding: 'utf8' });
  let html = mustache.render(rawFile, data);
  html = markdown.processQuestion(html);
  const $ = cheerio.load(html, {
    recognizeSelfClosing: true,
  });
  return { html, $ };
}

function checkData(data, origData, phase) {
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
          data[prop],
        )}", original value: "${JSON.stringify(origData[prop])}"`;
      }
    }
    checked.push(prop);
    return null;
  };

  let err;
  let allPhases = ['generate', 'prepare', 'render', 'parse', 'grade', 'test', 'file'];

  if (!allPhases.includes(phase)) return `unknown phase: ${phase}`;

  // The following code is deliberately formatted as it is to aid in comprehension,
  // so we prevent Prettier from reformatting the code to span multiple lines.
  // prettier-ignore
  /**************************************************************************************************************************************/
  //              property                 type       presentPhases                         changePhases
  /**************************************************************************************************************************************/
  err = checkProp('params',                'object',  allPhases,                            ['generate', 'prepare', 'grade'])
       || checkProp('correct_answers',       'object',  allPhases,                            ['generate', 'prepare', 'parse', 'grade'])
       || checkProp('variant_seed',          'integer', allPhases,                            [])
       || checkProp('options',               'object',  allPhases,                            [])
       || checkProp('submitted_answers',     'object',  ['render', 'parse', 'grade'],         ['parse', 'grade'])
       || checkProp('format_errors',         'object',  ['render', 'parse', 'grade', 'test'], ['parse', 'grade', 'test'])
       || checkProp('raw_submitted_answers', 'object',  ['render', 'parse', 'grade', 'test'], ['test'])
       || checkProp('partial_scores',        'object',  ['render', 'grade', 'test'],          ['grade', 'test'])
       || checkProp('score',                 'number',  ['render', 'grade', 'test'],          ['grade', 'test'])
       || checkProp('feedback',              'object',  ['render', 'parse', 'grade', 'test'], ['grade', 'parse', 'test'])
       || checkProp('editable',              'boolean', ['render'],                           [])
       || checkProp('manual_grading',        'boolean', ['render'],                           [])
       || checkProp('panel',                 'string',  ['render'],                           [])
       || checkProp('num_valid_submissions','integer',  ['render'],                           [])
       || checkProp('gradable',              'boolean', ['parse', 'grade', 'test'],           [])
       || checkProp('filename',              'string',  ['file'],                             [])
       || checkProp('test_type',             'string',  ['test'],                             [])
       || checkProp('answers_names',         'object',  ['prepare'],                          ['prepare']);
  if (err) return err;

  const extraProps = _.difference(_.keys(data), checked);
  if (extraProps.length > 0) return '"data" has invalid extra keys: ' + extraProps.join(', ');

  return null;
}

/**
 *
 * @param {string} phase
 * @param {import('../lib/code-caller').CodeCaller} codeCaller
 * @param {any} data
 * @param {any} context
 * @param {string} html
 */
async function experimentalProcess(phase, codeCaller, data, context, html) {
  const pythonContext = {
    html,
    elements: {
      ...coreElementsCache,
      // Course elements should always take precedence over core elements.
      ...context.course_elements,
    },
    element_extensions: context.course_element_extensions,
    course_path: config.workersExecutionMode === 'container' ? '/course' : context.course_dir_host,
  };
  const courseIssues = [];
  let result = null;
  let output = null;

  try {
    const res = await codeCaller.call(
      'question',
      context.question.directory,
      'question.html',
      phase,
      [data, pythonContext],
    );
    result = res.result;
    output = res.output;
  } catch (err) {
    courseIssues.push(err);
  }

  if ((output?.length ?? 0) > 0) {
    courseIssues.push(
      new CourseIssueError(`output logged on console during ${phase}()`, {
        data: { outputBoth: output },
        fatal: false,
      }),
    );
  }

  return {
    courseIssues,
    data: result?.data ?? data,
    html: result?.html ?? '',
    fileData: Buffer.from(result?.file ?? '', 'base64'),
    renderedElementNames: result?.processed_elements ?? [],
  };
}

async function traverseQuestionAndExecuteFunctions(phase, codeCaller, data, context, html) {
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
      const elementFile = getElementController(elementName, context);
      if (phase === 'render' && !_.includes(renderedElementNames, elementName)) {
        renderedElementNames.push(elementName);
      }
      // Populate the extensions used by this element.
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
        ({ result: ret_val, output: consoleLog } = await elementFunction(
          codeCaller,
          phase,
          elementName,
          serializedNode,
          data,
          context,
        ));
      } catch (e) {
        // We'll catch this and add it to the course issues list
        throw new CourseIssueError(`${elementFile}: Error calling ${phase}(): ${e.toString()}`, {
          cause: e,
          data: e.data,
          fatal: true,
        });
      }

      // We'll be sneaky and remove the extensions, since they're not used elsewhere.
      delete data.extensions;
      delete ret_val.extensions;
      if (_.isString(consoleLog) && consoleLog.length > 0) {
        courseIssues.push(
          new CourseIssueError(`${elementFile}: output logged on console during ${phase}()`, {
            data: { outputBoth: consoleLog },
            fatal: false,
          }),
        );
      }
      if (phase === 'render') {
        if (!_.isString(ret_val)) {
          throw new CourseIssueError(
            `${elementFile}: Error calling ${phase}(): return value is not a string`,
            { data: ret_val, fatal: true },
          );
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
            throw new CourseIssueError(
              `${elementFile}: Error calling ${phase}(): attempting to overwrite non-empty fileData`,
              { fatal: true },
            );
          } else {
            // If not, replace fileData with buffer
            fileData = buf;
          }
        }
      } else {
        // the following line is safe because we can't be in multiple copies of this function simultaneously
        data = ret_val;
        const checkErr = checkData(data, origData, phase);
        if (checkErr) {
          throw new CourseIssueError(
            `${elementFile}: Invalid state after ${phase}(): ${checkErr}`,
            { fatal: true },
          );
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

  return {
    courseIssues,
    data,
    html: questionHtml,
    fileData,
    renderedElementNames,
  };
}

async function legacyTraverseQuestionAndExecuteFunctions(phase, codeCaller, data, context, $) {
  const origData = JSON.parse(JSON.stringify(data));
  const renderedElementNames = [];
  const courseIssues = [];
  let fileData = Buffer.from('');
  const questionElements = new Set([
    ..._.keys(coreElementsCache),
    ..._.keys(context.course_elements),
  ]).values();

  try {
    await async.eachSeries(questionElements, async (elementName) => {
      await async.eachSeries($(elementName).toArray(), async (element) => {
        if (phase === 'render' && !_.includes(renderedElementNames, element)) {
          renderedElementNames.push(elementName);
        }

        const elementFile = getElementController(elementName, context);
        // Populate the extensions used by this element
        data.extensions = [];
        if (_.has(context.course_element_extensions, elementName)) {
          data.extensions = context.course_element_extensions[elementName];
        }

        const elementHtml = $(element).clone().wrap('<container/>').parent().html();

        let result, output;
        try {
          ({ result, output } = await elementFunction(
            codeCaller,
            phase,
            elementName,
            elementHtml,
            data,
            context,
          ));
        } catch (err) {
          const courseIssue = new CourseIssueError(
            `${elementFile}: Error calling ${phase}(): ${err.toString()}`,
            { data: err.data, fatal: true },
          );
          courseIssues.push(courseIssue);

          // We won't actually use this error, but we do still need to throw
          // it to abort the current traversal.
          throw courseIssue;
        }

        delete data.extensions;
        delete result.extensions;
        if (_.isString(output) && output.length > 0) {
          courseIssues.push(
            new CourseIssueError(
              elementFile + ': output logged on console during ' + phase + '()',
              { data: { outputBoth: output }, fatal: false },
            ),
          );
        }

        if (phase === 'render') {
          if (!_.isString(output)) {
            const courseIssue = new CourseIssueError(
              elementFile + ': Error calling ' + phase + '(): return value is not a string',
              { data: { result }, fatal: true },
            );
            courseIssues.push(courseIssue);

            // As above, we just throw to abort the traversal.
            throw courseIssue;
          }

          $(element).replaceWith(result);
        } else if (phase === 'file') {
          // Convert ret_val from base64 back to buffer (this always works,
          // whether or not ret_val is valid base64)
          const buf = Buffer.from(result, 'base64');

          // If the buffer has non-zero length...
          if (buf.length > 0) {
            if (fileData.length > 0) {
              // If fileData already has non-zero length, throw an error
              const courseIssue = new CourseIssueError(
                `${elementFile}: Error calling ${phase}(): attempting to overwrite non-empty fileData`,
                { fatal: true },
              );
              courseIssues.push(courseIssue);

              // As above, throw the error to abort the traversal.
              throw courseIssue;
            } else {
              // If not, replace fileData with buffer
              fileData = buf;
            }
          }
        } else {
          data = result;
          const checkErr = checkData(data, origData, phase);
          if (checkErr) {
            const courseIssue = new CourseIssueError(
              `${elementFile}: Invalid state after ${phase}(): ${checkErr}`,
              { fatal: true },
            );
            courseIssues.push(courseIssue);

            // As above, throw the error to abort the traversal.
            throw courseIssue;
          }
        }
      });
    });
  } catch (err) {
    // Black-hole any errors, they were (should have been) handled by course issues
  }

  return {
    courseIssues,
    data,
    html: $.html(),
    fileData,
    renderedElementNames,
  };
}

/**
 * @param {string} phase
 * @param {import('../lib/code-caller').CodeCaller} codeCaller
 * @param {any} data
 * @param {QuestionProcessingContext} context
 */
async function processQuestionHtml(phase, codeCaller, data, context) {
  const origData = JSON.parse(JSON.stringify(data));

  const checkErr = checkData(data, origData, phase);
  if (checkErr) {
    return {
      courseIssues: [
        new CourseIssueError(`Invalid state before ${phase}(): ${checkErr}`, { fatal: true }),
      ],
      data,
      html: '',
      fileData: Buffer.from(''),
      renderedElementNames: [],
    };
  }

  const htmlFilename = path.join(context.question_dir_host, 'question.html');
  let html, $;
  try {
    ({ html, $ } = await execTemplate(htmlFilename, data));
  } catch (err) {
    return {
      courseIssues: [new CourseIssueError(htmlFilename + ': ' + err.toString(), { fatal: true })],
      data,
      html: '',
      fileData: Buffer.from(''),
      renderedElementNames: [],
    };
  }

  let processFunction;
  /** @type {[string, import('../lib/code-caller/index').CodeCaller, any, any, any]} */
  let args;
  if (context.renderer === 'experimental') {
    processFunction = experimentalProcess;
    args = [phase, codeCaller, data, context, html];
  } else if (context.renderer === 'default') {
    processFunction = traverseQuestionAndExecuteFunctions;
    args = [phase, codeCaller, data, context, html];
  } else {
    processFunction = legacyTraverseQuestionAndExecuteFunctions;
    args = [phase, codeCaller, data, context, $];
  }

  const {
    courseIssues,
    data: resultData,
    html: processedHtml,
    fileData,
    renderedElementNames,
  } = await processFunction(...args);

  if (phase === 'grade' || phase === 'test') {
    if (context.question.partial_credit) {
      let total_weight = 0,
        total_weight_score = 0;
      _.each(resultData.partial_scores, (value) => {
        const score = _.get(value, 'score', 0);
        const weight = _.get(value, 'weight', 1);
        total_weight += weight;
        total_weight_score += weight * score;
      });
      resultData.score = total_weight_score / (total_weight === 0 ? 1 : total_weight);
    } else {
      let score = 0;
      if (
        _.size(resultData.partial_scores) > 0 &&
        _.every(resultData.partial_scores, (value) => _.get(value, 'score', 0) >= 1)
      ) {
        score = 1;
      }
      resultData.score = score;
    }
  }

  return {
    courseIssues,
    data: resultData,
    html: processedHtml,
    fileData,
    renderedElementNames,
  };
}

async function processQuestionServer(phase, codeCaller, data, html, fileData, context) {
  const courseIssues = [];
  const origData = JSON.parse(JSON.stringify(data));

  const checkErrBefore = checkData(data, origData, phase);
  if (checkErrBefore) {
    courseIssues.push(
      new CourseIssueError(`Invalid state before calling server ${phase}(): ${checkErrBefore}`, {
        fatal: true,
      }),
    );
    return { courseIssues, data, html: '', fileData: Buffer.from(''), renderedElementNames: [] };
  }

  let result, output;
  try {
    ({ result, output } = await execPythonServer(codeCaller, phase, data, html, context));
  } catch (err) {
    const serverFile = path.join(context.question_dir, 'server.py');
    courseIssues.push(
      new CourseIssueError(`${serverFile}: Error calling ${phase}(): ${err.toString()}`, {
        data: err.data,
        fatal: true,
        cause: err,
      }),
    );
    return { courseIssues, data };
  }

  if (_.isString(output) && output.length > 0) {
    const serverFile = path.join(context.question_dir, 'server.py');
    courseIssues.push(
      new CourseIssueError(`${serverFile}: output logged on console`, {
        data: { outputBoth: output },
        fatal: false,
      }),
    );
  }

  if (phase === 'render') {
    html = result;
  } else if (phase === 'file') {
    // Convert ret_val from base64 back to buffer (this always works,
    // whether or not ret_val is valid base64)
    var buf = Buffer.from(result, 'base64');

    // If the buffer has non-zero length...
    if (buf.length > 0) {
      if (fileData.length > 0) {
        // If fileData already has non-zero length, throw an error
        const serverFile = path.join(context.question_dir, 'server.py');
        courseIssues.push(
          new CourseIssueError(
            `${serverFile}: Error calling ${phase}(): attempting to overwrite non-empty fileData`,
            { fatal: true },
          ),
        );
        return { courseIssues, data };
      } else {
        // If not, replace fileData with a copy of buffer
        fileData = Buffer.from(buf);
      }
    }
  } else {
    data = result;
  }
  const checkErrAfter = checkData(data, origData, phase);
  if (checkErrAfter) {
    const serverFile = path.join(context.question_dir, 'server.py');
    courseIssues.push(
      new CourseIssueError(`${serverFile}: Invalid state after ${phase}(): ${checkErrAfter}`, {
        fatal: true,
      }),
    );
    return { courseIssues, data };
  }

  return { courseIssues, data, html, fileData };
}

/**
 *
 * @param {string} phase
 * @param {import('../lib/code-caller').CodeCaller} codeCaller
 * @param {any} data
 * @param {QuestionProcessingContext} context
 * @returns
 */
async function processQuestion(phase, codeCaller, data, context) {
  const meter = metrics.getMeter('prairielearn');
  return instrumentedWithMetrics(meter, `freeform.${phase}`, async () => {
    if (phase === 'generate') {
      return processQuestionServer(phase, codeCaller, data, '', Buffer.from(''), context);
    } else {
      const {
        courseIssues,
        data: htmlData,
        html,
        fileData,
        renderedElementNames,
      } = await processQuestionHtml(phase, codeCaller, data, context);
      const hasFatalError = _.some(_.map(courseIssues, 'fatal'));
      if (hasFatalError) {
        return {
          courseIssues,
          data,
          html,
          fileData,
          renderedElementNames,
        };
      }
      const {
        courseIssues: serverCourseIssues,
        data: serverData,
        html: serverHtml,
        fileData: serverFileData,
      } = await processQuestionServer(phase, codeCaller, htmlData, html, fileData, context);
      courseIssues.push(...serverCourseIssues);
      return {
        courseIssues,
        data: serverData,
        html: serverHtml,
        fileData: serverFileData,
        renderedElementNames,
      };
    }
  });
}

/**
 * Gets any options that are available in any freeform phase.
 * These include file paths that are relevant for questions and elements.
 * URLs are not included here because those are only applicable during 'render'.
 */
function getContextOptions(context) {
  let options = {};
  options.question_path = context.question_dir;
  options.client_files_question_path = path.join(context.question_dir, 'clientFilesQuestion');
  options.client_files_course_path = path.join(context.course_dir, 'clientFilesCourse');
  options.server_files_course_path = path.join(context.course_dir, 'serverFilesCourse');
  options.course_extensions_path = path.join(context.course_dir, 'elementExtensions');
  return options;
}

export async function generate(question, course, variant_seed) {
  return instrumented('freeform.generate', async () => {
    const context = await getContext(question, course);
    const data = {
      params: {},
      correct_answers: {},
      variant_seed: parseInt(variant_seed, 36),
      options: _.defaults({}, course.options, question.options),
    };
    _.extend(data.options, getContextOptions(context));

    return await withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'generate',
        codeCaller,
        data,
        context,
      );
      return {
        courseIssues,
        data: {
          params: resultData.params,
          true_answer: resultData.correct_answers,
        },
      };
    });
  });
}

export async function prepare(question, course, variant) {
  return instrumented('freeform.prepare', async () => {
    if (variant.broken_at) throw new Error('attempted to prepare broken variant');

    const context = await getContext(question, course);
    const data = {
      params: _.get(variant, 'params', {}),
      correct_answers: _.get(variant, 'true_answer', {}),
      variant_seed: parseInt(variant.variant_seed, 36),
      options: _.get(variant, 'options', {}),
      answers_names: {},
    };
    _.extend(data.options, getContextOptions(context));

    return await withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'prepare',
        codeCaller,
        data,
        context,
      );
      return {
        courseIssues,
        data: {
          params: resultData.params,
          true_answer: resultData.correct_answers,
        },
      };
    });
  });
}

/**
 * @typedef {Object} RenderPanelResult
 * @property {any[]} courseIssues
 * @property {string} html
 * @property {string} [renderer]
 * @property {string[]} [renderedElementNames]
 * @property {boolean} [cacheHit]
 */

/**
 * @param {'question' | 'answer' | 'submission'} panel
 * @param {import('../lib/code-caller').CodeCaller} codeCaller
 * @param {import('../lib/db-types').Variant} variant
 * @param {import('../lib/db-types').Submission?} submission
 * @param {import('../lib/db-types').Course} course
 * @param {Record<string, any>} locals
 * @param {QuestionProcessingContext} context
 * @returns {Promise<RenderPanelResult>}
 */
async function renderPanel(panel, codeCaller, variant, submission, course, locals, context) {
  debug(`renderPanel(${panel})`);
  // broken variant kills all rendering
  if (variant.broken_at) {
    return {
      courseIssues: [],
      html: 'Broken question due to error in question code',
    };
  }

  // broken submission kills the submission panel, but we can
  // proceed with other panels, treating the submission as
  // missing
  if (submission && submission.broken) {
    if (panel === 'submission') {
      return {
        courseIssues: [],
        html: 'Broken submission due to error in question code',
      };
    } else {
      submission = null;
    }
  }

  const data = {
    params: _.get(variant, 'params', {}),
    correct_answers: _.get(variant, 'true_answer', {}),
    submitted_answers: submission ? _.get(submission, 'submitted_answer', {}) : {},
    format_errors: submission?.format_errors ?? {},
    partial_scores: submission?.partial_scores ?? {},
    score: submission?.score ?? 0,
    feedback: submission?.feedback ?? {},
    variant_seed: parseInt(variant.variant_seed ?? '0', 36),
    options: _.get(variant, 'options') ?? {},
    raw_submitted_answers: submission ? _.get(submission, 'raw_submitted_answer', {}) : {},
    editable: !!(locals.allowAnswerEditing && !locals.manualGradingInterface),
    manual_grading: !!locals.manualGradingInterface,
    panel,
    num_valid_submissions: _.get(variant, 'num_tries', null),
  };

  // This URL is submission-specific, so we have to compute it here (that is,
  // it won't be present in `locals`). This URL will only have meaning if
  // there's a submission, so it will be `null` otherwise.
  const submissionFilesUrl = submission
    ? locals.questionUrl + `submission/${submission?.id}/file`
    : null;

  // Put base URLs in data.options for access by question code
  data.options.client_files_question_url = locals.clientFilesQuestionUrl;
  data.options.client_files_course_url = locals.clientFilesCourseUrl;
  data.options.client_files_question_dynamic_url = locals.clientFilesQuestionGeneratedFileUrl;
  data.options.submission_files_url = submission ? submissionFilesUrl : null;
  data.options.base_url = locals.baseUrl;
  data.options.workspace_url = locals.workspaceUrl || null;

  // Put key paths in data.options
  _.extend(data.options, getContextOptions(context));

  const { data: cachedData, cacheHit } = await getCachedDataOrCompute(
    course,
    data,
    context,
    async () => {
      const { courseIssues, html, renderedElementNames } = await processQuestion(
        'render',
        codeCaller,
        data,
        context,
      );
      return { courseIssues, html, renderedElementNames };
    },
  );

  return {
    ...cachedData,
    cacheHit,
  };
}

async function renderPanelInstrumented(
  panel,
  codeCaller,
  submission,
  variant,
  question,
  course,
  locals,
  context,
) {
  return instrumented(`freeform.renderPanel:${panel}`, async (span) => {
    span.setAttributes({
      panel,
      'variant.id': variant.id,
      'question.id': question.id,
      'course.id': course.id,
    });
    /** @type {RenderPanelResult} */
    const result = await renderPanel(
      panel,
      codeCaller,
      variant,
      submission,
      course,
      locals,
      context,
    );
    span.setAttribute('cache.status', result.cacheHit ? 'hit' : 'miss');
    return result;
  });
}

export async function render(
  renderSelection,
  variant,
  question,
  submission,
  submissions,
  course,
  locals,
) {
  return instrumented('freeform.render', async () => {
    debug('render()');
    const htmls = {
      extraHeadersHtml: '',
      questionHtml: '',
      submissionHtmls: _.map(submissions, () => ''),
      answerHtml: '',
    };
    let allRenderedElementNames = [];
    const courseIssues = [];
    const context = await getContext(question, course);

    // Hack: we need to propagate this back up to the original caller so
    // they can expose the selected renderer to the client via a header, but
    // parent functions don't actually return things. So we'll just stick it
    // in the `locals` object that the parent will be able to read from.
    //
    // See the `setRendererHeader` function in `lib/question-render`
    // for where this is actually used.
    locals.question_renderer = context.renderer;

    return withCodeCaller(course, async (codeCaller) => {
      if (renderSelection.question) {
        const {
          courseIssues: newCourseIssues,
          html,
          renderedElementNames,
        } = await renderPanelInstrumented(
          'question',
          codeCaller,
          submission,
          variant,
          question,
          course,
          locals,
          context,
        );

        courseIssues.push(...newCourseIssues);
        htmls.questionHtml = html;
        allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
      }

      if (renderSelection.submissions) {
        htmls.submissionHtmls = await async.mapSeries(submissions, async (submission) => {
          const {
            courseIssues: newCourseIssues,
            html,
            renderedElementNames,
          } = await renderPanelInstrumented(
            'submission',
            codeCaller,
            submission,
            variant,
            question,
            course,
            locals,
            context,
          );

          courseIssues.push(...newCourseIssues);
          allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
          return html;
        });
      }

      if (renderSelection.answer) {
        const {
          courseIssues: newCourseIssues,
          html,
          renderedElementNames,
        } = await renderPanelInstrumented(
          'answer',
          codeCaller,
          submission,
          variant,
          question,
          course,
          locals,
          context,
        );

        courseIssues.push(...newCourseIssues);
        htmls.answerHtml = html;
        allRenderedElementNames = _.union(allRenderedElementNames, renderedElementNames);
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
      const dynamicDependencies = {
        nodeModulesScripts: {},
        coreElementScripts: {},
        courseElementScripts: {},
        extensionScripts: {},
        clientFilesCourseScripts: {},
      };

      for (let type in question.dependencies) {
        if (!_.has(dependencies, type)) continue;

        for (let dep of question.dependencies[type]) {
          if (!_.includes(dependencies[type], dep)) {
            dependencies[type].push(dep);
          }
        }
      }

      // Gather dependencies for all rendered elements
      allRenderedElementNames.forEach((elementName) => {
        let resolvedElement = resolveElement(elementName, context);
        const elementDependencies = _.cloneDeep(resolvedElement.dependencies || {});
        const elementDynamicDependencies = _.cloneDeep(resolvedElement.dynamicDependencies || {});

        // Transform non-global dependencies to be prefixed by the element name,
        // since they'll be served from their element's directory
        if (_.has(elementDependencies, 'elementStyles')) {
          elementDependencies.elementStyles = elementDependencies.elementStyles.map(
            (dep) => `${resolvedElement.name}/${dep}`,
          );
        }
        if (_.has(elementDependencies, 'elementScripts')) {
          elementDependencies.elementScripts = elementDependencies.elementScripts.map(
            (dep) => `${resolvedElement.name}/${dep}`,
          );
        }
        if (_.has(elementDynamicDependencies, 'elementScripts')) {
          elementDynamicDependencies.elementScripts = _.mapValues(
            elementDynamicDependencies.elementScripts,
            (dep) => `${resolvedElement.name}/${dep}`,
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
          if (_.has(elementDynamicDependencies, 'elementScripts')) {
            elementDynamicDependencies.courseElementScripts =
              elementDynamicDependencies.elementScripts;
            delete elementDynamicDependencies.elementScripts;
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
          if (_.has(elementDynamicDependencies, 'elementScripts')) {
            elementDynamicDependencies.coreElementScripts =
              elementDynamicDependencies.elementScripts;
            delete elementDynamicDependencies.elementScripts;
          }
        }

        for (const type in elementDependencies) {
          if (!_.has(dependencies, type)) continue;

          for (const dep of elementDependencies[type]) {
            if (!_.includes(dependencies[type], dep)) {
              dependencies[type].push(dep);
            }
          }
        }

        for (const type in elementDynamicDependencies) {
          for (const key in elementDynamicDependencies[type]) {
            if (!_.has(dynamicDependencies[type], key)) {
              dynamicDependencies[type][key] = elementDynamicDependencies[type][key];
            } else if (dynamicDependencies[type][key] !== elementDynamicDependencies[type][key]) {
              courseIssues.push(
                new CourseIssueError(`Dynamic dependency ${key} assigned to conflicting files`, {
                  data: {
                    dependencyType: type,
                    values: [dynamicDependencies[type][key], elementDynamicDependencies[type][key]],
                  },
                  fatal: true,
                }),
              );
            }
          }
        }

        // Load any extensions if they exist
        if (_.has(extensions, elementName)) {
          for (const extensionName of Object.keys(extensions[elementName])) {
            if (
              !_.has(extensions[elementName][extensionName], 'dependencies') &&
              !_.has(extensions[elementName][extensionName], 'dynamicDependencies')
            ) {
              continue;
            }

            const extension = _.cloneDeep(extensions[elementName][extensionName]).dependencies;
            const extensionDynamic = _.cloneDeep(
              extensions[elementName][extensionName],
            ).dynamicDependencies;
            if (_.has(extension, 'extensionStyles')) {
              extension.extensionStyles = extension.extensionStyles.map(
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }
            if (_.has(extension, 'extensionScripts')) {
              extension.extensionScripts = extension.extensionScripts.map(
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }
            if (_.has(extensionDynamic, 'extensionScripts')) {
              extensionDynamic.extensionScripts = _.mapValues(
                extensionDynamic.extensionScripts,
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }

            for (const type in extension) {
              if (!_.has(dependencies, type)) continue;

              for (const dep of extension[type]) {
                if (!_.includes(dependencies[type], dep)) {
                  dependencies[type].push(dep);
                }
              }
            }
            for (const type in extensionDynamic) {
              for (const key in extensionDynamic[type]) {
                if (!_.has(dynamicDependencies[type], key)) {
                  dynamicDependencies[type][key] = extensionDynamic[type][key];
                } else if (dynamicDependencies[type][key] !== extensionDynamic[type][key]) {
                  courseIssues.push(
                    new CourseIssueError(
                      `Dynamic dependency ${key} assigned to conflicting files`,
                      {
                        data: {
                          dependencyType: type,
                          values: [dynamicDependencies[type][key], extensionDynamic[type][key]],
                        },
                        fatal: true,
                      },
                    ),
                  );
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
        styleUrls.push(assets.assetPath(`stylesheets/${file}`)),
      );
      dependencies.coreScripts.forEach((file) =>
        coreScriptUrls.push(assets.assetPath(`javascripts/${file}`)),
      );
      dependencies.nodeModulesStyles.forEach((file) =>
        styleUrls.push(assets.nodeModulesAssetPath(file)),
      );
      dependencies.nodeModulesScripts.forEach((file) =>
        coreScriptUrls.push(assets.nodeModulesAssetPath(file)),
      );
      dependencies.clientFilesCourseStyles.forEach((file) =>
        styleUrls.push(`${locals.urlPrefix}/clientFilesCourse/${file}`),
      );
      dependencies.clientFilesCourseScripts.forEach((file) =>
        scriptUrls.push(`${locals.urlPrefix}/clientFilesCourse/${file}`),
      );
      dependencies.clientFilesQuestionStyles.forEach((file) =>
        styleUrls.push(`${locals.clientFilesQuestionUrl}/${file}`),
      );
      dependencies.clientFilesQuestionScripts.forEach((file) =>
        scriptUrls.push(`${locals.clientFilesQuestionUrl}/${file}`),
      );
      dependencies.coreElementStyles.forEach((file) =>
        styleUrls.push(assets.coreElementAssetPath(file)),
      );
      dependencies.coreElementScripts.forEach((file) =>
        scriptUrls.push(assets.coreElementAssetPath(file)),
      );
      dependencies.courseElementStyles.forEach((file) =>
        styleUrls.push(assets.courseElementAssetPath(course.commit_hash, locals.urlPrefix, file)),
      );
      dependencies.courseElementScripts.forEach((file) =>
        scriptUrls.push(assets.courseElementAssetPath(course.commit_hash, locals.urlPrefix, file)),
      );
      dependencies.extensionStyles.forEach((file) =>
        styleUrls.push(
          assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file),
        ),
      );
      dependencies.extensionScripts.forEach((file) =>
        scriptUrls.push(
          assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file),
        ),
      );

      const importMap = {
        imports: {
          ..._.mapValues(dynamicDependencies.nodeModulesScripts, (file) =>
            assets.nodeModulesAssetPath(file),
          ),
          ..._.mapValues(
            dynamicDependencies.clientFilesCourseScripts,
            (file) => `${locals.urlPrefix}/clientFilesCourse/${file}`,
          ),
          ..._.mapValues(dynamicDependencies.coreElementScripts, (file) =>
            assets.coreElementAssetPath(file),
          ),
          ..._.mapValues(dynamicDependencies.courseElementScripts, (file) =>
            assets.courseElementAssetPath(course.commit_hash, locals.urlPrefix, file),
          ),
          ..._.mapValues(dynamicDependencies.extensionScripts, (file) =>
            assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file),
          ),
        },
      };

      // Check if any of the keys was found in more than one dependency type
      Object.keys(importMap.imports).forEach((key) => {
        const types = Object.entries(dynamicDependencies)
          .filter(([, value]) => _.has(value, key))
          .map(([type]) => type);
        if (types.length > 1) {
          courseIssues.push(
            new CourseIssueError(
              `Dynamic dependency key ${key} assigned to multiple types of dependencies`,
              { data: { types }, fatal: true },
            ),
          );
        }
      });

      const headerHtmls = [
        ...styleUrls.map((url) => `<link href="${url}" rel="stylesheet" />`),
        // The import map must come before any scripts that use imports
        !_.isEmpty(importMap.imports)
          ? `<script type="importmap">${JSON.stringify(importMap)}</script>`
          : ``,
        // It's important that any library-style scripts come first
        ...coreScriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
        ...scriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
      ];
      htmls.extraHeadersHtml = headerHtmls.join('\n');

      return { courseIssues, data: htmls };
    });
  });
}

export async function file(filename, variant, question, course) {
  return instrumented('freeform.file', async (span) => {
    debug('file()');
    if (variant.broken_at) throw new Error('attempted to get a file for a broken variant');

    const context = await getContext(question, course);

    const data = {
      params: _.get(variant, 'params', {}),
      correct_answers: _.get(variant, 'true_answer', {}),
      variant_seed: parseInt(variant.variant_seed, 36),
      options: _.get(variant, 'options', {}),
      filename,
    };
    _.extend(data.options, getContextOptions(context));

    const { data: cachedData, cacheHit } = await getCachedDataOrCompute(
      course,
      data,
      context,
      async () => {
        // function to compute the file data and return the cachedData
        return withCodeCaller(course, async (codeCaller) => {
          const { courseIssues, fileData } = await processQuestion(
            'file',
            codeCaller,
            data,
            context,
          );
          const fileDataBase64 = (fileData || '').toString('base64');
          return { courseIssues, fileDataBase64 };
        });
      },
    );

    span.setAttribute('cache.status', cacheHit ? 'hit' : 'miss');

    const { courseIssues, fileDataBase64 } = cachedData;
    const fileData = Buffer.from(fileDataBase64, 'base64');
    return { courseIssues, data: fileData };
  });
}

export async function parse(submission, variant, question, course) {
  return instrumented('freeform.parse', async () => {
    debug('parse()');
    if (variant.broken_at) throw new Error('attempted to parse broken variant');

    const context = await getContext(question, course);
    const data = {
      params: _.get(variant, 'params', {}),
      correct_answers: _.get(variant, 'true_answer', {}),
      submitted_answers: _.get(submission, 'submitted_answer', {}),
      feedback: _.get(submission, 'feedback', {}),
      format_errors: _.get(submission, 'format_errors', {}),
      variant_seed: parseInt(variant.variant_seed, 36),
      options: _.get(variant, 'options', {}),
      raw_submitted_answers: _.get(submission, 'raw_submitted_answer', {}),
      gradable: _.get(submission, 'gradable', true),
    };
    _.extend(data.options, getContextOptions(context));
    return withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'parse',
        codeCaller,
        data,
        context,
      );
      if (_.size(resultData.format_errors) > 0) resultData.gradable = false;
      return {
        courseIssues,
        data: {
          params: resultData.params,
          true_answer: resultData.correct_answers,
          submitted_answer: resultData.submitted_answers,
          feedback: resultData.feedback,
          raw_submitted_answer: resultData.raw_submitted_answers,
          format_errors: resultData.format_errors,
          gradable: resultData.gradable,
        },
      };
    });
  });
}

export async function grade(submission, variant, question, question_course) {
  return instrumented('freeform.grade', async () => {
    debug('grade()');
    if (variant.broken_at) throw new Error('attempted to grade broken variant');
    if (submission.broken) throw new Error('attempted to grade broken submission');

    const context = await getContext(question, question_course);
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
    _.extend(data.options, getContextOptions(context));
    return withCodeCaller(question_course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'grade',
        codeCaller,
        data,
        context,
      );
      if (_.size(resultData.format_errors) > 0) resultData.gradable = false;
      return {
        courseIssues,
        data: {
          params: resultData.params,
          true_answer: resultData.correct_answers,
          submitted_answer: resultData.submitted_answers,
          format_errors: resultData.format_errors,
          raw_submitted_answer: resultData.raw_submitted_answers,
          partial_scores: resultData.partial_scores,
          score: resultData.score,
          feedback: resultData.feedback,
          gradable: resultData.gradable,
        },
      };
    });
  });
}

export async function test(variant, question, course, test_type) {
  return instrumented('freeform.test', async () => {
    debug('test()');
    if (variant.broken_at) throw new Error('attempted to test broken variant');

    const context = await getContext(question, course);
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
      test_type,
    };
    _.extend(data.options, getContextOptions(context));
    return withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'test',
        codeCaller,
        data,
        context,
      );
      if (_.size(resultData.format_errors) > 0) resultData.gradable = false;
      return {
        courseIssues,
        data: {
          params: resultData.params,
          true_answer: resultData.correct_answers,
          format_errors: resultData.format_errors,
          raw_submitted_answer: resultData.raw_submitted_answers,
          partial_scores: resultData.partial_scores,
          score: resultData.score,
          gradable: resultData.gradable,
        },
      };
    });
  });
}

/**
 * @param {Object} question
 * @param {Object} course
 * @returns {Promise<QuestionProcessingContext>}
 */
async function getContext(question, course) {
  const coursePath = chunks.getRuntimeDirectoryForCourse(course);
  /** @type {chunks.Chunk[]} */
  const chunksToLoad = [
    { type: 'question', questionId: question.id },
    { type: 'clientFilesCourse' },
    { type: 'serverFilesCourse' },
    { type: 'elements' },
    { type: 'elementExtensions' },
  ];
  await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);

  // Select which rendering strategy we'll use. This is computed here so that
  // in can factor into the cache key.
  const useNewQuestionRenderer = course?.options?.useNewQuestionRenderer ?? false;
  const useExperimentalRenderer = await features.enabled('process-questions-in-worker', {
    institution_id: course.institution_id,
    course_id: course.id,
  });

  const renderer = useExperimentalRenderer
    ? 'experimental'
    : useNewQuestionRenderer
      ? 'default'
      : 'legacy';

  // The `*Host` values here refer to the paths relative to PrairieLearn;
  // the other values refer to the paths as they will be seen by the worker
  // that actually executes the question.
  const courseDirectory = config.workersExecutionMode === 'native' ? coursePath : '/course';
  const courseDirectoryHost = coursePath;
  const questionDirectory = path.join(courseDirectory, 'questions', question.directory);
  const questionDirectoryHost = path.join(coursePath, 'questions', question.directory);

  // Load elements and any extensions
  const elements = await loadElementsForCourse(course);
  const extensions = await loadExtensionsForCourse({
    course,
    course_dir: courseDirectory,
    course_dir_host: courseDirectoryHost,
  });

  return {
    question,
    course,
    course_dir: courseDirectory,
    course_dir_host: courseDirectoryHost,
    question_dir: questionDirectory,
    question_dir_host: questionDirectoryHost,
    course_elements: elements,
    course_element_extensions: extensions,
    renderer,
  };
}

async function getCacheKey(course, data, context) {
  try {
    const commitHash = await getOrUpdateCourseCommitHash(course);
    const dataHash = objectHash({ data, context }, { algorithm: 'sha1', encoding: 'base64' });
    return `question:${commitHash}-${dataHash}`;
  } catch (err) {
    return null;
  }
}

async function getCachedDataOrCompute(course, data, context, computeFcn) {
  // This function will compute the cachedData and cache it if
  // cacheKey is not null
  const doCompute = async (cacheKey) => {
    const computedData = await computeFcn();

    // Course issues during question/file rendering aren't actually
    // treated as errors - that is, the above function won't throw
    // an error, even if there are course issues. However, we
    // still want to avoid caching anything that produced a course
    // issue, as that might be a transient error that would go away
    // if the user refreshed, even if they didn't create a new variant.
    // Also, the `Error` objects that we use for course issues can't be
    // easily round-tripped through a cache, which means that pulling
    // an error out of the cache means the instructor would see an
    // error message of `[object Object]` which is useless.
    //
    // tl;dr: don't cache any results that would create course issues.
    const hasCourseIssues = computedData?.courseIssues?.length > 0;
    if (cacheKey && !hasCourseIssues) {
      cache.set(cacheKey, computedData, config.questionRenderCacheTtlSec * 1000);
    }

    return {
      data: computedData,
      cacheHit: false,
    };
  };

  // This function will check the cache for the specified
  // cacheKey and either return the cachedData for a cache hit,
  // or compute the cachedData for a cache miss
  const getFromCacheOrCompute = async (cacheKey) => {
    let cachedData;

    try {
      cachedData = await cache.get(cacheKey);
    } catch (err) {
      // We don't actually want to fail if the cache has an error; we'll
      // just compute the cachedData as normal
      logger.error('Error in cache.get()', err);
    }

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
    if (cachedData && !hasCachedCourseIssues) {
      return {
        data: cachedData,
        cacheHit: true,
      };
    } else {
      return doCompute(cacheKey);
    }
  };

  if (config.devMode) {
    // In dev mode, we should skip caching so that we'll immediately
    // pick up new changes from disk
    return doCompute(null);
  } else {
    const cacheKey = await getCacheKey(course, data, context);
    // If for some reason we failed to get a cache key, don't
    // actually fail the request, just skip the cache entirely
    // and compute as usual
    if (!cacheKey) {
      return doCompute(null);
    } else {
      return getFromCacheOrCompute(cacheKey);
    }
  }
}
