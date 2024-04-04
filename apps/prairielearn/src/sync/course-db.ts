import * as path from 'path';
import _ = require('lodash');
import * as fs from 'fs-extra';
import * as async from 'async';
import * as jju from 'jju';
import Ajv, { type JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { parseISO, isValid, isAfter, isFuture } from 'date-fns';

import { chalk } from '../lib/chalk';
import { config } from '../lib/config';
import * as schemas from '../schemas';
import * as infofile from './infofile';
import { validateJSON } from '../lib/json-load';
import { makePerformance } from './performance';
import { selectInstitutionForCourse } from '../models/institution';
import { features } from '../lib/features';

const perf = makePerformance('course-db');

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv({ allErrors: true });

const DEFAULT_QUESTION_INFO = {
  type: 'Calculation',
  clientFiles: ['client.js', 'question.html', 'answer.html'],
};
const DEFAULT_COURSE_INSTANCE_INFO = {
  groupAssessmentsBy: 'Set',
};
const DEFAULT_ASSESSMENT_INFO = {};

const DEFAULT_ASSESSMENT_SETS = [
  {
    abbreviation: 'HW',
    name: 'Homework',
    heading: 'Homeworks',
    color: 'green1',
  },
  { abbreviation: 'Q', name: 'Quiz', heading: 'Quizzes', color: 'red1' },
  {
    abbreviation: 'PQ',
    name: 'Practice Quiz',
    heading: 'Practice Quizzes',
    color: 'pink1',
  },
  { abbreviation: 'E', name: 'Exam', heading: 'Exams', color: 'brown1' },
  {
    abbreviation: 'PE',
    name: 'Practice Exam',
    heading: 'Practice Exams',
    color: 'yellow1',
  },
  {
    abbreviation: 'P',
    name: 'Prep',
    heading: 'Question Preparation',
    color: 'gray1',
  },
  {
    abbreviation: 'MP',
    name: 'Machine Problem',
    heading: 'Machine Problems',
    color: 'turquoise1',
  },
  {
    abbreviation: 'WS',
    name: 'Worksheet',
    heading: 'Worksheets',
    color: 'purple1',
  },
  { abbreviation: 'U', name: 'Unknown', heading: 'Unknown', color: 'red3' },
];

const DEFAULT_TAGS = [
  {
    name: 'numeric',
    color: 'brown1',
    description: 'The answer format is one or more numerical values.',
  },
  {
    name: 'symbolic',
    color: 'blue1',
    description: 'The answer format is a symbolic expression.',
  },
  {
    name: 'drawing',
    color: 'yellow1',
    description:
      'The answer format requires drawing on a canvas to input a graphical representation of an answer.',
  },
  {
    name: 'MC',
    color: 'green1',
    description:
      'The answer format is choosing from a small finite set of answers (multiple choice, possibly with multiple selections allowed, up to 10 possible answers).',
  },
  {
    name: 'code',
    color: 'turquoise1',
    description: 'The answer format is a piece of code.',
  },
  {
    name: 'multianswer',
    color: 'orange2',
    description:
      'The question requires multiple answers, either as steps in a sequence or as separate questions.',
  },
  {
    name: 'graph',
    color: 'purple1',
    description: 'The question tests reading information from a graph or drawing a graph.',
  },
  {
    name: 'concept',
    color: 'pink1',
    description: 'The question tests conceptual understanding of a topic.',
  },
  {
    name: 'calculate',
    color: 'green2',
    description:
      'The questions tests performing a numerical calculation, with either a calculator or equivalent software.',
  },
  {
    name: 'compute',
    color: 'purple1',
    description:
      'The question tests the writing and running of a piece of code to compute the answer. The answer itself is not the code, but could be a numeric answer output by the code, for example (use `code` when the answer is the code).',
  },
  {
    name: 'software',
    color: 'orange1',
    description: 'The question tests the use of a specific piece of software (e.g., Matlab).',
  },
  {
    name: 'estimation',
    color: 'red2',
    description:
      'Answering the question correctly will require some amount of estimation, so an exact answer is not possible.',
  },
  {
    name: 'secret',
    color: 'red3',
    description:
      "Only use this question on exams or quizzes that won't be released to students, so the question can be kept secret.",
  },
  {
    name: 'nontest',
    color: 'green3',
    description:
      'This question is not appropriate for use in a restricted testing environment, so only use it on homeworks or similar.',
  },
  { name: 'Sp15', color: 'gray1' },
  { name: 'Su15', color: 'gray1' },
  { name: 'Fa15', color: 'gray1' },
  { name: 'Sp16', color: 'gray1' },
  { name: 'Su16', color: 'gray1' },
  { name: 'Fa16', color: 'gray1' },
  { name: 'Sp17', color: 'gray1' },
  { name: 'Su17', color: 'gray1' },
  { name: 'Fa17', color: 'gray1' },
  { name: 'Sp18', color: 'gray1' },
  { name: 'Su18', color: 'gray1' },
  { name: 'Fa18', color: 'gray1' },
  { name: 'Sp19', color: 'gray1' },
  { name: 'Su19', color: 'gray1' },
  { name: 'Fa19', color: 'gray1' },
  { name: 'Sp20', color: 'gray1' },
  { name: 'Su20', color: 'gray1' },
  { name: 'Fa20', color: 'gray1' },
  { name: 'Sp21', color: 'gray1' },
  { name: 'Su21', color: 'gray1' },
  { name: 'Fa21', color: 'gray1' },
];

// For testing if a string is a v4 UUID
const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
// For finding all v4 UUIDs in a string/file
const FILE_UUID_REGEX =
  /"uuid":\s*"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/g;

// This type is used a lot, so make an alias
type InfoFile<T> = infofile.InfoFile<T>;

interface CourseOptions {
  useNewQuestionRenderer: boolean;
}

interface Tag {
  name: string;
  color: string;
  description?: string;
}

interface Topic {
  name: string;
  color: string;
  description?: string;
}

interface AssessmentSet {
  abbreviation: string;
  name: string;
  heading: string;
  color: string;
}

interface AssessmentModule {
  name: string;
  heading: string;
}

interface Course {
  uuid: string;
  name: string;
  title: string;
  path: string;
  timezone: string;
  exampleCourse: boolean;
  options: CourseOptions;
  tags: Tag[];
  topics: Topic[];
  assessmentSets: AssessmentSet[];
  assessmentModules: AssessmentModule[];
}

interface CourseInstanceAllowAccess {
  role: string; // Role is only allowed in legacy questions
  uids: string[];
  startDate: string;
  endDate: string;
  institution: string;
}

export interface CourseInstance {
  uuid: string;
  longName: string;
  number: number;
  timezone: string;
  hideInEnrollPage: boolean;
  allowAccess: CourseInstanceAllowAccess[];
  allowIssueReporting: boolean;
  groupAssessmentsBy: 'Set' | 'Module';
}

interface SEBConfig {
  password: string;
  quitPassword: string;
  allowPrograms: string[];
}

export interface AssessmentAllowAccess {
  mode: 'Public' | 'Exam' | 'SEB';
  examUuid: string;
  role: string; // Role is only allowed in legacy questions
  uids: string[];
  credit: number;
  startDate: string;
  endDate: string;
  active: boolean;
  timeLimitMin: number;
  password: string;
  SEBConfig: SEBConfig;
}

interface QuestionAlternative {
  points: number | number[];
  autoPoints: number | number[];
  maxPoints: number;
  manualPoints: number;
  maxAutoPoints: number;
  id: string;
  forceMaxPoints: boolean;
  triesPerVariant: number;
  advanceScorePerc: number;
  gradeRateMinutes: number;
  canView: string[];
  canSubmit: string[];
}

interface ZoneQuestion {
  points: number | number[];
  autoPoints: number | number[];
  maxPoints: number;
  manualPoints: number;
  maxAutoPoints: number;
  id?: string;
  forceMaxPoints: boolean;
  alternatives?: QuestionAlternative[];
  numberChoose: number;
  triesPerVariant: number;
  advanceScorePerc: number;
  gradeRateMinutes: number;
  canView: string[];
  canSubmit: string[];
}

interface Zone {
  title: string;
  maxPoints: number;
  numberChoose: number;
  bestQuestions: number;
  questions: ZoneQuestion[];
  advanceScorePerc: number;
  gradeRateMinutes: number;
  canView: string[];
  canSubmit: string[];
}

interface GroupRole {
  name: string;
  minimum: number;
  maximum: number;
  canAssignRoles: boolean;
}

export interface Assessment {
  uuid: string;
  type: 'Homework' | 'Exam';
  title: string;
  set: string;
  module: string;
  number: string;
  allowIssueReporting: boolean;
  allowRealTimeGrading: boolean;
  multipleInstance: boolean;
  shuffleQuestions: boolean;
  allowAccess: AssessmentAllowAccess[];
  text: string;
  maxBonusPoints: number;
  maxPoints: number;
  autoClose: boolean;
  zones: Zone[];
  constantQuestionValue: boolean;
  groupWork: boolean;
  groupMaxSize: number;
  groupMinSize: number;
  studentGroupCreate: boolean;
  studentGroupJoin: boolean;
  studentGroupLeave: boolean;
  groupRoles: GroupRole[];
  canView: string[];
  canSubmit: string[];
  advanceScorePerc: number;
  gradeRateMinutes: number;
}

interface QuestionExternalGradingOptions {
  enabled: boolean;
  image: string;
  entrypoint: string;
  serverFilesCourse: string[];
  timeout: number;
  enableNetworking: boolean;
  environment: Record<string, string | null>;
}

interface QuestionWorkspaceOptions {
  image: string;
  port: number;
  home: string;
  args: string;
  gradedFiles: string[];
  rewriteUrl: string;
  enableNetworking: boolean;
  environment: Record<string, string | null>;
}

export interface Question {
  id: string;
  qid: string;
  uuid: string;
  type: 'Calculation' | 'MultipleChoice' | 'Checkbox' | 'File' | 'MultipleTrueFalse' | 'v3';
  title: string;
  topic: string;
  tags: string[];
  clientFiles: string[];
  clientTemplates: string[];
  template: string;
  gradingMethod: 'Internal' | 'External' | 'Manual';
  singleVariant: boolean;
  showCorrectAnswer: boolean;
  partialCredit: boolean;
  options: Record<string, any>;
  externalGradingOptions: QuestionExternalGradingOptions;
  workspaceOptions?: QuestionWorkspaceOptions;
  dependencies: Record<string, string>;
}

export interface CourseInstanceData {
  courseInstance: InfoFile<CourseInstance>;
  assessments: Record<string, InfoFile<Assessment>>;
}

export interface CourseData {
  course: InfoFile<Course>;
  questions: Record<string, InfoFile<Question>>;
  courseInstances: Record<string, CourseInstanceData>;
}

export async function loadFullCourse(courseId: string, courseDir: string): Promise<CourseData> {
  const courseInfo = await loadCourseInfo(courseId, courseDir);
  perf.start('loadQuestions');
  const questions = await loadQuestions(courseDir);
  perf.end('loadQuestions');
  const courseInstanceInfos = await loadCourseInstances(courseDir);
  const courseInstances: Record<string, CourseInstanceData> = {};
  for (const courseInstanceId in courseInstanceInfos) {
    // TODO: is it really necessary to do all the crazy error checking on `lstat` for the assessments dir?
    // If so, duplicate all that here
    const assessments = await loadAssessments(courseDir, courseInstanceId, questions);
    const courseInstance = {
      courseInstance: courseInstanceInfos[courseInstanceId],
      assessments,
    };
    courseInstances[courseInstanceId] = courseInstance;
  }
  return {
    course: courseInfo,
    questions,
    courseInstances,
  };
}

function writeErrorsAndWarningsForInfoFileIfNeeded<T>(
  filePath: string,
  infoFile: InfoFile<T>,
  writeLine: (line?: string) => void,
): void {
  if (!infofile.hasErrorsOrWarnings(infoFile)) return;

  writeLine(chalk.bold(`• ${filePath}`));
  if (infofile.hasErrors(infoFile)) {
    infoFile.errors.forEach((error) => {
      const indentedError = error.replace(/\n/g, '\n    ');
      writeLine(chalk.red(`  ✖ ${indentedError}`));
    });
  }
  if (infofile.hasWarnings(infoFile)) {
    infoFile.warnings.forEach((warning) => {
      const indentedWarning = warning.replace(/\n/g, '\n    ');
      writeLine(chalk.yellow(`  ⚠ ${indentedWarning}`));
    });
  }
}

export function writeErrorsAndWarningsForCourseData(
  courseId: string,
  courseData: CourseData,
  writeLine: (line?: string) => void,
): void {
  writeErrorsAndWarningsForInfoFileIfNeeded('infoCourse.json', courseData.course, writeLine);
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    const questionPath = path.posix.join('questions', qid, 'info.json');
    writeErrorsAndWarningsForInfoFileIfNeeded(questionPath, question, writeLine);
  });
  Object.entries(courseData.courseInstances).forEach(([ciid, courseInstanceData]) => {
    const courseInstancePath = path.posix.join('courseInstances', ciid, 'infoCourseInstance.json');
    writeErrorsAndWarningsForInfoFileIfNeeded(
      courseInstancePath,
      courseInstanceData.courseInstance,
      writeLine,
    );
    Object.entries(courseInstanceData.assessments).forEach(([aid, assessment]) => {
      const assessmentPath = path.posix.join(
        'courseInstances',
        ciid,
        'assessments',
        aid,
        'infoAssessment.json',
      );
      writeErrorsAndWarningsForInfoFileIfNeeded(assessmentPath, assessment, writeLine);
    });
  });
}

