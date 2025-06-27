import assert from 'node:assert';
import * as path from 'node:path';

import * as async from 'async';
import debugfn from 'debug';
import fs from 'fs-extra';
import _ from 'lodash';
import mustache from 'mustache';
import objectHash from 'object-hash';

import { cache } from '@prairielearn/cache';
import { logger } from '@prairielearn/logger';
import { instrumented, instrumentedWithMetrics, metrics } from '@prairielearn/opentelemetry';
import { run } from '@prairielearn/run';
import * as Sentry from '@prairielearn/sentry';

import * as assets from '../lib/assets.js';
import { canonicalLogger } from '../lib/canonical-logger.js';
import * as chunks from '../lib/chunks.js';
import { type CodeCaller, FunctionMissingError, withCodeCaller } from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import { type Course, type Question, type Submission, type Variant } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { isEnterprise } from '../lib/license.js';
import * as markdown from '../lib/markdown.js';
import { APP_ROOT_PATH } from '../lib/paths.js';
import { getOrUpdateCourseCommitHash } from '../models/course.js';
import {
  type ElementCoreJson,
  ElementCoreJsonSchema,
  type ElementCourseJson,
  ElementCourseJsonSchema,
  ElementExtensionJsonSchema,
} from '../schemas/index.js';

import {
  type ElementExtensionJsonExtension,
  type ExecutionData,
  type GenerateResultData,
  type GradeResultData,
  type ParseResultData,
  type PrepareResultData,
  type QuestionServerReturnValue,
  type RenderResultData,
  type TestResultData,
} from './types.js';

const debug = debugfn('prairielearn:freeform');

type Phase = 'generate' | 'prepare' | 'render' | 'parse' | 'grade' | 'test' | 'file';

interface QuestionProcessingContext {
  course: Course;
  question: Question;
  course_dir: string;
  course_dir_host: string;
  question_dir: string;
  question_dir_host: string;
  course_elements: ElementNameMap;
  course_element_extensions: ElementExtensionNameDirMap;
}

type ElementExtensionNameDirMap = Record<string, Record<string, ElementExtensionJsonExtension>>;
type ElementNameMap = Record<
  string,
  ((ElementCoreJson & { type: 'core' }) | (ElementCourseJson & { type: 'course' })) & {
    name: string;
    directory: string;
  }
>;
// Maps core element names to element info
let coreElementsCache: ElementNameMap = {};
// Maps course IDs to course element info
let courseElementsCache: Record<
  string,
  {
    commit_hash: string | null;
    data: ElementNameMap;
  }
> = {};
// Maps course IDs to course element extension info
let courseExtensionsCache: Record<
  string,
  {
    commit_hash: string | null;
    data: ElementExtensionNameDirMap;
  }
> = {};

