import * as path from 'path';

import { Ajv, type JSONSchemaType } from 'ajv';
import * as async from 'async';
import betterAjvErrors from 'better-ajv-errors';
import { isAfter, isFuture, isPast, isValid, parseISO } from 'date-fns';
import { isEmptyObject } from 'es-toolkit';
import fs from 'fs-extra';
import jju from 'jju';
import { type ZodSchema, z } from 'zod';

import { run } from '@prairielearn/run';
import * as Sentry from '@prairielearn/sentry';

import { chalk } from '../lib/chalk.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { findCoursesBySharingNames } from '../models/course.js';
import { selectInstitutionForCourse } from '../models/institution.js';
import {
  type AssessmentJson,
  type AssessmentJsonInput,
  type AssessmentSetJson,
  type CourseInstanceJson,
  type CourseJson,
  type GroupsJson,
  type QuestionJson,
  type QuestionPointsJson,
  type TagJson,
} from '../schemas/index.js';
import * as schemas from '../schemas/index.js';

import { deduplicateByName } from './deduplicate.js';
import * as infofile from './infofile.js';
import { isDraftQid } from './question.js';

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv({ allErrors: true });

const DEFAULT_ASSESSMENT_SETS: AssessmentSetJson[] = [
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

const DEFAULT_TAGS: TagJson[] = [
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

export interface CourseInstanceData {
  courseInstance: InfoFile<CourseInstanceJson>;
  assessments: Record<string, InfoFile<AssessmentJson>>;
}

export interface CourseData {
  course: InfoFile<CourseJson>;
  questions: Record<string, InfoFile<QuestionJson>>;
  courseInstances: Record<string, CourseInstanceData>;
}

/**
 * Loads and validates an entire course from a directory on disk.
 * Downstream callers of this function can use
 * ...Json types instead of ...JsonInput types.
 */
export async function loadFullCourse(
  courseId: string | null,
  coursePath: string,
): Promise<CourseData> {
  const sharingEnabled = await run(async () => {
    // If the course ID is null, the feature can't possibly be enabled.
    if (courseId == null) return false;

    const institution = await selectInstitutionForCourse({ course_id: courseId });
    return await features.enabled('question-sharing', {
      institution_id: institution.id,
      course_id: courseId,
    });
  });

  const questions = await loadQuestions({ coursePath, sharingEnabled });
  const tagsInUse = new Set<string>();

  for (const question of Object.values(questions)) {
    if (question.data?.tags) {
      for (const tag of question.data.tags) {
        tagsInUse.add(tag);
      }
    }
  }

  const courseInstanceInfos = await loadCourseInstances({ coursePath, sharingEnabled });
  const courseInstances: Record<string, CourseInstanceData> = {};
  const assessmentSetsInUse = new Set<string>();

  for (const [courseInstanceDirectory, courseInstance] of Object.entries(courseInstanceInfos)) {
    // Check if the course instance is "expired". A course instance is considered
    // expired if it either has zero `allowAccess` rules (in which case it is never
    // accessible), or if it has one or more `allowAccess` rules and they all have
    // an `endDate` that is in the past.
    //
    // If the `allowAccess` section is not present, we instead consider publishing.endDate.

    const allowAccessRules = courseInstance.data?.allowAccess;

    const courseInstanceExpired = run(() => {
      if (allowAccessRules !== undefined) {
        return allowAccessRules.every((rule) => {
          const endDate = rule.endDate ? parseJsonDate(rule.endDate) : null;
          return endDate && isPast(endDate);
        });
      }

      // We have no access rules, so we are using a modern publishing configuration.
      return (
        courseInstance.data?.publishing?.endDate == null ||
        courseInstance.data.publishing.startDate == null ||
        isPast(courseInstance.data.publishing.endDate)
      );
    });

    const assessments = await loadAssessments({
      coursePath,
      courseInstanceDirectory,
      courseInstanceExpired,
      questions,
      sharingEnabled,
    });

    for (const assessment of Object.values(assessments)) {
      if (assessment.data?.set) {
        assessmentSetsInUse.add(assessment.data.set);
      }
    }

    courseInstances[courseInstanceDirectory] = {
      courseInstance,
      assessments,
    };
  }

  const courseInfo = await loadCourseInfo({
    courseId,
    coursePath,
    assessmentSetsInUse,
    tagsInUse,
    sharingEnabled,
  });

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
      const indentedError = error.replaceAll('\n', '\n    ');
      writeLine(chalk.redBright(`  ✖ ${indentedError}`));
    });
  }
  if (infofile.hasWarnings(infoFile)) {
    infoFile.warnings.forEach((warning) => {
      const indentedWarning = warning.replaceAll('\n', '\n    ');
      writeLine(chalk.yellowBright(`  ⚠ ${indentedWarning}`));
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
    // fs-extra uses graceful-fs, which in turn will enqueue open operations.
    // this slows us down an unnecessary amount. Avoiding this queueing means
    // we could potentially hit an EMFILE error, but we haven't seen that in
    // practice in years, so that's a risk we're willing to take. We explicitly
    // use the native Node fs API here to opt out of this queueing behavior.
    contents = await fs.readFile(absolutePath, 'utf8');
  } catch (err: any) {
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

    // The UUID is required in all files except infoCourse.json. Since this file
    // used to require a UUID, we allow it to be parsed without a warning. In
    // the future, once we're confident that most courses have removed the UUID
    // from infoCourse.json, we can add a warning for unnecessary UUIDs in that
    // file. Also, see https://github.com/PrairieLearn/PrairieLearn/issues/13709
    if (filePath !== 'infoCourse.json') {
      if (!json.uuid) {
        return infofile.makeError('UUID is missing');
      }
      if (!UUID_REGEX.test(json.uuid)) {
        return infofile.makeError(`UUID "${json.uuid}" is not a valid v4 UUID`);
      }
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
    } catch (err: any) {
      return infofile.makeError(err.message);
    }
  } catch {
    // Invalid JSON; let's reparse with jju to get a better error message
    // for the user.
    let result: InfoFile<T> = { errors: [], warnings: [] };
    try {
      // This should always throw
      jju.parse(contents, { mode: 'json' });
    } catch (e: any) {
      result = infofile.makeError(`Error parsing JSON: ${e.message}`);
    }

    if (filePath !== 'infoCourse.json') {
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
    }

    return result;
  }
}

async function loadCourseInfo({
  courseId,
  coursePath,
  assessmentSetsInUse,
  tagsInUse,
  sharingEnabled,
}: {
  courseId: string | null;
  coursePath: string;
  assessmentSetsInUse: Set<string>;
  tagsInUse: Set<string>;
  sharingEnabled: boolean;
}): Promise<InfoFile<CourseJson>> {
  const maybeNullLoadedData = await loadAndValidateJson({
    coursePath,
    filePath: 'infoCourse.json',
    schema: schemas.infoCourse,
    zodSchema: schemas.CourseJsonSchema,
    validate: () => ({ warnings: [], errors: [] }),
  });

  if (maybeNullLoadedData && infofile.hasErrors(maybeNullLoadedData)) {
    // We'll only have an error if we couldn't parse JSON data; abort
    return maybeNullLoadedData;
  }

  const info = maybeNullLoadedData?.data;
  if (!info) {
    throw new Error('Could not load infoCourse.json');
  }

  // Reassign to a non-null type.
  const loadedData = maybeNullLoadedData;

  if (config.checkSharingOnSync && !sharingEnabled && info.sharingSets) {
    infofile.addError(
      loadedData,
      '"sharingSets" cannot be used because sharing is not enabled for this course.',
    );
  }

  function getFieldWithoutDuplicates<
    K extends 'tags' | 'topics' | 'assessmentSets' | 'assessmentModules' | 'sharingSets',
  >(fieldName: K, defaults?: CourseJson[K]): CourseJson[K] {
    type Entry = NonNullable<CourseJson[K]>[number];
    const result = deduplicateByName<Entry>(
      (info![fieldName] ?? []) as Entry[],
      defaults as Entry[] | undefined,
    );

    if (result.duplicates.size > 0) {
      const duplicateIdsString = [...result.duplicates].map((name) => `"${name}"`).join(', ');
      infofile.addWarning(
        loadedData,
        `Found duplicates in '${fieldName}': ${duplicateIdsString}. Only the last of each duplicate will be synced.`,
      );
    }

    return result.entries as CourseJson[K];
  }

  // Assessment sets in DEFAULT_ASSESSMENT_SETS may be in use but not present in the
  // course info JSON file. This ensures that default assessment sets are added if
  // an assessment uses them, and removed if not.
  const defaultAssessmentSetsInUse = DEFAULT_ASSESSMENT_SETS.filter((set) =>
    assessmentSetsInUse.has(set.name),
  );

  const assessmentSets = getFieldWithoutDuplicates('assessmentSets', defaultAssessmentSetsInUse);

  // Tags in DEFAULT_TAGS may be in use but not present in the course info JSON
  // file. This ensures that default tags are added if a question uses them, and
  // removed if not.
  const defaultTagsInUse = DEFAULT_TAGS.filter((tag) => tagsInUse.has(tag.name));

  const tags = getFieldWithoutDuplicates('tags', defaultTagsInUse);
  const topics = getFieldWithoutDuplicates('topics');
  const sharingSets = getFieldWithoutDuplicates('sharingSets');

  const assessmentModules = getFieldWithoutDuplicates('assessmentModules');

  const devModeFeatures = run(() => {
    const features = info.options.devModeFeatures ?? {};

    // Support for legacy values, where features were an array of strings instead
    // of an object mapping feature names to booleans.
    if (Array.isArray(features)) {
      return Object.fromEntries(features.map((feature) => [feature, true]));
    }

    return features;
  });

  if (Object.keys(devModeFeatures).length > 0) {
    if (courseId == null) {
      if (!config.devMode) {
        infofile.addWarning(
          loadedData,
          `Loading course ${coursePath} without an ID, features cannot be validated.`,
        );
      }
    } else {
      const institution = await selectInstitutionForCourse({ course_id: courseId });

      for (const [feature, overrideEnabled] of Object.entries(devModeFeatures)) {
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
        if (overrideEnabled && !featureEnabled) {
          infofile.addWarning(
            loadedData,
            `Feature "${feature}" is enabled in devModeFeatures, but is actually disabled.`,
          );
        } else if (!overrideEnabled && featureEnabled) {
          infofile.addWarning(
            loadedData,
            `Feature "${feature}" is disabled in devModeFeatures, but is actually enabled.`,
          );
        }
      }
    }
  }

  const course = {
    path: coursePath,
    name: info.name,
    title: info.title,
    timezone: info.timezone,
    assessmentSets,
    assessmentModules,
    tags,
    topics,
    sharingSets,
    options: {
      devModeFeatures,
    },
    comment: info.comment,
  };

  loadedData.data = course;
  return loadedData;
}

async function loadAndValidateJson<T extends ZodSchema>({
  coursePath,
  filePath,
  schema,
  zodSchema,
  validate,
  tolerateMissing,
}: {
  coursePath: string;
  filePath: string;
  schema: any;
  zodSchema: T;
  /** Whether or not a missing file constitutes an error */
  tolerateMissing?: boolean;
  validate: (info: z.infer<T>, rawInfo: z.input<T>) => { warnings: string[]; errors: string[] };
}): Promise<InfoFile<z.infer<T>> | null> {
  const loadedJson: InfoFile<z.infer<T>> | null = await loadInfoFile({
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

  // If we didn't get any errors with the ajv schema, we will re-parse with Zod, which will fill in default values and let us
  // use the output type.
  const result = zodSchema.safeParse(loadedJson.data);
  if (!result.success) {
    infofile.addErrors(
      loadedJson,
      result.error.issues.map(
        (e) =>
          `code: ${e.code}, path: ${e.path.join('.')}, message: ${e.message}. Report this error to the PrairieLearn team, this should not happen.`,
      ),
    );
    Sentry.captureException(result.error);
    return loadedJson;
  }

  const validationResult = validate(result.data, loadedJson.data);
  infofile.addErrors(loadedJson, validationResult.errors);
  infofile.addWarnings(loadedJson, validationResult.warnings);

  loadedJson.data = result.data;

  return loadedJson;
}

/**
 * Loads and schema-validates all info files in a directory.
 */
async function loadInfoForDirectory<T extends ZodSchema>({
  coursePath,
  directory,
  infoFilename,
  schema,
  zodSchema,
  validate,
  recursive = false,
}: {
  /** The path of the course being synced */
  coursePath: string;
  /** The path of the directory relative to `coursePath` */
  directory: string;
  infoFilename: string;
  schema: any;
  zodSchema: T;
  /** A function that validates the info file and returns warnings and errors. It should not contact the database. */
  validate: (info: z.infer<T>, rawInfo: z.input<T>) => { warnings: string[]; errors: string[] };
  /** Whether or not info files should be searched for recursively */
  recursive?: boolean;
}): Promise<Record<string, InfoFile<z.infer<T>>>> {
  // Recursive lookup might not be enabled for some info types - if it's
  // disabled, we'll still utilize the same recursive function, but the
  // recursive function won't actually recurse.
  const infoFilesRootDir = path.join(coursePath, directory);
  const walk = async (relativeDir: string) => {
    const infoFiles: Record<string, InfoFile<T>> = {};
    const files = await fs.readdir(path.join(infoFilesRootDir, relativeDir));

    // For each file in the directory, assume it is a question directory
    // and attempt to access `info.json`. If we can successfully read it,
    // hooray, we're done.
    await async.each(files, async (dir: string) => {
      const infoFileDir = path.join(directory, relativeDir, dir);
      const infoFilePath = path.join(infoFileDir, infoFilename);
      const info = await loadAndValidateJson({
        coursePath,
        filePath: infoFilePath,
        schema,
        zodSchema,
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
          if (isEmptyObject(subInfoFiles)) {
            infoFiles[path.join(relativeDir, dir)] = infofile.makeError(
              `Missing JSON file: ${infoFilePath}. Either create the file or delete the ${infoFileDir} directory.`,
            );
          }
          Object.assign(infoFiles, subInfoFiles);
        } catch (e: any) {
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
  } catch (e: any) {
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

async function checkAuthorOriginCourses(questionInfos: Record<string, InfoFile<QuestionJson>>) {
  // First, create a map from origin courses to questions that reference them
  const originCourseIDs = Object.entries(questionInfos).reduce((map, [id, info]) => {
    if (!info.data?.authors) {
      // No authors -> skip
      return map;
    }
    for (const author of info.data.authors) {
      if (author.originCourse) {
        let originCourseRefs = map.get(author.originCourse);
        if (!originCourseRefs) {
          originCourseRefs = [];
          map.set(author.originCourse, originCourseRefs);
        }
        originCourseRefs.push(id);
      }
    }
    return map;
  }, new Map<string, string[]>());

  // Avoid unneeded database queries if no origin courses are set
  if (originCourseIDs.size === 0) return;

  // Then, look up all the course IDs at once and find unresolvable ones
  const originCourses = await findCoursesBySharingNames(Array.from(originCourseIDs.keys()));
  for (const [sharingName, course] of originCourses) {
    if (!course) {
      const affectedQuestions = originCourseIDs.get(sharingName) ?? [];
      affectedQuestions.forEach((question) => {
        infofile.addError(
          questionInfos[question],
          `The author origin course with the sharing name "${sharingName}" does not exist`,
        );
      });
    }
  }
}

/**
 * Checks that roles are not present.
 * @returns A list of warnings, if any
 */
function checkAllowAccessRoles(rule: { role?: string }): string[] {
  const warnings: string[] = [];
  if ('role' in rule && rule.role !== 'Student') {
    warnings.push(
      `The entire "allowAccess" rule with "role: ${rule.role}" should be deleted. Instead, course owners can now manage course staff access on the "Staff" page.`,
    );
  }
  return warnings;
}

/**
 * Returns whether or not an `allowAccess` rule date is valid. It's considered
 * valid if it matches the regexp used in the `input_date` sproc and if it can
 * parse into a JavaScript `Date` object. If the supplied date is considered
 * invalid, `null` is returned.
 */
function parseJsonDate(date: string): Date | null {
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
 * @returns A list of errors, if any, and whether it allows access in the future
 */
function checkAllowAccessDates(rule: { startDate?: string | null; endDate?: string | null }): {
  errors: string[];
  accessibleInFuture: boolean;
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
    startDate = parseJsonDate(rule.startDate);
    if (!startDate) {
      errors.push(`Invalid allowAccess rule: startDate (${rule.startDate}) is not valid`);
    }
  }
  if (rule.endDate) {
    endDate = parseJsonDate(rule.endDate);
    if (!endDate) {
      errors.push(`Invalid allowAccess rule: endDate (${rule.endDate}) is not valid`);
    }
  }
  if (startDate && endDate && isAfter(startDate, endDate)) {
    errors.push(
      `Invalid allowAccess rule: startDate (${rule.startDate}) must not be after endDate (${rule.endDate})`,
    );
  }
  return {
    errors,
    accessibleInFuture: !endDate || isFuture(endDate),
  };
}

/**
 * It seems to be relatively common for instructors to accidentally put multiple
 * UIDs in the same string, like "uid1@example.com, uid2@example.com". While we
 * are pretty loose in what we accept as UIDs, they should never contain commas or
 * whitespace, so we'll warn about that.
 */
function checkAllowAccessUids(rule: { uids?: string[] | null }): string[] {
  const warnings: string[] = [];

  const uidsWithWhitespace = (rule.uids ?? []).filter((uid) => /\s/.test(uid));
  if (uidsWithWhitespace.length > 0) {
    warnings.push(
      `The following access rule UIDs contain unexpected whitespace: ${formatValues(uidsWithWhitespace)}`,
    );
  }

  const uidsWithCommas = (rule.uids ?? []).filter((uid) => uid.includes(','));
  if (uidsWithCommas.length > 0) {
    warnings.push(
      `The following access rule UIDs contain unexpected commas: ${formatValues(uidsWithCommas)}`,
    );
  }

  return warnings;
}

function isValidORCID(orcid: string): boolean {
  // Drop any dashes
  const digits = orcid.replaceAll('-', '');

  // Sanity check that should not fail since the ORCID identifier format is baked into the JSON schema
  if (!/^\d{15}[\dX]$/.test(digits)) {
    return false;
  }

  // Calculate and verify checksum
  // (adapted from Java code provided here: https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier)
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number.parseInt(digits[i])) * 2;
  }

  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const checkDigit = result === 10 ? 'X' : String(result);

  return digits[15] === checkDigit;
}

function validateQuestion({
  question,
  sharingEnabled,
}: {
  question: QuestionJson;
  sharingEnabled: boolean;
}): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.checkSharingOnSync && !sharingEnabled) {
    if (question.sharingSets) {
      errors.push('"sharingSets" cannot be used because sharing is not enabled for this course');
    }

    if (question.sharePublicly) {
      errors.push('"sharePublicly" cannot be used because sharing is not enabled for this course');
    }

    if (question.shareSourcePublicly) {
      errors.push(
        '"shareSourcePublicly" cannot be used because sharing is not enabled for this course',
      );
    }
  }

  if (question.options) {
    try {
      const schema = schemas[`QuestionOptions${question.type}JsonSchema`];
      schema.parse(question.options);
    } catch (err: any) {
      errors.push(`Error validating question options: ${err.message}`);
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

  if (question.authors.length > 0) {
    for (const author of question.authors) {
      if (!author.email && !author.orcid && !author.originCourse) {
        errors.push(
          'At least one of "email", "orcid", or "originCourse" is required for each author',
        );
      }
      if (author.orcid) {
        if (!isValidORCID(author.orcid)) {
          errors.push(
            `The author ORCID identifier "${author.orcid}" has an invalid checksum. See the official website (https://orcid.org) for info on how to create or look up an identifier`,
          );
        }
      }
      if (author.email) {
        // Manual check here since using email() directly in the schema validation doesn't work well with error logging yet
        // See: https://github.com/PrairieLearn/PrairieLearn/issues/12846
        const parsedEmail = z.string().email().safeParse(author.email);

        if (!parsedEmail.success) {
          errors.push(`The author email address "${author.email}" is invalid`);
        }
      }
      // Origin courses are validated in bulk in loadQuestions(), and skipped here.
    }
  }

  return { warnings, errors };
}

/**
 * Formats a set or array of strings into a string for use in error messages.
 * @returns A comma-separated list of double-quoted values.
 */
function formatValues(qids: Set<string> | string[]) {
  return Array.from(qids)
    .map((qid) => `"${qid}"`)
    .join(', ');
}

/**
 * Converts legacy group properties to the new groups format for unified handling.
 */
export function convertLegacyGroupsToGroupsConfig(assessment: AssessmentJson): GroupsJson {
  const canAssignRoles = assessment.groupRoles
    .filter((role) => role.canAssignRoles)
    .map((role) => role.name);

  return {
    enabled: assessment.groupWork,
    minMembers: assessment.groupMinSize,
    maxMembers: assessment.groupMaxSize,
    roles: assessment.groupRoles.map((role) => ({
      name: role.name,
      minMembers: role.minimum,
      maxMembers: role.maximum,
    })),
    studentPermissions: {
      canCreateGroup: assessment.studentGroupCreate,
      canJoinGroup: assessment.studentGroupJoin,
      canLeaveGroup: assessment.studentGroupLeave,
      canNameGroup: assessment.studentGroupChooseName,
    },
    rolePermissions: {
      canAssignRoles,
      canView: assessment.canView,
      canSubmit: assessment.canSubmit,
    },
  };
}

function validateAssessment({
  assessment,
  rawAssessment,
  questions,
  sharingEnabled,
  courseInstanceExpired,
}: {
  assessment: AssessmentJson;
  rawAssessment: AssessmentJsonInput;
  questions: Record<string, InfoFile<QuestionJson>>;
  sharingEnabled: boolean;
  courseInstanceExpired: boolean;
}): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.checkSharingOnSync && !sharingEnabled && assessment.shareSourcePublicly) {
    errors.push(
      '"shareSourcePublicly" cannot be used because sharing is not enabled for this course',
    );
  }

  // Check for conflict between legacy group properties and new groups schema
  if (assessment.groups != null) {
    const usedLegacyProps: string[] = [];

    // We need to use `rawAssessment` here to check if the user specified any
    // legacy properties in their JSON. `assessment` has already had default values
    // filled in by Zod.
    for (const prop of [
      'groupWork',
      'groupMaxSize',
      'groupMinSize',
      'groupRoles',
      'canView',
      'canSubmit',
      'studentGroupCreate',
      'studentGroupJoin',
      'studentGroupLeave',
      'studentGroupChooseName',
    ]) {
      if (prop in rawAssessment) {
        usedLegacyProps.push(prop);
      }
    }

    if (usedLegacyProps.length > 0) {
      const stringifiedProps = usedLegacyProps.map((p) => `"${p}"`).join(', ');
      errors.push(
        `Cannot use both "groups" and legacy group properties (${stringifiedProps}) in the same assessment.`,
      );
    }
  }

  const allowRealTimeGrading = assessment.allowRealTimeGrading ?? true;
  if (assessment.type === 'Homework') {
    // Because of how Homework-type assessments work, we don't allow
    // real-time grading to be disabled for them.
    const anyRealTimeGradingDisabled = run(() => {
      if (assessment.allowRealTimeGrading === false) return true;
      return assessment.zones.some((zone) => {
        if (zone.allowRealTimeGrading === false) return true;
        return zone.questions.some((question) => {
          if (question.allowRealTimeGrading === false) return true;
          return question.alternatives?.some((alternative) => {
            return alternative.allowRealTimeGrading === false;
          });
        });
      });
    });

    if (anyRealTimeGradingDisabled) {
      errors.push('Real-time grading cannot be disabled for Homework-type assessments');
    }

    // Homework-type assessments with multiple instances are not supported
    if (assessment.multipleInstance) {
      errors.push('"multipleInstance" cannot be true for Homework-type assessments');
    }

    if (assessment.requireHonorCode) {
      errors.push('"requireHonorCode" cannot be true for Homework-type assessments');
    }

    if (assessment.honorCode != null) {
      errors.push('"honorCode" cannot be used for Homework-type assessments');
    }
  }

  // Check assessment access rules.
  assessment.allowAccess.forEach((rule) => {
    const dateErrors = checkAllowAccessDates(rule);

    if ('active' in rule && rule.active === false && 'credit' in rule && rule.credit !== 0) {
      errors.push('Invalid allowAccess rule: credit must be 0 if active is false');
    }

    errors.push(...dateErrors.errors);
  });

  // We don't want to warn for past course instances that instructors will
  // never touch again, as they won't benefit from fixing things. We'll
  // only show certain warnings for course instances which are accessible
  // either now or any time in the future.
  if (!courseInstanceExpired) {
    assessment.allowAccess.forEach((rule) => {
      warnings.push(...checkAllowAccessRoles(rule), ...checkAllowAccessUids(rule));

      if (rule.examUuid && rule.mode === 'Public') {
        warnings.push('Invalid allowAccess rule: examUuid cannot be used with "mode": "Public"');
      }
    });
  }

  const foundQids = new Set<string>();
  const duplicateQids = new Set<string>();
  const missingQids = new Set<string>();
  const draftQids = new Set<string>();
  const checkAndRecordQid = (qid: string): void => {
    if (qid.startsWith('@')) {
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

    if (isDraftQid(qid)) {
      draftQids.add(qid);
    }
  };
  assessment.zones.forEach((zone) => {
    zone.questions.map((zoneQuestion) => {
      const effectiveAlternativeGroupAllowRealTimeGrading =
        zoneQuestion.allowRealTimeGrading ?? zone.allowRealTimeGrading ?? allowRealTimeGrading;

      // We'll normalize either single questions or alternative groups
      // to make validation easier
      let alternatives: (QuestionPointsJson & { allowRealTimeGrading: boolean })[] = [];
      if (zoneQuestion.alternatives && zoneQuestion.id) {
        errors.push('Cannot specify both "alternatives" and "id" in one question');
      } else if (zoneQuestion.alternatives) {
        zoneQuestion.alternatives.forEach((alternative) => checkAndRecordQid(alternative.id));
        alternatives = zoneQuestion.alternatives.map((alternative) => {
          return {
            points: alternative.points ?? zoneQuestion.points,
            maxPoints: alternative.maxPoints ?? zoneQuestion.maxPoints,
            maxAutoPoints: alternative.maxAutoPoints ?? zoneQuestion.maxAutoPoints,
            autoPoints: alternative.autoPoints ?? zoneQuestion.autoPoints,
            manualPoints: alternative.manualPoints ?? zoneQuestion.manualPoints,
            allowRealTimeGrading:
              alternative.allowRealTimeGrading ?? effectiveAlternativeGroupAllowRealTimeGrading,
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
            allowRealTimeGrading: effectiveAlternativeGroupAllowRealTimeGrading,
          },
        ];
      } else {
        errors.push('Zone question must specify either "alternatives" or "id"');
      }

      alternatives.forEach((alternative) => {
        if (
          !alternative.allowRealTimeGrading &&
          ((Array.isArray(alternative.autoPoints) && alternative.autoPoints.length > 1) ||
            (Array.isArray(alternative.points) && alternative.points.length > 1))
        ) {
          errors.push(
            'Cannot specify an array of multiple point values if real-time grading is disabled',
          );
        }

        if (
          alternative.points == null &&
          alternative.autoPoints == null &&
          alternative.manualPoints == null
        ) {
          errors.push('Must specify "points", "autoPoints" or "manualPoints" for a question');
        }
        if (
          alternative.points != null &&
          (alternative.autoPoints != null ||
            alternative.manualPoints != null ||
            alternative.maxAutoPoints != null)
        ) {
          errors.push(
            'Cannot specify "points" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified',
          );
        }
        if (assessment.type === 'Exam') {
          if (alternative.maxPoints != null || alternative.maxAutoPoints != null) {
            errors.push(
              'Cannot specify "maxPoints" or "maxAutoPoints" for a question in an "Exam" assessment',
            );
          }

          const hasSplitPoints =
            alternative.autoPoints != null ||
            alternative.maxAutoPoints != null ||
            alternative.manualPoints != null;
          const autoPoints = (hasSplitPoints ? alternative.autoPoints : alternative.points)!;
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
            alternative.maxPoints != null &&
            (alternative.autoPoints != null ||
              alternative.manualPoints != null ||
              alternative.maxAutoPoints != null)
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

          if (!courseInstanceExpired) {
            if (
              alternative.points === 0 &&
              alternative.maxPoints != null &&
              alternative.maxPoints > 0
            ) {
              errors.push('Cannot specify "points": 0 when "maxPoints" > 0');
            }

            if (
              alternative.autoPoints === 0 &&
              alternative.maxAutoPoints != null &&
              alternative.maxAutoPoints > 0
            ) {
              errors.push('Cannot specify "autoPoints": 0 when "maxAutoPoints" > 0');
            }
          }
        }
      });
    });
  });

  if (duplicateQids.size > 0) {
    errors.push(`The following questions are used more than once: ${formatValues(duplicateQids)}`);
  }

  if (missingQids.size > 0) {
    errors.push(
      `The following questions do not exist in this course: ${formatValues(missingQids)}`,
    );
  }

  if (draftQids.size > 0) {
    errors.push(
      `The following questions are marked as draft and therefore cannot be used in assessments: ${formatValues(draftQids)}`,
    );
  }

  // Convert legacy group properties to groups format for unified validation
  const isLegacyGroups = assessment.groups == null;
  const groups = assessment.groups ?? convertLegacyGroupsToGroupsConfig(assessment);

  // Validate groups if we have roles defined
  if (groups.roles.length > 0) {
    const rolePerms = groups.rolePermissions;

    const canAssignRolesSet = new Set(rolePerms.canAssignRoles);
    const hasAssigner = groups.roles.some(
      (role) => canAssignRolesSet.has(role.name) && role.minMembers >= 1,
    );
    if (!hasAssigner) {
      errors.push('Could not find a role with minMembers >= 1 that can assign roles.');
    }

    const validRoleNames = new Set(groups.roles.map((r) => r.name));

    rolePerms.canAssignRoles.forEach((roleName) => {
      if (!validRoleNames.has(roleName)) {
        errors.push(
          `${isLegacyGroups ? '"canAssignRoles"' : 'The "groups.rolePermissions.canAssignRoles" permission'} contains non-existent role "${roleName}".`,
        );
      }
    });

    rolePerms.canView.forEach((roleName) => {
      if (!validRoleNames.has(roleName)) {
        errors.push(
          `${isLegacyGroups ? 'The assessment\'s "canView"' : 'The "groups.rolePermissions.canView"'} permission contains non-existent role "${roleName}".`,
        );
      }
    });

    rolePerms.canSubmit.forEach((roleName) => {
      if (!validRoleNames.has(roleName)) {
        errors.push(
          `${isLegacyGroups ? 'The assessment\'s "canSubmit"' : 'The "groups.rolePermissions.canSubmit"'} permission contains non-existent role "${roleName}".`,
        );
      }
    });

    groups.roles.forEach((role) => {
      if (groups.minMembers != null && role.minMembers > groups.minMembers) {
        warnings.push(`Role "${role.name}" has a minMembers greater than the group's minMembers.`);
      }
      if (groups.maxMembers != null && role.minMembers > groups.maxMembers) {
        errors.push(
          `Role "${role.name}" contains an invalid minMembers. (Expected at most ${groups.maxMembers}, found ${role.minMembers}).`,
        );
      }
      if (
        role.maxMembers != null &&
        groups.maxMembers != null &&
        role.maxMembers > groups.maxMembers
      ) {
        errors.push(
          `Role "${role.name}" contains an invalid maxMembers. (Expected at most ${groups.maxMembers}, found ${role.maxMembers}).`,
        );
      }
      if (role.maxMembers != null && role.minMembers > role.maxMembers) {
        errors.push(
          `Role "${role.name}" must have minMembers <= maxMembers. (Expected minMembers <= ${role.maxMembers}, found minMembers = ${role.minMembers}).`,
        );
      }
    });

    const validateViewAndSubmitRolePermissions = (
      canView: string[],
      canSubmit: string[],
      area: 'zone' | 'zone question',
    ): void => {
      canView.forEach((roleName) => {
        if (!validRoleNames.has(roleName)) {
          errors.push(
            `The ${area}'s "canView" permission contains non-existent role "${roleName}".`,
          );
        }
      });

      canSubmit.forEach((roleName) => {
        if (!validRoleNames.has(roleName)) {
          errors.push(
            `The ${area}'s "canSubmit" permission contains non-existent role "${roleName}".`,
          );
        }
      });
    };

    // Validate role names for each zone and question
    assessment.zones.forEach((zone) => {
      validateViewAndSubmitRolePermissions(zone.canView, zone.canSubmit, 'zone');
      zone.questions.forEach((zoneQuestion) => {
        validateViewAndSubmitRolePermissions(
          zoneQuestion.canView,
          zoneQuestion.canSubmit,
          'zone question',
        );
      });
    });
  }

  if (assessment.zones[0]?.lockpoint) {
    errors.push('The first zone cannot have lockpoint: true');
  }

  assessment.zones.forEach((zone) => {
    // A lockpoint zone with no questions would create a pointless barrier -
    // the student would have to cross a lockpoint with nothing to work on
    // in the zone, which is almost certainly a configuration mistake.
    if (zone.lockpoint && zone.numberChoose === 0) {
      errors.push('A lockpoint zone must include at least one selectable question');
    }
  });

  return { warnings, errors };
}

function validateCourseInstance({
  courseInstance,
  sharingEnabled,
}: {
  courseInstance: CourseInstanceJson;
  sharingEnabled: boolean;
}): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.checkSharingOnSync && !sharingEnabled && courseInstance.shareSourcePublicly) {
    errors.push(
      '"shareSourcePublicly" cannot be used because sharing is not enabled for this course instance',
    );
  }

  if ('allowIssueReporting' in courseInstance) {
    if (courseInstance.allowIssueReporting) {
      warnings.push('"allowIssueReporting" is no longer needed.');
    } else {
      errors.push(
        '"allowIssueReporting" is no longer permitted in "infoCourseInstance.json". Instead, set "allowIssueReporting" in "infoAssessment.json" files.',
      );
    }
  }

  if (courseInstance.selfEnrollment.enabled !== true && courseInstance.allowAccess != null) {
    errors.push(
      '"selfEnrollment.enabled" is not configurable when you have access control rules ("allowAccess" is set).',
    );
  }

  if (courseInstance.selfEnrollment.beforeDate != null) {
    if (courseInstance.allowAccess != null) {
      errors.push(
        '"selfEnrollment.beforeDate" is not configurable when you have access control rules ("allowAccess" is set).',
      );
    }
    const date = parseJsonDate(courseInstance.selfEnrollment.beforeDate);
    if (date == null) {
      errors.push('"selfEnrollment.beforeDate" is not a valid date.');
    }
  }

  let parsedEndDate: Date | null = null;

  if (courseInstance.allowAccess && courseInstance.publishing) {
    errors.push('Cannot use both "allowAccess" and "publishing" in the same course instance.');
  } else if (courseInstance.publishing) {
    const hasEndDate = courseInstance.publishing.endDate != null;
    const hasStartDate = courseInstance.publishing.startDate != null;
    if (hasStartDate && !hasEndDate) {
      errors.push('"publishing.endDate" is required if "publishing.startDate" is specified.');
    }
    if (!hasStartDate && hasEndDate) {
      errors.push('"publishing.startDate" is required if "publishing.endDate" is specified.');
    }

    const parsedStartDate =
      courseInstance.publishing.startDate == null
        ? null
        : parseJsonDate(courseInstance.publishing.startDate);

    if (hasStartDate && parsedStartDate == null) {
      errors.push('"publishing.startDate" is not a valid date.');
    }

    parsedEndDate =
      courseInstance.publishing.endDate == null
        ? null
        : parseJsonDate(courseInstance.publishing.endDate);

    if (hasEndDate && parsedEndDate == null) {
      errors.push('"publishing.endDate" is not a valid date.');
    }

    if (
      hasStartDate &&
      hasEndDate &&
      parsedStartDate != null &&
      parsedEndDate != null &&
      isAfter(parsedStartDate, parsedEndDate)
    ) {
      errors.push('"publishing.startDate" must be before "publishing.endDate".');
    }
  }

  // Default to the publishing end date being in the future.
  let accessibleInFuture = parsedEndDate != null && isFuture(parsedEndDate);
  for (const rule of courseInstance.allowAccess ?? []) {
    const allowAccessResult = checkAllowAccessDates(rule);
    if (allowAccessResult.accessibleInFuture) {
      accessibleInFuture = true;
    }

    errors.push(...allowAccessResult.errors);
  }

  if (accessibleInFuture) {
    // Only warn about new roles and invalid UIDs for current or future course instances.
    courseInstance.allowAccess?.forEach((rule) => {
      warnings.push(...checkAllowAccessRoles(rule), ...checkAllowAccessUids(rule));
    });

    if ('userRoles' in courseInstance) {
      warnings.push(
        'The property "userRoles" should be deleted. Instead, course owners can now manage staff access on the "Staff" page.',
      );
    }

    // `shortName` has never been a meaningful property in course instance config.
    // However, for many years our template course erroneously included it in the
    // template course instance, so it's been copied around to basically every course.
    // We didn't set `additionalProperties: false` in the schema, so we never caught
    // this and for a long time it was silently ignored.
    //
    // To avoid breaking existing courses, we added it as a valid property to the schema,
    // but we'll warn about it for any active or future course instances.
    if (courseInstance.shortName) {
      warnings.push('The property "shortName" is not used and should be deleted.');
    }

    // As of January 2026, the enrollment page has been removed from PrairieLearn.
    // We'll warn about this property for course instances that are active in the future.
    if (courseInstance.hideInEnrollPage != null) {
      warnings.push(
        '"hideInEnrollPage" should be deleted as the enrollment page has been removed.',
      );
    }
  }

  if (courseInstance.studentLabels) {
    const result = deduplicateByName(courseInstance.studentLabels);
    if (result.duplicates.size > 0) {
      const duplicateNamesString = [...result.duplicates].map((name) => `"${name}"`).join(', ');
      warnings.push(
        `Found duplicates in 'studentLabels': ${duplicateNamesString}. Only the last of each duplicate will be synced.`,
      );
      courseInstance.studentLabels = result.entries;
    }

    const uuidCounts = new Map<string, string[]>();
    for (const label of courseInstance.studentLabels) {
      const names = uuidCounts.get(label.uuid);
      if (names) {
        names.push(label.name);
      } else {
        uuidCounts.set(label.uuid, [label.name]);
      }
    }
    for (const [uuid, names] of uuidCounts) {
      if (names.length > 1) {
        errors.push(
          `Found duplicate UUID "${uuid}" in 'studentLabels' for labels: ${names.map((n) => `"${n}"`).join(', ')}.`,
        );
      }
    }
  }

  return { warnings, errors };
}

/**
 * Loads all questions in a course directory.
 */
export async function loadQuestions({
  coursePath,
  sharingEnabled,
}: {
  coursePath: string;
  sharingEnabled: boolean;
}): Promise<Record<string, InfoFile<QuestionJson>>> {
  const questions = await loadInfoForDirectory({
    coursePath,
    directory: 'questions',
    infoFilename: 'info.json',
    zodSchema: schemas.QuestionJsonSchema,
    schema: schemas.infoQuestion,
    validate: (question: QuestionJson) => validateQuestion({ question, sharingEnabled }),
    recursive: true,
  });
  // Don't allow question directories to start with '@', because it is
  // used to import questions from other courses.
  for (const qid in questions) {
    if (qid.startsWith('@')) {
      infofile.addError(questions[qid], "Question IDs are not allowed to begin with '@'");
    }
  }
  await checkAuthorOriginCourses(questions);
  checkDuplicateUUIDs(
    questions,
    (uuid, ids) => `UUID "${uuid}" is used in other questions: ${ids.join(', ')}`,
  );

  return questions;
}

/**
 * Loads all course instances in a course directory.
 */
async function loadCourseInstances({
  coursePath,
  sharingEnabled,
}: {
  coursePath: string;
  sharingEnabled: boolean;
}): Promise<Record<string, InfoFile<CourseInstanceJson>>> {
  const courseInstances = await loadInfoForDirectory({
    coursePath,
    directory: 'courseInstances',
    infoFilename: 'infoCourseInstance.json',
    schema: schemas.infoCourseInstance,
    zodSchema: schemas.CourseInstanceJsonSchema,
    validate: (courseInstance: CourseInstanceJson) =>
      validateCourseInstance({ courseInstance, sharingEnabled }),
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
async function loadAssessments({
  coursePath,
  courseInstanceDirectory,
  courseInstanceExpired,
  questions,
  sharingEnabled,
}: {
  coursePath: string;
  courseInstanceDirectory: string;
  courseInstanceExpired: boolean;
  questions: Record<string, InfoFile<QuestionJson>>;
  sharingEnabled: boolean;
}): Promise<Record<string, InfoFile<AssessmentJson>>> {
  const assessmentsPath = path.join('courseInstances', courseInstanceDirectory, 'assessments');
  const assessments = await loadInfoForDirectory({
    coursePath,
    directory: assessmentsPath,
    infoFilename: 'infoAssessment.json',
    schema: schemas.infoAssessment,
    zodSchema: schemas.AssessmentJsonSchema,
    validate: (assessment: AssessmentJson, rawAssessment: AssessmentJsonInput) =>
      validateAssessment({
        assessment,
        rawAssessment,
        questions,
        sharingEnabled,
        courseInstanceExpired,
      }),
    recursive: true,
  });
  checkDuplicateUUIDs(
    assessments,
    (uuid, ids) =>
      `UUID "${uuid}" is used in other assessments in this course instance: ${ids.join(', ')}`,
  );
  return assessments;
}