export function courseDataHasErrors(courseData: CourseData): boolean {
  if (infofile.hasErrors(courseData.course)) return true;
  if (Object.values(courseData.questions).some(infofile.hasErrors)) return true;
  if (
    Object.values(courseData.courseInstances).some((courseInstance) => {
      if (infofile.hasErrors(courseInstance.courseInstance)) return true;
      return Object.values(courseInstance.assessments).some(infofile.hasErrors);
    })
  ) {
    return true;
  }
  return false;
}

export function courseDataHasErrorsOrWarnings(courseData: CourseData): boolean {
  if (infofile.hasErrorsOrWarnings(courseData.course)) return true;
  if (Object.values(courseData.questions).some(infofile.hasErrorsOrWarnings)) return true;
  if (
    Object.values(courseData.courseInstances).some((courseInstance) => {
      if (infofile.hasErrorsOrWarnings(courseInstance.courseInstance)) return true;
      return Object.values(courseInstance.assessments).some(infofile.hasErrorsOrWarnings);
    })
  ) {
    return true;
  }
  return false;
}

/**
 * Loads a JSON file at the path `path.join(coursePath, filePath). The
 * path is passed as two separate paths so that we can avoid leaking the
 * absolute path on disk to users.
 */
export async function loadInfoFile<T extends { uuid: string }>({
  coursePath,
  filePath,
  schema,
  tolerateMissing = false,
}: {
  coursePath: string;
  filePath: string;
  schema?: JSONSchemaType<T>;
  /** Whether or not a missing file constitutes an error */
  tolerateMissing?: boolean;
}): Promise<InfoFile<T> | null> {
  const absolutePath = path.join(coursePath, filePath);
  let contents: string;
  try {
    // perf.start(`readfile:${absolutePath}`);
    // fs-extra uses graceful-fs, which in turn will enqueue open operations.
    // this slows us down an unnecessary amount. Avoiding this queueing means
    // we could potentially hit an EMFILE error, but we haven't seen that in
    // practice in years, so that's a risk we're willing to take. We explicitly
    // use the native Node fs API here to opt out of this queueing behavior.
    contents = await fs.readFile(absolutePath, 'utf8');
    // perf.end(`readfile:${absolutePath}`);
  } catch (err) {
    // perf.end(`readfile:${absolutePath}`);
    if (err.code === 'ENOTDIR' && err.path === absolutePath) {
      // In a previous version of this code, we'd pre-filter
      // all files in the parent directory to remove anything
      // that may have accidentally slipped in, like .DS_Store.
      // However, that resulted in a huge number of system calls
      // that got really slow for large directories. Now, we'll
      // just blindly try to read a file from the directory and assume
      // that if we see ENOTDIR, that means the directory was not
      // in fact a directory.
      return null;
    }
    if (tolerateMissing && err.code === 'ENOENT' && err.path === absolutePath) {
      // For info files that are recursively loaded, this probably means
      // we tried to load a file at an intermediate directory. This isn't
      // an error; return null to let the caller handle this.
      return null;
    }

    // If it wasn't a missing file, this is another error. Propagate it to
    // the caller.
    return infofile.makeError(`Error reading JSON file ${filePath}: ${err.code}`);
  }

  try {
    // jju is about 5x slower than standard JSON.parse. In the average
    // case, we'll have valid JSON, so we can take the fast path. If we
    // fail to parse, we'll take the hit and reparse with jju to generate
    // a better error report for users.
    const json = JSON.parse(contents);
    if (!json.uuid) {
      return infofile.makeError('UUID is missing');
    }
    if (!UUID_REGEX.test(json.uuid)) {
      return infofile.makeError(`UUID "${json.uuid}" is not a valid v4 UUID`);
    }

    if (!schema) {
      // Skip schema validation, just return the data
      return infofile.makeInfoFile({
        uuid: json.uuid,
        data: json,
      });
    }

    // Validate file against schema
    const validate = ajv.compile<T>(schema);
    try {
      validate(json);
      if (validate.errors) {
        const result = infofile.makeInfoFile<T>({ uuid: json.uuid });
        const errorText = betterAjvErrors(schema, json, validate.errors, {
          indent: 2,
        });
        const errorTextString = String(errorText); // hack to fix incorrect type in better-ajv-errors/typings.d.ts
        infofile.addError(result, errorTextString);
        return result;
      }
      return infofile.makeInfoFile({
        uuid: json.uuid,
        data: json,
      });
    } catch (err) {
      return infofile.makeError(err.message);
    }
  } catch (err) {
    // Invalid JSON; let's reparse with jju to get a better error message
    // for the user.
    let result: InfoFile<T> = { errors: [], warnings: [] };
    try {
      // This should always throw
      jju.parse(contents, { mode: 'json' });
    } catch (e) {
      result = infofile.makeError(`Error parsing JSON: ${e.message}`);
    }

    // The document was still valid JSON, but we may still be able to
    // extract a UUID from the raw files contents with a regex.
    const match = (contents || '').match(FILE_UUID_REGEX);
    if (!match) {
      infofile.addError(result, 'UUID not found in file');
      return result;
    }
    if (match.length > 1) {
      infofile.addError(result, 'More than one UUID found in file');
      return result;
    }

    // Extract and store UUID. Checking for a falsy value isn't technically
    // required, but it keeps TypeScript happy.
    const uuid = match[0].match(UUID_REGEX);
    if (!uuid) {
      infofile.addError(result, 'UUID not found in file');
      return result;
    }

    result.uuid = uuid[0];
    return result;
  }
}