class CourseIssueError extends Error {
  data: any;
  fatal: boolean;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      data?: any;
      fatal: boolean;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'CourseIssueError';
    this.data = options?.data;
    this.fatal = options?.fatal ?? false;
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
 * @param sourceDir Absolute path to the directory of elements
 * @param elementType The type of element to be loaded
 */
async function loadElements(sourceDir: string, elementType: 'core' | 'course') {
  const elementSchema = run(() => {
    if (elementType === 'core') return ElementCoreJsonSchema;
    if (elementType === 'course') return ElementCourseJsonSchema;
    throw new Error(`Unknown element type ${elementType}`);
  });

  let files: string[];
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
  const elements: ElementNameMap = {};
  await async.each(elementNames, async (elementName) => {
    const elementInfoPath = path.join(sourceDir, elementName, 'info.json');
    let rawInfo: any;
    try {
      rawInfo = await fs.readJSON(elementInfoPath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // This must not be an element directory, skip it
        return;
      }

      throw err;
    }

    elements[elementName] = {
      name: elementName,
      directory: path.join(sourceDir, elementName),
      type: elementType,
      ...elementSchema.parse(rawInfo),
    };

    // For backwards compatibility.
    // TODO remove once everyone is using the new version.
    if (elementType === 'core') {
      elements[elementName.replace(/-/g, '_')] = elements[elementName];

      if ('additionalNames' in elements[elementName]) {
        elements[elementName].additionalNames?.forEach((name) => {
          elements[name] = elements[elementName];
          elements[name.replace(/-/g, '_')] = elements[elementName];
        });
      }
    }
  });

  return elements;
}

export async function loadElementsForCourse(course: Course) {
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
 * @param sourceDir Absolute path to the directory of extensions
 * @param runtimeDir The path that the worker will load extensions from
 */
export async function loadExtensions(sourceDir: string, runtimeDir: string) {
  // Load each root element extension folder
  let elementFolders: string[];
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
    await async.map(elementFolders, async (element: string) => {
      const extensions = await fs.readdir(path.join(sourceDir, element));
      return extensions.map((ext) => [element, ext]);
    })
  ).flat();

  // Populate element map
  const elements: ElementExtensionNameDirMap = {};
  elementArrays.forEach((extension) => {
    if (!(extension[0] in elements)) {
      elements[extension[0]] = {};
    }
  });

  // Load extensions
  await async.each(elementArrays, async (extension) => {
    const [element, extensionDir] = extension;
    const infoPath = path.join(sourceDir, element, extensionDir, 'info.json');

    let rawInfo: any;
    try {
      rawInfo = await fs.readJson(infoPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Not an extension directory, skip it.
        return;
      } else if (err.code === 'ENOTDIR') {
        // Random file, skip it as well.
        return;
      } else {
        throw err;
      }
    }

    elements[element][extensionDir] = {
      name: extensionDir,
      directory: path.join(runtimeDir, element, extensionDir),
      ...ElementExtensionJsonSchema.parse(rawInfo),
    };
  });

  return elements;
}

async function loadExtensionsForCourse({
  course,
  course_dir,
  course_dir_host,
}: {
  course: Course;
  course_dir: string;
  course_dir_host: string;
}) {
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

function resolveElement(elementName: string, context: QuestionProcessingContext) {
  if (Object.prototype.hasOwnProperty.call(context.course_elements, elementName)) {
    return context.course_elements[elementName];
  } else if (Object.prototype.hasOwnProperty.call(coreElementsCache, elementName)) {
    return coreElementsCache[elementName];
  } else {
    throw new Error(`No such element: ${elementName}`);
  }
}

function defaultServerRet(phase: Phase, data: ExecutionData, html: string) {
  if (phase === 'render') {
    return html;
  } else if (phase === 'file') {
    return '';
  } else {
    return data;
  }
}

async function execPythonServer(
  codeCaller: CodeCaller,
  phase: Phase,
  data: ExecutionData,
  html: string,
  context: QuestionProcessingContext,
) {
  const pythonFile = 'server';
  const pythonFunction = phase;
  const pythonArgs: any[] = [data];
  if (phase === 'render') pythonArgs.push(html);
  const fullFilename = path.join(context.question_dir_host, 'server.py');
  const type = 'question';
  const directory = context.question.directory;

  try {
    await fs.access(fullFilename, fs.constants.R_OK);
  } catch {
    // server.py does not exist
    return { result: defaultServerRet(phase, data, html), output: '' };
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
    debug('execPythonServer(): completed');
    return { result, output };
  } catch (err) {
    if (err instanceof FunctionMissingError) {
      // function wasn't present in server
      debug('execPythonServer(): function not present');
      return {
        result: defaultServerRet(phase, data, html),
        output: '',
      };
    }
    throw err;
  }
}

async function execTemplate(htmlFilename: string, data: ExecutionData) {
  const rawFile = await fs.readFile(htmlFilename, { encoding: 'utf8' });
  const html = mustache.render(rawFile, data);
  return markdown.processQuestion(html);
}

function checkData(data: Record<string, any>, origData: Record<string, any>, phase: Phase) {
  const checked: string[] = [];
  const checkProp = (
    prop: string,
    type: 'integer' | 'number' | 'string' | 'boolean' | 'object',
    presentPhases: Phase[],
    editPhases: Phase[],
  ) => {
    if (!presentPhases.includes(phase)) return null;
    if (!Object.prototype.hasOwnProperty.call(data, prop)) {
      return `"${prop}" is missing from "data"`;
    }
    if (type === 'integer') {
      if (!Number.isInteger(data[prop])) {
        return `data.${prop} is not an integer: ${String(data[prop])}`;
      }
    } else if (type === 'number') {
      if (!Number.isFinite(data[prop])) {
        return `data.${prop} is not a number: ${String(data[prop])}`;
      }
    } else if (type === 'string') {
      if (typeof data[prop] !== 'string') {
        return `data.${prop} is not a string: ${String(data[prop])}`;
      }
    } else if (type === 'boolean') {
      if (data[prop] !== true && data[prop] !== false) {
        return `data.${prop} is not a boolean: ${String(data[prop])}`;
      }
    } else if (type === 'object') {
      if (data[prop] == null || typeof data[prop] !== 'object') {
        return `data.${prop} is not an object: ${String(data[prop])}`;
      }
    } else {
      return `invalid type: ${String(type)}`;
    }
    if (!editPhases.includes(phase)) {
      if (!Object.prototype.hasOwnProperty.call(origData, prop)) {
        return `"${prop}" is missing from "origData"`;
      }
      if (!_.isEqual(data[prop], origData[prop])) {
        return `data.${prop} has been illegally modified, new value: "${JSON.stringify(
          data[prop],
        )}", original value: "${JSON.stringify(origData[prop])}"`;
      }
    }
    checked.push(prop);
    return null;
  };

  const allPhases: Phase[] = ['generate', 'prepare', 'render', 'parse', 'grade', 'test', 'file'];

  if (!allPhases.includes(phase)) return `unknown phase: ${phase}`;

  // The following code is deliberately formatted as it is to aid in comprehension,
  // so we prevent Prettier from reformatting the code to span multiple lines.
  // prettier-ignore
  /**************************************************************************************************************************************/
  //                       property                 type      presentPhases                         changePhases
  /**************************************************************************************************************************************/
  const err =   checkProp('params',                'object',  allPhases,                            ['generate', 'prepare', 'parse', 'grade'])
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
             || checkProp('ai_grading',            'boolean', ['render'],                           [])
             || checkProp('panel',                 'string',  ['render'],                           [])
             || checkProp('num_valid_submissions','integer',  ['render'],                           [])
             || checkProp('gradable',              'boolean', ['parse', 'grade', 'test'],           [])
             || checkProp('filename',              'string',  ['file'],                             [])
             || checkProp('test_type',             'string',  ['test'],                             [])
             || checkProp('answers_names',         'object',  ['prepare'],                          ['prepare']);
  if (err) return err;

  const extraProps = _.difference(Object.keys(data), checked);
  if (extraProps.length > 0) return `"data" has invalid extra keys: ${extraProps.join(', ')}`;

  return null;
}

async function processQuestionPhase<T>(
  phase: Phase,
  codeCaller: CodeCaller,
  data: T,
  context: QuestionProcessingContext,
  html: string,
) {
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
  const courseIssues: CourseIssueError[] = [];
  let result: any | null = null;
  let output: string | null = null;

  try {
    const res = await codeCaller.call(
      'question',
      context.question.directory,
      'question.html',
      phase,
      [pythonContext, data],
    );
    result = res.result;
    output = res.output;
  } catch (err) {
    courseIssues.push(
      new CourseIssueError(err.message, {
        data: err.data,
        cause: err,
        fatal: true,
      }),
    );
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
    // Casting to the type of the argument is safe; a given phase is never allowed
    // to change the top-level shape of the data.
    data: result?.data ?? data,
    html: result?.html ?? '',
    fileData: Buffer.from(result?.file ?? '', 'base64'),
    renderedElementNames: result?.processed_elements ?? [],
  };
}

function getPartialScoreValues(val: unknown) {
  const obj = (typeof val === 'object' && val != null ? val : {}) as Record<string, unknown>;
  return {
    score: typeof obj.score === 'number' ? obj.score : 0,
    weight: typeof obj.weight === 'number' ? obj.weight : 1,
  };
}

async function processQuestionHtml<T extends ExecutionData>(
  phase: Phase,
  codeCaller: CodeCaller,
  data: T,
  context: QuestionProcessingContext,
) {
  // We deliberately reuse the same `data` object for both the "new" and "original"
  // arguments to avoid an unnecessary deep clone and comparison.
  const checkErr = checkData(data, data, phase);
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
  let html: string;
  try {
    html = await execTemplate(htmlFilename, data);
  } catch (err) {
    return {
      courseIssues: [new CourseIssueError(`${htmlFilename}: ${err.toString()}`, { fatal: true })],
      data,
      html: '',
      fileData: Buffer.from(''),
      renderedElementNames: [],
    };
  }

  const {
    courseIssues,
    data: resultData,
    html: processedHtml,
    fileData,
    renderedElementNames,
  } = await processQuestionPhase(phase, codeCaller, data, context, html);

  if (phase === 'grade' || phase === 'test') {
    if (context.question.partial_credit) {
      let total_weight = 0;
      let total_weight_score = 0;
      for (const value of Object.values(resultData.partial_scores ?? {})) {
        const { score, weight } = getPartialScoreValues(value);
        total_weight += weight;
        total_weight_score += weight * score;
      }
      resultData.score = total_weight_score / (total_weight === 0 ? 1 : total_weight);
    } else {
      let score = 0;
      if (
        Object.keys(resultData.partial_scores ?? {}).length > 0 &&
        Object.values(resultData.partial_scores ?? {}).every(
          (value) => getPartialScoreValues(value).score >= 1,
        )
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

async function processQuestionServer<T extends ExecutionData>(
  phase: Phase,
  codeCaller: CodeCaller,
  data: T,
  html: string,
  fileData: any,
  context: QuestionProcessingContext,
) {
  const courseIssues: CourseIssueError[] = [];
  const origData = structuredClone(data);

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

  if (typeof output === 'string' && output.length > 0) {
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
    const buf = Buffer.from(result, 'base64');

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

async function processQuestion<T extends ExecutionData>(
  phase: Phase,
  codeCaller: CodeCaller,
  data: T,
  context: QuestionProcessingContext,
) {
  const meter = metrics.getMeter('prairielearn');
  return instrumentedWithMetrics(
    meter,
    `freeform.${phase}`,
    async () => {
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
        const hasFatalError = courseIssues.some((issue) => issue.fatal);
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
    },
    (duration) => {
      canonicalLogger.increment(`freeform.${phase}.count`, 1);
      canonicalLogger.increment(`freeform.${phase}.duration`, duration);
    },
  );
}

/**
 * Gets any options that are available in any freeform phase.
 * These include file paths that are relevant for questions and elements.
 * URLs are not included here because those are only applicable during 'render'.
 */
function getContextOptions({
  question_dir,
  course_dir,
}: {
  question_dir: string;
  course_dir: string;
}) {
  return {
    question_path: question_dir,
    client_files_question_path: path.join(question_dir, 'clientFilesQuestion'),
    client_files_course_path: path.join(course_dir, 'clientFilesCourse'),
    server_files_course_path: path.join(course_dir, 'serverFilesCourse'),
    course_extensions_path: path.join(course_dir, 'elementExtensions'),
  };
}

export async function generate(
  question: Question,
  course: Course,
  variant_seed: string,
): QuestionServerReturnValue<GenerateResultData> {
  return instrumented('freeform.generate', async () => {
    const context = await getContext(question, course);

    const data = {
      params: {},
      correct_answers: {},
      variant_seed: parseInt(variant_seed, 36),
      options: { ...course.options, ...question.options, ...getContextOptions(context) },
    } satisfies ExecutionData;

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

export async function prepare(
  question: Question,
  course: Course,
  variant: Variant,
): QuestionServerReturnValue<PrepareResultData> {
  return instrumented('freeform.prepare', async () => {
    if (variant.broken_at) throw new Error('attempted to prepare broken variant');

    const context = await getContext(question, course);

    const data = {
      // These should never be null, but that can't be encoded in the schema.
      params: variant.params ?? {},
      correct_answers: variant.true_answer ?? {},
      variant_seed: parseInt(variant.variant_seed, 36),
      options: { ...(variant.options ?? {}), ...getContextOptions(context) },
      answers_names: {},
    } satisfies ExecutionData;

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

interface RenderPanelResult {
  courseIssues: CourseIssueError[];
  html: string;
  renderedElementNames?: string[];
  cacheHit?: boolean;
}

async function renderPanel(
  panel: 'question' | 'answer' | 'submission',
  codeCaller: CodeCaller,
  variant: Variant,
  submission: Submission | null,
  course: Course,
  locals: Record<string, any>,
  context: QuestionProcessingContext,
): Promise<RenderPanelResult> {
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

  if (panel === 'question' && locals.questionRenderContext === 'ai_grading') {
    // For AI grading, the question panel is always rendered without a specific
    // submission. The question panel is meant to provide context to the LLM;
    // all student submissions will be provided by rendering the submission panel.
    submission = null;
  }

  // This URL is submission-specific, so we have to compute it here (that is,
  // it won't be present in `locals`). This URL will only have meaning if
  // there's a submission, so it will be `null` otherwise.
  const submissionFilesUrl = submission
    ? locals.questionUrl + `submission/${submission?.id}/file`
    : null;

  const options = {
    ...(variant.options ?? {}),
    client_files_question_url: locals.clientFilesQuestionUrl,
    client_files_course_url: locals.clientFilesCourseUrl,
    client_files_question_dynamic_url: locals.clientFilesQuestionGeneratedFileUrl,
    course_element_files_url: assets.courseElementAssetBasePath(
      course.commit_hash,
      locals.urlPrefix,
    ),
    course_element_extension_files_url: assets.courseElementExtensionAssetBasePath(
      course.commit_hash,
      locals.urlPrefix,
    ),
    submission_files_url: submission ? submissionFilesUrl : null,

    variant_id: variant.id,
    external_image_capture_url: locals.externalImageCaptureUrl,

    base_url: locals.baseUrl,
    workspace_url: locals.workspaceUrl || null,
    ...getContextOptions(context),
  };

  const data = {
    // `params` and `true_answer` are allowed to change during `parse()`/`grade()`,
    // so we'll use the submission's values if they exist.
    //
    // These should never be null, but that can't be encoded in the schema.
    params: submission?.params ?? variant.params ?? {},
    correct_answers: submission?.true_answer ?? variant.true_answer ?? {},
    submitted_answers: submission?.submitted_answer ?? {},
    format_errors: submission?.format_errors ?? {},
    partial_scores: submission?.partial_scores ?? {},
    score: submission?.score ?? 0,
    feedback: submission?.feedback ?? {},
    variant_seed: parseInt(variant.variant_seed ?? '0', 36),
    options,
    raw_submitted_answers: submission?.raw_submitted_answer ?? {},
    editable: !!(
      locals.allowAnswerEditing &&
      !['manual_grading', 'ai_grading'].includes(locals.questionRenderContext)
    ),
    manual_grading: run(() => {
      if (locals.questionRenderContext === 'manual_grading') return true;
      if (locals.questionRenderContext === 'ai_grading') {
        // We deliberately do not set `manualGradingInterface: true` when rendering
        // the submission for AI grading. The expectation is that instructors will
        // use elements like `<pl-manual-grading-only>` to provide extra instructions
        // to the LLM. We don't want to mix in instructions like that with the
        // student's response.
        return panel !== 'submission';
      }
      return false;
    }),
    ai_grading: locals.questionRenderContext === 'ai_grading',
    panel,
    num_valid_submissions: variant.num_tries ?? null,
  } satisfies ExecutionData;

  const { data: cachedData, cacheHit } = await getCachedDataOrCompute(
    {
      course,
      variant,
      submission,
      data,
      context,
    },
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

  // If we're rendering for AI grading, transform the resulting HTML to strip
  // out any data that isn't relevant during AI grading. This is done outside
  // of `getCachedDataOrCompute` so that we don't need to find a way to factor
  // the transformation into the cache key.
  const html = await run(async () => {
    if (isEnterprise() && locals.questionRenderContext === 'ai_grading') {
      const { stripHtmlForAiGrading } = await import('../ee/lib/ai-grading/ai-grading-render.js');
      return await stripHtmlForAiGrading(cachedData.html);
    }

    return cachedData.html;
  });

  return {
    ...cachedData,
    html,
    cacheHit,
  };
}

async function renderPanelInstrumented(
  panel: 'question' | 'answer' | 'submission',
  codeCaller: CodeCaller,
  submission: Submission | null,
  variant: Variant,
  question: Question,
  course: Course,
  locals: Record<string, any>,
  context: QuestionProcessingContext,
): Promise<RenderPanelResult> {
  return instrumented(`freeform.renderPanel:${panel}`, async (span) => {
    span.setAttributes({
      panel,
      'variant.id': variant.id,
      'question.id': question.id,
      'course.id': course.id,
    });
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
  renderSelection: { question: boolean; answer: boolean; submissions: boolean },
  variant: Variant,
  question: Question,
  submission: Submission | null,
  submissions: Submission[],
  course: Course,
  locals: Record<string, any>,
): QuestionServerReturnValue<RenderResultData> {
  return instrumented('freeform.render', async () => {
    debug('render()');
    const htmls = {
      extraHeadersHtml: '',
      questionHtml: '',
      submissionHtmls: submissions.map(() => ''),
      answerHtml: '',
    };
    let allRenderedElementNames: string[] = [];
    const courseIssues: CourseIssueError[] = [];
    const context = await getContext(question, course);

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

      for (const type in question.dependencies) {
        if (!(type in dependencies)) continue;

        for (const dep of question.dependencies[type]) {
          if (!dependencies[type].includes(dep)) {
            dependencies[type].push(dep);
          }
        }
      }

      // Gather dependencies for all rendered elements
      allRenderedElementNames.forEach((elementName) => {
        const resolvedElement = resolveElement(elementName, context);

        const elementDependencies = structuredClone(resolvedElement.dependencies) ?? {};
        const elementDynamicDependencies =
          structuredClone(resolvedElement.dynamicDependencies) ?? {};

        // Transform non-global dependencies to be prefixed by the element name,
        // since they'll be served from their element's directory
        if ('elementStyles' in elementDependencies) {
          elementDependencies.elementStyles = elementDependencies.elementStyles?.map(
            (dep) => `${resolvedElement.name}/${dep}`,
          );
        }
        if ('elementScripts' in elementDependencies) {
          elementDependencies.elementScripts = elementDependencies.elementScripts?.map(
            (dep) => `${resolvedElement.name}/${dep}`,
          );
        }
        if ('elementScripts' in elementDynamicDependencies) {
          elementDynamicDependencies.elementScripts = _.mapValues(
            elementDynamicDependencies.elementScripts,
            (dep) => `${resolvedElement.name}/${dep}`,
          );
        }

        for (const type in elementDependencies) {
          // Rename properties so we can track core and course element dependencies separately.
          const resolvedType = run(() => {
            if (resolvedElement.type === 'course') {
              if (type === 'elementStyles') return 'courseElementStyles';
              if (type === 'elementScripts') return 'courseElementScripts';
            } else {
              if (type === 'elementStyles') return 'coreElementStyles';
              if (type === 'elementScripts') return 'coreElementScripts';
            }
            return type;
          });

          if (!(resolvedType in dependencies)) continue;

          for (const dep of elementDependencies[type]) {
            if (!dependencies[resolvedType].includes(dep)) {
              dependencies[resolvedType].push(dep);
            }
          }
        }

        for (const type in elementDynamicDependencies) {
          // Rename properties so we can track core and course element dependencies separately.
          const resolvedType = run(() => {
            if (resolvedElement.type === 'course') {
              if (type === 'elementScripts') return 'courseElementScripts';
            } else {
              if (type === 'elementScripts') return 'coreElementScripts';
            }
            return type;
          });

          for (const key in elementDynamicDependencies[type]) {
            if (!Object.hasOwn(dynamicDependencies[resolvedType], key)) {
              dynamicDependencies[resolvedType][key] = elementDynamicDependencies[type][key];
            } else if (
              dynamicDependencies[resolvedType][key] !== elementDynamicDependencies[type][key]
            ) {
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
        if (Object.prototype.hasOwnProperty.call(extensions, elementName)) {
          for (const extensionName of Object.keys(extensions[elementName])) {
            if (
              !('dependencies' in extensions[elementName][extensionName]) &&
              !('dynamicDependencies' in extensions[elementName][extensionName])
            ) {
              continue;
            }

            const extension =
              structuredClone(extensions[elementName][extensionName].dependencies) ?? {};
            const extensionDynamic =
              structuredClone(extensions[elementName][extensionName].dynamicDependencies) ?? {};
            if ('extensionStyles' in extension) {
              extension.extensionStyles = extension.extensionStyles?.map(
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }
            if ('extensionScripts' in extension) {
              extension.extensionScripts = extension.extensionScripts?.map(
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }
            if ('extensionScripts' in extensionDynamic) {
              extensionDynamic.extensionScripts = _.mapValues(
                extensionDynamic.extensionScripts,
                (dep) => `${elementName}/${extensionName}/${dep}`,
              );
            }

            for (const type in extension) {
              if (!(type in dependencies)) continue;

              for (const dep of extension[type]) {
                if (!dependencies[type].includes(dep)) {
                  dependencies[type].push(dep);
                }
              }
            }
            for (const type in extensionDynamic) {
              for (const key in extensionDynamic[type]) {
                if (!Object.hasOwn(dynamicDependencies[type], key)) {
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
      const coreScriptUrls: string[] = [];
      const scriptUrls: string[] = [];
      const styleUrls: string[] = [];
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
      const courseElementUrlPrefix =
        locals.urlPrefix +
        (!idsEqual(question.course_id, variant.course_id)
          ? `/sharedElements/course/${course.id}`
          : '');
      dependencies.courseElementStyles.forEach((file) =>
        styleUrls.push(
          assets.courseElementAssetPath(course.commit_hash, courseElementUrlPrefix, file),
        ),
      );
      dependencies.courseElementScripts.forEach((file) =>
        scriptUrls.push(
          assets.courseElementAssetPath(course.commit_hash, courseElementUrlPrefix, file),
        ),
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
            assets.courseElementAssetPath(course.commit_hash, courseElementUrlPrefix, file),
          ),
          ..._.mapValues(dynamicDependencies.extensionScripts, (file) =>
            assets.courseElementExtensionAssetPath(course.commit_hash, locals.urlPrefix, file),
          ),
        },
      };

      // Check if any of the keys was found in more than one dependency type
      Object.keys(importMap.imports).forEach((key) => {
        const types = Object.entries(dynamicDependencies)
          .filter(([, value]) => Object.prototype.hasOwnProperty.call(value, key))
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
          : '',
        // It's important that any library-style scripts come first
        ...coreScriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
        ...scriptUrls.map((url) => `<script type="text/javascript" src="${url}"></script>`),
      ];
      htmls.extraHeadersHtml = headerHtmls.join('\n');

      return { courseIssues, data: htmls };
    });
  });
}

export async function file(
  filename: string,
  variant: Variant,
  question: Question,
  course: Course,
): QuestionServerReturnValue<Buffer> {
  return instrumented('freeform.file', async (span) => {
    debug('file()');
    if (variant.broken_at) throw new Error('attempted to get a file for a broken variant');

    const context = await getContext(question, course);

    const data = {
      // These should never be null, but that can't be encoded in the schema.
      params: variant.params ?? {},
      correct_answers: variant.true_answer ?? {},
      variant_seed: parseInt(variant.variant_seed, 36),
      options: { ...(variant.options ?? {}), ...getContextOptions(context) },
      filename,
    } satisfies ExecutionData;

    const { data: cachedData, cacheHit } = await getCachedDataOrCompute(
      {
        course,
        variant,
        submission: null, // Files aren't associated with any particular submission.
        data,
        context,
      },
      async () => {
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

export async function parse(
  submission: Submission,
  variant: Variant,
  question: Question,
  course: Course,
): QuestionServerReturnValue<ParseResultData> {
  return instrumented('freeform.parse', async () => {
    debug('parse()');
    if (variant.broken_at) throw new Error('attempted to parse broken variant');

    const context = await getContext(question, course);

    const data = {
      // These should never be null, but that can't be encoded in the schema.
      params: variant.params ?? {},
      correct_answers: variant.true_answer ?? {},
      submitted_answers: submission.submitted_answer ?? {},
      feedback: submission.feedback ?? {},
      format_errors: submission.format_errors ?? {},
      variant_seed: parseInt(variant.variant_seed, 36),
      options: { ...(variant.options ?? {}), ...getContextOptions(context) },
      raw_submitted_answers: submission.raw_submitted_answer ?? {},
      gradable: submission.gradable ?? true,
    } satisfies ExecutionData;

    return withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'parse',
        codeCaller,
        data,
        context,
      );

      if (Object.keys(resultData.format_errors).length > 0) resultData.gradable = false;

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

export async function grade(
  submission: Submission,
  variant: Variant,
  question: Question,
  question_course: Course,
): QuestionServerReturnValue<GradeResultData> {
  return instrumented('freeform.grade', async () => {
    debug('grade()');
    if (variant.broken_at) throw new Error('attempted to grade broken variant');
    if (submission.broken) throw new Error('attempted to grade broken submission');

    const context = await getContext(question, question_course);
    const data = {
      // Note that `params` and `true_answer` can change during `parse()`, so we
      // use the submission's values when grading.
      //
      // These should never be null, but that can't be encoded in the schema.
      params: submission.params ?? {},
      correct_answers: submission.true_answer ?? {},
      submitted_answers: submission.submitted_answer ?? {},
      format_errors: submission.format_errors ?? {},
      partial_scores: submission.partial_scores == null ? {} : submission.partial_scores,
      score: submission.score == null ? 0 : submission.score,
      feedback: submission.feedback == null ? {} : submission.feedback,
      variant_seed: parseInt(variant.variant_seed, 36),
      options: { ...(variant.options ?? {}), ...getContextOptions(context) },
      raw_submitted_answers: submission.raw_submitted_answer ?? {},
      gradable: submission.gradable ?? true,
    } satisfies ExecutionData;

    return withCodeCaller(question_course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'grade',
        codeCaller,
        data,
        context,
      );

      if (Object.keys(resultData.format_errors).length > 0) resultData.gradable = false;

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

export async function test(
  variant: Variant,
  question: Question,
  course: Course,
  test_type: 'correct' | 'incorrect' | 'invalid',
): QuestionServerReturnValue<TestResultData> {
  return instrumented('freeform.test', async () => {
    debug('test()');
    if (variant.broken_at) throw new Error('attempted to test broken variant');

    const context = await getContext(question, course);

    const data = {
      // These should never be null, but that can't be encoded in the schema.
      params: variant.params ?? {},
      correct_answers: variant.true_answer ?? {},
      format_errors: {},
      partial_scores: {},
      score: 0,
      feedback: {},
      variant_seed: parseInt(variant.variant_seed, 36),
      options: { ...(variant.options ?? {}), ...getContextOptions(context) },
      raw_submitted_answers: {},
      gradable: true as boolean,
      test_type,
    } satisfies ExecutionData & { test_type: 'correct' | 'incorrect' | 'invalid' };

    return withCodeCaller(course, async (codeCaller) => {
      const { courseIssues, data: resultData } = await processQuestion(
        'test',
        codeCaller,
        data,
        context,
      );

      if (Object.keys(resultData.format_errors).length > 0) resultData.gradable = false;

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

async function getContext(question: Question, course: Course): Promise<QuestionProcessingContext> {
  assert(question.directory, 'Question directory is missing');

  const coursePath = chunks.getRuntimeDirectoryForCourse(course);
  await chunks.ensureChunksForCourseAsync(course.id, [
    { type: 'question', questionId: question.id },
    { type: 'clientFilesCourse' },
    { type: 'serverFilesCourse' },
    { type: 'elements' },
    { type: 'elementExtensions' },
  ]);

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
  };
}

async function getCacheKey(
  course: Course,
  variant: Variant,
  submission: Submission | null,
  data: ExecutionData,
  context: QuestionProcessingContext,
): Promise<string | null> {
  try {
    const commitHash = await getOrUpdateCourseCommitHash(course);

    const dataHash = objectHash(
      [
        // We deliberately exclude large user-controlled objects from the cache key.
        // Whenever these change, the `modified_at` column of `variants` and/or
        // `submissions` will change, which will cause the cache to be invalidated.
        _.omit(data, [
          'params',
          'correct_answers',
          'submitted_answers',
          'format_errors',
          'partial_scores',
          'feedback',
          'raw_submitted_answers',
        ]),
        context,
        variant.modified_at,
        submission?.modified_at,
      ],
      { algorithm: 'sha1', encoding: 'base64' },
    );

    // The variant and submission IDs are included in the cache key to ensure
    // that data never leaks between variants or submissions.
    return `variant:${variant.id}:submission:${submission?.id ?? null}:${commitHash}-${dataHash}:cache`;
  } catch {
    return null;
  }
}

async function getCachedDataOrCompute(
  {
    course,
    variant,
    submission,
    data,
    context,
  }: {
    course: Course;
    variant: Variant;
    submission: Submission | null;
    data: ExecutionData;
    context: QuestionProcessingContext;
  },
  computeFcn: () => Promise<any>,
) {
  // This function will compute the cachedData and cache it if
  // cacheKey is not null
  const doCompute = async (cacheKey: string | null) => {
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
  const getFromCacheOrCompute = async (cacheKey: string) => {
    let cachedData: unknown;

    try {
      cachedData = await cache.get(cacheKey);
    } catch (err) {
      // We don't actually want to fail if the cache has an error; we'll
      // just compute the cachedData as normal
      logger.error('Error in cache.get()', err);
      Sentry.captureException(err);
    }

    if (cachedData) {
      return {
        data: cachedData,
        cacheHit: true,
      };
    }

    return doCompute(cacheKey);
  };

  if (config.devMode) {
    // In dev mode, we should skip caching so that we'll immediately
    // pick up new changes from disk
    return doCompute(null);
  }

  const cacheKey = await getCacheKey(course, variant, submission, data, context);
  // If for some reason we failed to get a cache key, don't
  // actually fail the request, just skip the cache entirely
  // and compute as usual
  if (!cacheKey) {
    return await doCompute(null);
  } else {
    return await getFromCacheOrCompute(cacheKey);
  }
}