export async function loadCourseInfo(
  courseId: string,
  coursePath: string,
): Promise<InfoFile<Course>> {
  const maybeNullLoadedData: InfoFile<Course> | null = await loadInfoFile({
    coursePath,
    filePath: 'infoCourse.json',
    schema: schemas.infoCourse,
  });

  if (maybeNullLoadedData && infofile.hasErrors(maybeNullLoadedData)) {
    // We'll only have an error if we couldn't parse JSON data; abort
    return maybeNullLoadedData;
  }

  if (!maybeNullLoadedData || !maybeNullLoadedData.data) {
    throw new Error('Could not load infoCourse.json');
  }

  // Reassign to a non-null type.
  const loadedData = maybeNullLoadedData;
  const info = maybeNullLoadedData.data;

  /**
   * Used to retrieve fields such as "assessmentSets" and "topics".
   * Adds a warning when syncing if duplicates are found.
   * If defaults are provided, the entries from defaults not present in the resulting list are merged.
   * @param fieldName The member of `info` to inspect
   * @param entryIdentifier The member of each element of the field which uniquely identifies it, usually "name"
   */
  function getFieldWithoutDuplicates<
    K extends 'tags' | 'topics' | 'assessmentSets' | 'assessmentModules',
  >(fieldName: K, entryIdentifier: string, defaults?: Course[K] | undefined): Course[K] {
    const known = new Map();
    const duplicateEntryIds = new Set();

    (info[fieldName] || []).forEach((entry) => {
      const entryId = entry[entryIdentifier];
      if (known.has(entryId)) {
        duplicateEntryIds.add(entryId);
      }
      known.set(entryId, entry);
    });

    if (duplicateEntryIds.size > 0) {
      const duplicateIdsString = [...duplicateEntryIds.values()]
        .map((name) => `"${name}"`)
        .join(', ');
      const warning = `Found duplicates in '${fieldName}': ${duplicateIdsString}. Only the last of each duplicate will be synced.`;
      infofile.addWarning(loadedData, warning);
    }

    if (defaults) {
      defaults.forEach((defaultEntry) => {
        const defaultEntryId = defaultEntry[entryIdentifier];
        if (!known.has(defaultEntryId)) {
          known.set(defaultEntryId, defaultEntry);
        }
      });
    }

    // Turn the map back into a list; the JS spec ensures that Maps remember
    // insertion order, so the order is preserved.
    return [...known.values()];
  }

  const assessmentSets = getFieldWithoutDuplicates(
    'assessmentSets',
    'name',
    DEFAULT_ASSESSMENT_SETS,
  );
  const tags = getFieldWithoutDuplicates('tags', 'name', DEFAULT_TAGS);
  const topics = getFieldWithoutDuplicates('topics', 'name');
  const assessmentModules = getFieldWithoutDuplicates('assessmentModules', 'name');

  const devModeFeatures: string[] = _.get(info, 'options.devModeFeatures', []);
  if (devModeFeatures.length > 0) {
    const institution = await selectInstitutionForCourse({ course_id: courseId });

    for (const feature of new Set(devModeFeatures)) {
      // Check if the feature even exists.
      if (!features.hasFeature(feature)) {
        infofile.addWarning(loadedData, `Feature "${feature}" does not exist.`);
        continue;
      }

      // If we're in dev mode, any feature is allowed.
      if (config.devMode) continue;

      // If the feature exists, check if it's granted to the course and warn if not.
      const featureEnabled = await features.enabled(feature, {
        institution_id: institution.id,
        course_id: courseId,
      });
      if (!featureEnabled) {
        infofile.addWarning(loadedData, `Feature "${feature}" is not enabled for this course.`);
      }
    }
  }

  const exampleCourse =
    info.uuid === 'fcc5282c-a752-4146-9bd6-ee19aac53fc5' &&
    info.title === 'Example Course' &&
    info.name === 'XC 101';

  const course = {
    uuid: info.uuid.toLowerCase(),
    path: coursePath,
    name: info.name,
    title: info.title,
    timezone: info.timezone,
    assessmentSets,
    assessmentModules,
    tags,
    topics,
    exampleCourse,
    options: {
      useNewQuestionRenderer: _.get(info, 'options.useNewQuestionRenderer', false),
      devModeFeatures,
    },
  };

  loadedData.data = course;
  return loadedData;
}

async function loadAndValidateJson<T extends { uuid: string }>({
  coursePath,
  filePath,
  defaults,
  schema,
  validate,
  tolerateMissing,
}: {
  coursePath: string;
  filePath: string;
  defaults: any;
  schema: any;
  /** Whether or not a missing file constitutes an error */
  tolerateMissing?: boolean;
  validate: (info: T) => Promise<{ warnings: string[]; errors: string[] }>;
}): Promise<InfoFile<T> | null> {
  const loadedJson: InfoFile<T> | null = await loadInfoFile({
    coursePath,
    filePath,
    schema,
    tolerateMissing,
  });
  if (loadedJson === null) {
    // This should only occur if we looked for a file in a non-directory,
    // as would happen if there was a .DS_Store file, or if we're
    // tolerating missing files, as we'd need to for nesting support.
    return null;
  }
  if (infofile.hasErrors(loadedJson) || !loadedJson.data) {
    return loadedJson;
  }

  const validationResult = await validate(loadedJson.data);
  if (validationResult.errors.length > 0) {
    infofile.addErrors(loadedJson, validationResult.errors);
    return loadedJson;
  }

  loadedJson.data = _.defaults(loadedJson.data, defaults);
  infofile.addWarnings(loadedJson, validationResult.warnings);
  return loadedJson;
}

/**
 * Loads and schema-validates all info files in a directory.
 */
async function loadInfoForDirectory<T extends { uuid: string }>({
  coursePath,
  directory,
  infoFilename,
  defaultInfo,
  schema,
  validate,
  recursive = false,
}: {
  /** The path of the course being synced */
  coursePath: string;
  /** The path of the directory relative to `coursePath` */
  directory: string;
  infoFilename: string;
  defaultInfo: any;
  schema: any;
  validate: (info: T) => Promise<{ warnings: string[]; errors: string[] }>;
  /** Whether or not info files should be searched for recursively */
  recursive?: boolean;
}): Promise<Record<string, InfoFile<T>>> {
  // Recursive lookup might not be enabled for some info types - if it's
  // disabled, we'll still utilize the same recursive function, but the
  // recursive function won't actually recurse.
  const infoFilesRootDir = path.join(coursePath, directory);
  const walk = async (relativeDir) => {
    const infoFiles: Record<string, InfoFile<T>> = {};
    const files = await fs.readdir(path.join(infoFilesRootDir, relativeDir));

    // For each file in the directory, assume it is a question directory
    // and attempt to access `info.json`. If we can successfully read it,
    // hooray, we're done.
    await async.each(files, async (dir: string) => {
      const infoFilePath = path.join(directory, relativeDir, dir, infoFilename);
      const info = await loadAndValidateJson({
        coursePath,
        filePath: infoFilePath,
        defaults: defaultInfo,
        schema,
        validate,
        // If we aren't operating in recursive mode, we want to ensure
        // that missing files are correctly reflected as errors.
        tolerateMissing: recursive,
      });
      if (info) {
        infoFiles[path.join(relativeDir, dir)] = info;
      } else if (recursive) {
        try {
          const subInfoFiles = await walk(path.join(relativeDir, dir));
          if (_.isEmpty(subInfoFiles)) {
            infoFiles[path.join(relativeDir, dir)] = infofile.makeError(
              `Missing JSON file: ${infoFilePath}`,
            );
          }
          _.assign(infoFiles, subInfoFiles);
        } catch (e) {
          if (e.code === 'ENOTDIR') {
            // This wasn't a directory; ignore it.
          } else if (e.code === 'ENOENT') {
            // Missing directory; record it
            infoFiles[path.join(relativeDir, dir)] = infofile.makeError(
              `Missing JSON file: ${infoFilePath}`,
            );
          } else {
            // Some other error, permissions perhaps. Throw to abort sync.
            throw e;
          }
        }
      }
    });
    return infoFiles;
  };

  try {
    return await walk('');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Missing directory; return an empty list
      return {};
    }
    // Some other error; Throw it to abort.
    throw e;
  }
}

function checkDuplicateUUIDs<T>(
  infos: Record<string, InfoFile<T>>,
  makeErrorMessage: (uuid: string, otherIds: string[]) => string,
) {
  // First, create a map from UUIDs to questions that use them
  const uuids = Object.entries(infos).reduce((map, [id, info]) => {
    if (!info.uuid) {
      // Couldn't find UUID in the file
      return map;
    }
    let ids = map.get(info.uuid);
    if (!ids) {
      ids = [];
      map.set(info.uuid, ids);
    }
    ids.push(id);
    return map;
  }, new Map<string, string[]>());

  // Do a second pass to add errors for things with duplicate IDs
  // We also null out UUIDs for items where duplicates are found
  uuids.forEach((ids, uuid) => {
    if (ids.length === 1) {
      // Only one question uses this UUID
      return;
    }
    ids.forEach((id) => {
      const otherIds = ids.filter((other) => other !== id);
      infofile.addWarning(infos[id], makeErrorMessage(uuid, otherIds));
      infos[id].uuid = undefined;
    });
  });
}

/**
 * Checks that roles are not present.
 * @returns A list of warnings, if any
 */
function checkAllowAccessRoles(rule: { role?: string }): string[] {
  const warnings: string[] = [];
  if ('role' in rule) {
    if (rule.role !== 'Student') {
      warnings.push(
        `The entire "allowAccess" rule with "role: ${rule.role}" should be deleted. Instead, course owners can now manage course staff access on the "Staff" page.`,
      );
    }
  }
  return warnings;
}

/**
 * Returns whether or not an `allowAccess` rule date is valid. It's considered
 * valid if it matches the regexp used in the `input_date` sproc and if it can
 * parse into a JavaScript `Date` object. If the supplied date is considered
 * invalid, `null` is returned.
 */
function parseAllowAccessDate(date: string): Date | null {
  // This ensures we don't accept strings like "2024-04", which `parseISO`
  // would happily accept. We want folks to always be explicit about days/times.
  //
  // This matches the regexp used in the `input_date` sproc.
  const match = /[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}/.exec(date);
  if (!match) return null;

  const parsedDate = parseISO(date);
  return isValid(parsedDate) ? parsedDate : null;
}

/**
 * Checks that dates, if present, are valid and sequenced correctly.
 * @returns A list of errors, if any, and whether there are any dates in the future
 */
function checkAllowAccessDates(rule: { startDate?: string; endDate?: string }): {
  errors: string[];
  dateInFuture: boolean;
} {
  const errors: string[] = [];

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  // Note that we're deliberately choosing to ignore timezone handling here. These
  // will ultimately be interpreted with the course instance's timezone, but all we
  // care about here are if the dates are valid and that the end date is after the
  // start date.
  //
  // See the `input_date` sproc for where these strings are ultimately parsed for
  // storage in the database. That sproc actually has stricter validation
  if (rule.startDate) {
    startDate = parseAllowAccessDate(rule.startDate);
    if (!startDate) {
      errors.push(`Invalid allowAccess rule: startDate (${rule.startDate}) is not valid`);
    }
  }
  if (rule.endDate) {
    endDate = parseAllowAccessDate(rule.endDate);
    if (!endDate) {
      errors.push(`Invalid allowAccess rule: endDate (${rule.endDate}) is not valid`);
    }
  }
  if (startDate && endDate && isAfter(startDate, endDate)) {
    errors.push(
      `Invalid allowAccess rule: startDate (${rule.startDate}) must not be after endDate (${rule.endDate})`,
    );
  }
  let dateInFuture = false;
  if (startDate && isFuture(startDate)) {
    dateInFuture = true;
  }
  if (endDate && isFuture(endDate)) {
    dateInFuture = true;
  }
  return { errors, dateInFuture };
}

async function validateQuestion(
  question: Question,
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (question.type && question.options) {
    try {
      const schema = schemas[`questionOptions${question.type}`];
      const options = question.options;
      validateJSON(options, schema);
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (question.externalGradingOptions?.timeout) {
    if (question.externalGradingOptions.timeout > config.externalGradingMaximumTimeout) {
      warnings.push(
        `External grading timeout value of ${question.externalGradingOptions.timeout} seconds exceeds the maximum value and has been limited to ${config.externalGradingMaximumTimeout} seconds.`,
      );
      question.externalGradingOptions.timeout = config.externalGradingMaximumTimeout;
    }
  }

  return { warnings, errors };
}

async function validateAssessment(
  assessment: Assessment,
  questions: Record<string, InfoFile<Question>>,
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const allowRealTimeGrading = _.get(assessment, 'allowRealTimeGrading', true);
  if (assessment.type === 'Homework') {
    // Because of how Homework-type assessments work, we don't allow
    // real-time grading to be disabled for them.
    if (!allowRealTimeGrading) {
      errors.push(`Real-time grading cannot be disabled for Homework-type assessments`);
    }

    // Homework-type assessments with multiple instances are not supported
    if (assessment.multipleInstance) {
      errors.push(`"multipleInstance" cannot be used for Homework-type assessments`);
    }
  }

  // Check assessment access rules
  let anyDateInFuture = false;
  (assessment.allowAccess || []).forEach((rule) => {
    const allowAccessResult = checkAllowAccessDates(rule);
    if (allowAccessResult.dateInFuture) {
      anyDateInFuture = true;
    }

    if ('active' in rule && rule.active === false && 'credit' in rule && rule.credit !== 0) {
      errors.push(`Invalid allowAccess rule: credit must be 0 if active is false`);
    }

    errors.push(...allowAccessResult.errors);
  });

  if (anyDateInFuture) {
    // only warn about new roles for current or future courses
    (assessment.allowAccess || []).forEach((rule) => {
      const allowAccessWarnings = checkAllowAccessRoles(rule);
      warnings.push(...allowAccessWarnings);
    });
  }

  const foundQids = new Set();
  const duplicateQids = new Set();
  const missingQids = new Set();
  const checkAndRecordQid = (qid: string): void => {
    if (qid[0] === '@') {
      // Question is being imported from another course. We hold off on validating this until
      // sync time because we need to query the database to verify that the question exists
      return;
    }
    if (!(qid in questions)) {
      missingQids.add(qid);
    }
    if (!foundQids.has(qid)) {
      foundQids.add(qid);
    } else {
      duplicateQids.add(qid);
    }
  };
  (assessment.zones || []).forEach((zone) => {
    (zone.questions || []).map((zoneQuestion) => {
      const autoPoints = zoneQuestion.autoPoints ?? zoneQuestion.points;
      if (!allowRealTimeGrading && Array.isArray(autoPoints) && autoPoints.length > 1) {
        errors.push(
          `Cannot specify an array of multiple point values for a question if real-time grading is disabled`,
        );
      }
      // We'll normalize either single questions or alternative groups
      // to make validation easier
      let alternatives: {
        points: number | number[];
        autoPoints: number | number[];
        maxPoints: number;
        maxAutoPoints: number;
        manualPoints: number;
      }[] = [];
      if ('alternatives' in zoneQuestion && 'id' in zoneQuestion) {
        errors.push('Cannot specify both "alternatives" and "id" in one question');
      } else if (zoneQuestion?.alternatives) {
        zoneQuestion.alternatives.forEach((alternative) => checkAndRecordQid(alternative.id));
        alternatives = zoneQuestion.alternatives.map((alternative) => {
          const autoPoints = alternative.autoPoints ?? alternative.points;
          if (!allowRealTimeGrading && Array.isArray(autoPoints) && autoPoints.length > 1) {
            errors.push(
              `Cannot specify an array of multiple point values for an alternative if real-time grading is disabled`,
            );
          }
          return {
            points: alternative.points ?? zoneQuestion.points,
            maxPoints: alternative.maxPoints ?? zoneQuestion.maxPoints,
            maxAutoPoints: alternative.maxAutoPoints ?? zoneQuestion.maxAutoPoints,
            autoPoints: alternative.autoPoints ?? zoneQuestion.autoPoints,
            manualPoints: alternative.manualPoints ?? zoneQuestion.manualPoints,
          };
        });
      } else if (zoneQuestion.id) {
        checkAndRecordQid(zoneQuestion.id);
        alternatives = [
          {
            points: zoneQuestion.points,
            maxPoints: zoneQuestion.maxPoints,
            maxAutoPoints: zoneQuestion.maxAutoPoints,
            autoPoints: zoneQuestion.autoPoints,
            manualPoints: zoneQuestion.manualPoints,
          },
        ];
      } else {
        errors.push(`Zone question must specify either "alternatives" or "id"`);
      }

      alternatives.forEach((alternative) => {
        if (
          alternative.points === undefined &&
          alternative.autoPoints === undefined &&
          alternative.manualPoints === undefined
        ) {
          errors.push('Must specify "points", "autoPoints" or "manualPoints" for a question');
        }
        if (
          alternative.points !== undefined &&
          (alternative.autoPoints !== undefined ||
            alternative.manualPoints !== undefined ||
            alternative.maxAutoPoints !== undefined)
        ) {
          errors.push(
            'Cannot specify "points" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified',
          );
        }
        if (assessment.type === 'Exam') {
          if (alternative.maxPoints !== undefined || alternative.maxAutoPoints !== undefined) {
            errors.push(
              'Cannot specify "maxPoints" or "maxAutoPoints" for a question in an "Exam" assessment',
            );
          }

          const hasSplitPoints =
            alternative.autoPoints !== undefined ||
            alternative.maxAutoPoints !== undefined ||
            alternative.manualPoints !== undefined;
          const autoPoints = (hasSplitPoints ? alternative.autoPoints : alternative.points) ?? 0;
          const pointsList = Array.isArray(autoPoints) ? autoPoints : [autoPoints];
          const isNonIncreasing = pointsList.every(
            (points, index) => index === 0 || points <= pointsList[index - 1],
          );
          if (!isNonIncreasing) {
            errors.push('Points for a question must be non-increasing');
          }
        }
        if (assessment.type === 'Homework') {
          if (
            alternative.maxPoints !== undefined &&
            (alternative.autoPoints !== undefined ||
              alternative.manualPoints !== undefined ||
              alternative.maxAutoPoints !== undefined)
          ) {
            errors.push(
              'Cannot specify "maxPoints" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified',
            );
          }
          if (Array.isArray(alternative.autoPoints ?? alternative.points)) {
            errors.push(
              'Cannot specify "points" or "autoPoints" as a list for a question in a "Homework" assessment',
            );
          }
        }
      });
    });
  });

  if (duplicateQids.size > 0) {
    errors.push(
      `The following questions are used more than once: ${[...duplicateQids].join(', ')}`,
    );
  }

  if (missingQids.size > 0) {
    errors.push(
      `The following questions do not exist in this course: ${[...missingQids].join(', ')}`,
    );
  }

  if (assessment.groupRoles) {
    // Ensure at least one mandatory role can assign roles
    const foundCanAssignRoles = assessment.groupRoles.some(
      (role) => role.canAssignRoles && role.minimum >= 1,
    );

    if (!foundCanAssignRoles) {
      errors.push('Could not find a role with minimum >= 1 and "canAssignRoles" set to "true".');
    }

    // Ensure values for role minimum and maximum are within bounds
    assessment.groupRoles.forEach((role) => {
      if (role.minimum > assessment.groupMinSize) {
        warnings.push(
          `Group role "${role.name}" has a minimum greater than the group's minimum size.`,
        );
      }
      if (role.minimum && role.minimum > assessment.groupMaxSize) {
        errors.push(
          `Group role "${role.name}" contains an invalid minimum. (Expected at most ${assessment.groupMaxSize}, found ${role.minimum}).`,
        );
      }
      if (role.maximum && role.maximum > assessment.groupMaxSize) {
        errors.push(
          `Group role "${role.name}" contains an invalid maximum. (Expected at most ${assessment.groupMaxSize}, found ${role.maximum}).`,
        );
      }
      if (role.minimum > role.maximum) {
        errors.push(
          `Group role "${role.name}" must have a minimum <= maximum. (Expected minimum <= ${role.maximum}, found minimum = ${role.minimum}).`,
        );
      }
    });

    const validRoleNames = new Set();
    assessment.groupRoles?.forEach((role) => {
      validRoleNames.add(role.name);
    });

    const validateViewAndSubmitRolePermissions = (
      canView: string[] | null | undefined,
      canSubmit: string[] | null | undefined,
      area: string,
    ): void => {
      (canView || []).forEach((roleName) => {
        if (!validRoleNames.has(roleName)) {
          errors.push(
            `The ${area}'s "canView" permission contains the non-existent group role name "${roleName}".`,
          );
        }
      });
      (canSubmit || []).forEach((roleName) => {
        if (!validRoleNames.has(roleName)) {
          errors.push(
            `The ${area}'s "canSubmit" permission contains the non-existent group role name "${roleName}".`,
          );
        }
      });
    };

    // Validate role names at the assessment level
    validateViewAndSubmitRolePermissions(assessment.canView, assessment.canSubmit, 'assessment');

    // Validate role names for each zone
    (assessment.zones || []).forEach((zone) => {
      validateViewAndSubmitRolePermissions(zone.canView, zone.canSubmit, 'zone');
      // Validate role names for each question
      (zone.questions || []).forEach((zoneQuestion) => {
        validateViewAndSubmitRolePermissions(
          zoneQuestion.canView,
          zoneQuestion.canSubmit,
          'zone question',
        );
      });
    });
  }

  return { warnings, errors };
}

async function validateCourseInstance(
  courseInstance: CourseInstance,
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (_(courseInstance).has('allowIssueReporting')) {
    if (courseInstance.allowIssueReporting) {
      warnings.push('"allowIssueReporting" is no longer needed.');
    } else {
      errors.push(
        '"allowIssueReporting" is no longer permitted in "infoCourseInstance.json". Instead, set "allowIssueReporting" in "infoAssessment.json" files.',
      );
    }
  }

  let anyDateInFuture = false;
  (courseInstance.allowAccess || []).forEach((rule) => {
    const allowAccessResult = checkAllowAccessDates(rule);
    if (allowAccessResult.dateInFuture) {
      anyDateInFuture = true;
    }

    errors.push(...allowAccessResult.errors);
  });

  if (anyDateInFuture) {
    // only warn about new roles for current or future courses
    (courseInstance.allowAccess || []).forEach((rule) => {
      const allowAccessWarnings = checkAllowAccessRoles(rule);
      warnings.push(...allowAccessWarnings);
    });

    if (_(courseInstance).has('userRoles')) {
      warnings.push(
        'The property "userRoles" should be deleted. Instead, course owners can now manage staff access on the "Staff" page.',
      );
    }
  }

  return { warnings, errors };
}

/**
 * Loads all questions in a course directory.
 */
export async function loadQuestions(
  coursePath: string,
): Promise<Record<string, InfoFile<Question>>> {
  const questions = await loadInfoForDirectory({
    coursePath,
    directory: 'questions',
    infoFilename: 'info.json',
    defaultInfo: DEFAULT_QUESTION_INFO,
    schema: schemas.infoQuestion,
    validate: validateQuestion,
    recursive: true,
  });
  // Don't allow question directories to start with '@', because it is
  // used to import questions from other courses.
  for (const qid in questions) {
    if (qid[0] === '@') {
      infofile.addError(questions[qid], `Question IDs are not allowed to begin with '@'`);
    }
  }
  checkDuplicateUUIDs(
    questions,
    (uuid, ids) => `UUID "${uuid}" is used in other questions: ${ids.join(', ')}`,
  );
  return questions;
}

/**
 * Loads all course instances in a course directory.
 */
export async function loadCourseInstances(
  coursePath: string,
): Promise<Record<string, InfoFile<CourseInstance>>> {
  const courseInstances = await loadInfoForDirectory({
    coursePath,
    directory: 'courseInstances',
    infoFilename: 'infoCourseInstance.json',
    defaultInfo: DEFAULT_COURSE_INSTANCE_INFO,
    schema: schemas.infoCourseInstance,
    validate: validateCourseInstance,
    recursive: true,
  });
  checkDuplicateUUIDs(
    courseInstances,
    (uuid, ids) => `UUID "${uuid}" is used in other course instances: ${ids.join(', ')}`,
  );
  return courseInstances;
}

/**
 * Loads all assessments in a course instance.
 */
export async function loadAssessments(
  coursePath: string,
  courseInstance: string,
  questions: Record<string, InfoFile<Question>>,
): Promise<Record<string, InfoFile<Assessment>>> {
  const assessmentsPath = path.join('courseInstances', courseInstance, 'assessments');
  const validateAssessmentWithQuestions = (assessment: Assessment) =>
    validateAssessment(assessment, questions);
  const assessments = await loadInfoForDirectory({
    coursePath,
    directory: assessmentsPath,
    infoFilename: 'infoAssessment.json',
    defaultInfo: DEFAULT_ASSESSMENT_INFO,
    schema: schemas.infoAssessment,
    validate: validateAssessmentWithQuestions,
    recursive: true,
  });
  checkDuplicateUUIDs(
    assessments,
    (uuid, ids) =>
      `UUID "${uuid}" is used in other assessments in this course instance: ${ids.join(', ')}`,
  );
  return assessments;
}
