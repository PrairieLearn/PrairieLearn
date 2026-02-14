import assert from 'assert';
import * as child_process from 'child_process';
import * as path from 'path';
import { PassThrough as PassThroughStream } from 'stream';
import * as util from 'util';

import { S3 } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as async from 'async';
import fs from 'fs-extra';
import * as tar from 'tar';
import z from 'zod';

import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { getLockNameForCoursePath } from '../models/course.js';
import * as courseDB from '../sync/course-db.js';
import { type CourseData } from '../sync/course-db.js';

import { downloadFromS3, makeS3ClientConfig } from './aws.js';
import { chalk } from './chalk.js';
import { config } from './config.js';
import {
  AssessmentSchema,
  ChunkSchema,
  CourseInstanceSchema,
  CourseSchema,
  QuestionSchema,
} from './db-types.js';
import { DefaultMap } from './default-map.js';
import { type ServerJob, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface ElementsChunkMetadata {
  type: 'elements';
}

interface ElementExtensionsChunkMetadata {
  type: 'elementExtensions';
}

interface ClientFilesCourseChunkMetadata {
  type: 'clientFilesCourse';
}

interface ServerFilesCourseChunkMetadata {
  type: 'serverFilesCourse';
}

interface ClientFilesCourseInstanceChunkMetadata {
  type: 'clientFilesCourseInstance';
  courseInstanceName: string;
}

interface ClientFilesAssessmentChunkMetadata {
  type: 'clientFilesAssessment';
  courseInstanceName: string;
  assessmentName: string;
}

interface QuestionChunkMetadata {
  type: 'question';
  questionName: string;
}

/**
 * {@link ChunkMetadata} objects are used to refer to chunks according to their
 * human-readable names. For instance, a question chunk has a `questionName` property
 * that corresponds to a QID, not a `questionId` property that corresponds to a
 * database identifier.
 *
 * For chunks that are identified by database IDs instead, see {@link Chunk}.
 *
 */
type ChunkMetadata =
  | ElementsChunkMetadata
  | ElementExtensionsChunkMetadata
  | ClientFilesCourseChunkMetadata
  | ServerFilesCourseChunkMetadata
  | ClientFilesCourseInstanceChunkMetadata
  | ClientFilesAssessmentChunkMetadata
  | QuestionChunkMetadata;

interface ElementsChunk {
  type: 'elements';
}

interface ElementExtensionsChunk {
  type: 'elementExtensions';
}

interface ClientFilesCourseChunk {
  type: 'clientFilesCourse';
}

interface ServerFilesCourseChunk {
  type: 'serverFilesCourse';
}

interface ClientFilesCourseInstanceChunk {
  type: 'clientFilesCourseInstance';
  courseInstanceId: string;
}

interface ClientFilesAssessmentChunk {
  type: 'clientFilesAssessment';
  courseInstanceId: string;
  assessmentId: string;
}

export interface QuestionChunk {
  type: 'question';
  questionId: string;
}

/**
 * {@link Chunk} objects are used to identify chunks by the IDs of their
 * corresponding entities. For instance, a question chunk has a `questionId`
 * property that corresponds to `questions.id` in the database.
 *
 * For chunks that are identified by human-readable names instead, see
 * {@link ChunkMetadata}.
 *
 */
export type Chunk =
  | ElementsChunk
  | ElementExtensionsChunk
  | ClientFilesCourseChunk
  | ServerFilesCourseChunk
  | ClientFilesCourseInstanceChunk
  | ClientFilesAssessmentChunk
  | QuestionChunk;

const DatabaseChunkSchema = z.intersection(
  z.object({
    id: ChunkSchema.shape.id.nullable(),
    uuid: ChunkSchema.shape.uuid.nullable(),
  }),
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('elements'),
    }),
    z.object({
      type: z.literal('elementExtensions'),
    }),
    z.object({
      type: z.literal('clientFilesCourse'),
    }),
    z.object({
      type: z.literal('serverFilesCourse'),
    }),
    z.object({
      type: z.literal('clientFilesCourseInstance'),
      course_instance_id: IdSchema.nullable(),
      course_instance_name: z.string(),
    }),
    z.object({
      type: z.literal('clientFilesAssessment'),
      assessment_id: IdSchema.nullable(),
      assessment_name: z.string(),
      course_instance_id: IdSchema.nullable(),
      course_instance_name: z.string(),
    }),
    z.object({
      type: z.literal('question'),
      question_id: IdSchema.nullable(),
      question_name: z.string(),
    }),
  ]),
);

/**
 * {@link DatabaseChunk} objects represent chunks that we've fetched from the
 * database. They're sort of a superset of {@link Chunk} and {@link ChunkMetadata}
 * objects that contain both the IDs and human-readable names of the chunks.
 */
type DatabaseChunk = z.infer<typeof DatabaseChunkSchema>;

const RawCourseChunkSchema = z.object({
  ...ChunkSchema.shape,
  question_uuid: QuestionSchema.shape.uuid,
  question_name: QuestionSchema.shape.qid,
  assessment_uuid: AssessmentSchema.shape.uuid,
  assessment_name: AssessmentSchema.shape.tid,
  course_instance_uuid: CourseInstanceSchema.shape.uuid,
  course_instance_name: CourseInstanceSchema.shape.short_name,
});

interface CourseInstanceChunks {
  clientFilesCourseInstance: boolean;
  assessments: Set<string>;
}

interface CourseChunks {
  elements: boolean;
  elementExtensions: boolean;
  clientFilesCourse: boolean;
  serverFilesCourse: boolean;
  questions: Set<string>;
  courseInstances: DefaultMap<string, CourseInstanceChunks>;
}

/**
 * Constructs a {@link ChunkMetadata} object from the given {@link DatabaseChunk}
 * object.
 */
function chunkMetadataFromDatabaseChunk(chunk: DatabaseChunk): ChunkMetadata {
  switch (chunk.type) {
    case 'elements':
    case 'elementExtensions':
    case 'clientFilesCourse':
    case 'serverFilesCourse':
      return {
        type: chunk.type,
      };
    case 'clientFilesCourseInstance':
      if (!chunk.course_instance_name) {
        throw new Error(`course_instance_name is missing for chunk ${chunk.uuid}`);
      }
      return {
        type: chunk.type,
        courseInstanceName: chunk.course_instance_name,
      };
    case 'clientFilesAssessment':
      if (!chunk.course_instance_name) {
        throw new Error(`course_instance_name is missing for chunk ${chunk.uuid}`);
      }
      if (!chunk.assessment_name) {
        throw new Error(`assessment_name is missing for chunk ${chunk.uuid}`);
      }
      return {
        type: chunk.type,
        courseInstanceName: chunk.course_instance_name,
        assessmentName: chunk.assessment_name,
      };
    case 'question':
      if (!chunk.question_name) {
        throw new Error(`question_name is missing for chunk ${chunk.uuid}`);
      }
      return {
        type: chunk.type,
        questionName: chunk.question_name,
      };
  }
}

/**
 * Returns the path for a given chunk relative to the course's root directory.
 */
function pathForChunk(chunkMetadata: ChunkMetadata): string {
  switch (chunkMetadata.type) {
    case 'elements':
    case 'elementExtensions':
    case 'clientFilesCourse':
    case 'serverFilesCourse':
      return chunkMetadata.type;
    case 'question':
      return path.join('questions', chunkMetadata.questionName);
    case 'clientFilesCourseInstance':
      return path.join(
        'courseInstances',
        chunkMetadata.courseInstanceName,
        'clientFilesCourseInstance',
      );
    case 'clientFilesAssessment':
      return path.join(
        'courseInstances',
        chunkMetadata.courseInstanceName,
        'assessments',
        chunkMetadata.assessmentName,
        'clientFilesAssessment',
      );
  }
}

/**
 * Returns the absolute path for a course's chunk within the course's runtime
 * directory.
 */
export function coursePathForChunk(coursePath: string, chunkMetadata: ChunkMetadata): string {
  return path.join(coursePath, pathForChunk(chunkMetadata));
}

/**
 * Identifies the files that changes between two commits in a given course.
 *
 * @param coursePath The course directory to diff
 * @param oldHash The old (previous) hash for the diff
 * @param newHash The new (current) hash for the diff
 * @returns List of changed files
 */
async function identifyChangedFiles(
  coursePath: string,
  oldHash: string,
  newHash: string,
): Promise<string[]> {
  // In some specific scenarios, the course directory and the root of the course
  // repository might be different. For example, the example course is usually
  // manually cloned in production environments, and then the course is added
  // with the path set to the absolute path of the repo _plus_ `exampleCourse/`.
  //
  // In these cases, we need to make sure that the paths we're returning from
  // this function are relative to the course directory, not the root of the
  // repository. To do this, we query git itself for the root of the repository,
  // construct an absolute path for each file, and then trim off the course path.
  const { stdout: topLevelStdout } = await util.promisify(child_process.exec)(
    'git rev-parse --show-toplevel',
    { cwd: coursePath },
  );
  const topLevel = topLevelStdout.trim();

  const { stdout: diffStdout } = await util.promisify(child_process.exec)(
    `git diff --name-only ${oldHash}..${newHash}`,
    {
      cwd: coursePath,
      // This defaults to 1MB of output, however, we've observed in the past that
      // courses will go long periods of time without syncing, which in turn will
      // result in a large number of changed files. The largest diff we've seen
      // is 1.6MB of text; this new value was chosen to give us plenty of
      // headroom.
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const changedFiles = diffStdout.trim().split('\n');

  // Construct absolute path to all changed files.
  const absoluteChangedFiles = changedFiles.map((changedFile) => path.join(topLevel, changedFile));

  // Exclude any changed files that aren't in the course directory.
  const courseChangedFiles = absoluteChangedFiles.filter((absoluteChangedFile) =>
    contains(coursePath, absoluteChangedFile),
  );

  // Convert all absolute paths back into relative paths.
  return courseChangedFiles.map((absoluteChangedFile) =>
    path.relative(coursePath, absoluteChangedFile),
  );
}

/**
 * Given a list of files that have changed (such as that produced by
 * `git diff --name-only`), returns a data structure describing the chunks
 * that need to be generated.
 *
 * @param changedFiles A list of files that changed in a given sync.
 * @param courseData The "full course" that was loaded from disk.
 */
export function identifyChunksFromChangedFiles(
  changedFiles: string[],
  courseData: CourseData,
): CourseChunks {
  const courseChunks: CourseChunks = {
    elements: false,
    elementExtensions: false,
    clientFilesCourse: false,
    serverFilesCourse: false,
    courseInstances: new DefaultMap(() => ({
      assessments: new Set(),
      clientFilesCourseInstance: false,
    })),
    questions: new Set(),
  };

  changedFiles.forEach((changedFile) => {
    if (changedFile.startsWith('elements/')) {
      courseChunks.elements = true;
    }
    if (changedFile.startsWith('elementExtensions/')) {
      courseChunks.elementExtensions = true;
    }
    if (changedFile.startsWith('serverFilesCourse/')) {
      courseChunks.serverFilesCourse = true;
    }
    if (changedFile.startsWith('clientFilesCourse/')) {
      courseChunks.clientFilesCourse = true;
    }
    if (changedFile.startsWith('questions/')) {
      // Here's where things get interesting. Questions can be nested in
      // directories, so we need to figure out which of the potentially
      // deeply-nested directories is the root of a particular question.
      const pathComponents = changedFile.split(path.sep).slice(1);
      // Progressively join more and more path components until we get
      // something that corresponds to an actual question
      let questionId: string | null = null;
      for (let i = 1; i < pathComponents.length; i++) {
        const candidateQuestionId = path.join(...pathComponents.slice(0, i));
        if (candidateQuestionId in courseData.questions) {
          questionId = candidateQuestionId;
          break;
        }
      }
      if (questionId) {
        // This chunk corresponds to a question!
        courseChunks.questions.add(questionId);
      }
    }
    if (changedFile.startsWith('courseInstances/')) {
      // This could be one of two things: `clientFilesCourseInstance` or
      // `clientFileAssessment`.

      const pathComponents = changedFile.split(path.sep).slice(1);

      const clientFilesCourseInstanceIndex = pathComponents.indexOf('clientFilesCourseInstance');
      const assessmentsIndex = pathComponents.indexOf('assessments');
      const clientFilesAssessmentIndex = pathComponents.indexOf('clientFilesAssessment');

      if (clientFilesCourseInstanceIndex !== -1) {
        // Let's validate that the preceding path components correspond
        // to an actual course instance
        const courseInstanceId = path.join(
          ...pathComponents.slice(0, clientFilesCourseInstanceIndex),
        );
        if (courseInstanceId in courseData.courseInstances) {
          courseChunks.courseInstances.getOrCreate(courseInstanceId).clientFilesCourseInstance =
            true;
          return;
        }
      }

      // Important: fall through to account for weird things like people putting
      // `clientFilesCourseInstance` directories inside of `clientFileAssessment`
      // for some strange reason.
      if (
        assessmentsIndex !== -1 &&
        clientFilesAssessmentIndex !== -1 &&
        clientFilesAssessmentIndex > assessmentsIndex
      ) {
        // We probably care about this file - let's validate that by
        // splitting up the path into chunks that hopefully correspond
        // to course instance IDs and assessment IDs.
        const courseInstanceId = path.join(...pathComponents.slice(0, assessmentsIndex));
        const assessmentId = path.join(
          ...pathComponents.slice(assessmentsIndex + 1, clientFilesAssessmentIndex),
        );

        if (
          courseInstanceId in courseData.courseInstances &&
          assessmentId in courseData.courseInstances[courseInstanceId].assessments
        ) {
          courseChunks.courseInstances.getOrCreate(courseInstanceId).assessments.add(assessmentId);
        }
      }
    }
  });

  return courseChunks;
}

/**
 * Returns all the chunks the are currently stored for the given course.
 */
async function getAllChunksForCourse(courseId: string) {
  const result = await sqldb.queryRows(
    sql.select_course_chunks,
    { course_id: courseId },
    RawCourseChunkSchema,
  );
  return result;
}

interface DiffChunksOptions {
  coursePath: string;
  courseId: string;
  courseData: CourseData;
  changedFiles: string[];
}

interface ChunksDiff {
  updatedChunks: ChunkMetadata[];
  deletedChunks: ChunkMetadata[];
}

/**
 * Given a course ID, computes a list of all chunks that need to be
 * (re)generated.
 */
async function diffChunks({
  coursePath,
  courseId,
  courseData,
  changedFiles,
}: DiffChunksOptions): Promise<ChunksDiff> {
  const rawCourseChunks = await getAllChunksForCourse(courseId);

  // Build a data structure from the result of getAllChunksForCourse so that
  // we can efficiently query to see if a given chunk exists
  const existingCourseChunks: CourseChunks = {
    elements: false,
    elementExtensions: false,
    serverFilesCourse: false,
    clientFilesCourse: false,
    courseInstances: new DefaultMap(() => ({
      assessments: new Set(),
      clientFilesCourseInstance: false,
    })),
    questions: new Set(),
  };

  // Track the entity IDs currently referenced by existing chunks, keyed by their
  // human-readable names. This allows us to detect when a chunk exists for a
  // given name but points at an old (now-deleted) DB row, e.g. after a UUID change.
  const existingCourseInstanceIdByName = new Map<string, string | null>();
  const existingAssessmentIdByCourseInstance = new Map<string, Map<string, string | null>>();

  rawCourseChunks.forEach((courseChunk) => {
    // First, populate the auxiliary maps.
    if (courseChunk.type === 'clientFilesCourseInstance' && courseChunk.course_instance_name) {
      existingCourseInstanceIdByName.set(
        courseChunk.course_instance_name,
        courseChunk.course_instance_id ?? null,
      );
    } else if (courseChunk.type === 'clientFilesAssessment') {
      const ciName = courseChunk.course_instance_name;
      const assessName = courseChunk.assessment_name;
      if (ciName && assessName) {
        let assessMap = existingAssessmentIdByCourseInstance.get(ciName);
        if (!assessMap) {
          assessMap = new Map();
          existingAssessmentIdByCourseInstance.set(ciName, assessMap);
        }
        assessMap.set(assessName, courseChunk.assessment_id ?? null);
      }
    }

    // Next, process the chunk by its type.
    switch (courseChunk.type) {
      case 'elements':
      case 'elementExtensions':
      case 'serverFilesCourse':
      case 'clientFilesCourse':
        existingCourseChunks[courseChunk.type] = true;
        break;
      case 'question':
        assert(courseChunk.question_name != null);
        existingCourseChunks.questions.add(courseChunk.question_name);
        break;
      case 'clientFilesCourseInstance': {
        const courseInstanceName = courseChunk.course_instance_name;
        assert(courseInstanceName != null);
        existingCourseChunks.courseInstances.getOrCreate(
          courseInstanceName,
        ).clientFilesCourseInstance = true;
        break;
      }
      case 'clientFilesAssessment': {
        const courseInstanceName = courseChunk.course_instance_name;
        const assessmentName = courseChunk.assessment_name;
        assert(courseInstanceName != null);
        assert(assessmentName != null);
        existingCourseChunks.courseInstances
          .getOrCreate(courseInstanceName)
          .assessments.add(assessmentName);
        break;
      }
    }
  });

  const changedCourseChunks = identifyChunksFromChangedFiles(changedFiles, courseData);

  // Now, let's compute the set of chunks that we need to update or delete.
  const updatedChunks: ChunkMetadata[] = [];
  const deletedChunks: ChunkMetadata[] = [];

  // First: elements, clientFilesCourse, and serverFilesCourse
  for (const chunkType of [
    'elements',
    'elementExtensions',
    'clientFilesCourse',
    'serverFilesCourse',
  ] as const) {
    const hasChunkDirectory = await fs.pathExists(path.join(coursePath, chunkType));
    if (hasChunkDirectory && (!existingCourseChunks[chunkType] || changedCourseChunks[chunkType])) {
      updatedChunks.push({ type: chunkType });
    } else if (!hasChunkDirectory && existingCourseChunks[chunkType]) {
      deletedChunks.push({ type: chunkType });
    }
  }

  // Next: questions
  Object.keys(courseData.questions).forEach((qid) => {
    if (!existingCourseChunks.questions.has(qid) || changedCourseChunks.questions.has(qid)) {
      updatedChunks.push({
        type: 'question',
        questionName: qid,
      });
    }
  });

  // Check for any deleted questions.
  existingCourseChunks.questions.forEach((qid) => {
    if (!(qid in courseData.questions)) {
      deletedChunks.push({
        type: 'question',
        questionName: qid,
      });
    }
  });

  // Preload active (current) DB IDs so we can detect mismatches while iterating
  // over course instances and assessments. This allows us to handle UUID changes.
  const activeCourseInstances = await sqldb.queryRows(
    sql.select_active_course_instance_ids,
    { course_id: courseId },
    z.object({ course_instance_name: z.string(), course_instance_id: z.string() }),
  );
  const activeCiIdByName = new Map(
    activeCourseInstances.map((r) => [r.course_instance_name, r.course_instance_id]),
  );

  const activeAssessments = await sqldb.queryRows(
    sql.select_active_assessment_ids_by_tid,
    { course_id: courseId },
    z.object({
      course_instance_name: z.string(),
      assessment_name: z.string(),
      assessment_id: z.string(),
    }),
  );
  const activeAssessmentIdByCourseInstance = new Map<string, Map<string, string>>();
  activeAssessments.forEach((r) => {
    let assessMap = activeAssessmentIdByCourseInstance.get(r.course_instance_name);
    if (!assessMap) {
      assessMap = new Map();
      activeAssessmentIdByCourseInstance.set(r.course_instance_name, assessMap);
    }
    assessMap.set(r.assessment_name, r.assessment_id);
  });

  // Next: course instances and their assessments.
  await async.each(
    Object.entries(courseData.courseInstances),
    async ([ciid, courseInstanceInfo]) => {
      const hasClientFilesCourseInstanceDirectory = await fs.pathExists(
        path.join(coursePath, 'courseInstances', ciid, 'clientFilesCourseInstance'),
      );

      const existingCourseInstanceId = existingCourseInstanceIdByName.get(ciid) ?? null;
      const activeCourseInstanceId = activeCiIdByName.get(ciid) ?? null;
      const courseInstanceIdMismatch =
        !!activeCourseInstanceId && activeCourseInstanceId !== existingCourseInstanceId;
      const existingCourseInstanceChunk =
        existingCourseChunks.courseInstances.get(ciid)?.clientFilesCourseInstance;

      const changedCourseInstanceChunk =
        changedCourseChunks.courseInstances.get(ciid)?.clientFilesCourseInstance;
      if (
        hasClientFilesCourseInstanceDirectory &&
        (!existingCourseInstanceChunk || changedCourseInstanceChunk || courseInstanceIdMismatch)
      ) {
        updatedChunks.push({
          type: 'clientFilesCourseInstance',
          courseInstanceName: ciid,
        });
      }

      await async.each(Object.keys(courseInstanceInfo.assessments), async (tid) => {
        const hasClientFilesAssessmentDirectory = await fs.pathExists(
          path.join(
            coursePath,
            'courseInstances',
            ciid,
            'assessments',
            tid,
            'clientFilesAssessment',
          ),
        );
        const existingAssessmentId =
          existingAssessmentIdByCourseInstance.get(ciid)?.get(tid) ?? null;
        const activeAssessmentId = activeAssessmentIdByCourseInstance.get(ciid)?.get(tid) ?? null;
        const assessmentIdMismatch =
          !!activeAssessmentId && activeAssessmentId !== existingAssessmentId;
        const hasExistingAssessment =
          existingCourseChunks.courseInstances.get(ciid)?.assessments.has(tid) ?? false;
        const hasChangedAssessment =
          changedCourseChunks.courseInstances.get(ciid)?.assessments.has(tid) ?? false;
        if (
          hasClientFilesAssessmentDirectory &&
          (!hasExistingAssessment || hasChangedAssessment || assessmentIdMismatch)
        ) {
          updatedChunks.push({
            type: 'clientFilesAssessment',
            courseInstanceName: ciid,
            assessmentName: tid,
          });
        }
      });
    },
  );

  // Check for any deleted course instances or their assessments.
  await Promise.all(
    existingCourseChunks.courseInstances.map(async (ciid, courseInstanceInfo) => {
      const courseInstanceExists = ciid in courseData.courseInstances;
      const clientFilesCourseInstanceExists = await fs.pathExists(
        path.join(coursePath, 'courseInstances', ciid, 'clientFilesCourseInstance'),
      );
      if (!courseInstanceExists || !clientFilesCourseInstanceExists) {
        deletedChunks.push({
          type: 'clientFilesCourseInstance',
          courseInstanceName: ciid,
        });
      }

      await Promise.all(
        [...courseInstanceInfo.assessments].map(async (tid) => {
          const assessmentExists =
            courseInstanceExists && tid in courseData.courseInstances[ciid].assessments;
          const clientFilesAssessmentExists = await fs.pathExists(
            path.join(
              coursePath,
              'courseInstances',
              ciid,
              'assessments',
              tid,
              'clientFilesAssessment',
            ),
          );
          if (!assessmentExists || !clientFilesAssessmentExists) {
            deletedChunks.push({
              type: 'clientFilesAssessment',
              courseInstanceName: ciid,
              assessmentName: tid,
            });
          }
        }),
      );
    }),
  );

  return { updatedChunks, deletedChunks };
}

async function createAndUploadChunks(
  coursePath: string,
  courseId: string,
  chunksToGenerate: ChunkMetadata[],
) {
  const generatedChunks: (ChunkMetadata & { uuid: string })[] = [];

  // Share a single S3 client across all uploads. If we created one client per
  // upload, we'd face a denial of service if someone changed a sufficient number
  // of chunks in a single commit because we'd be rapidly hammering the EC2 IMDS
  // with requests for credentials and would likely get rate limited.
  const s3 = new S3(makeS3ClientConfig());

  await async.eachLimit(chunksToGenerate, config.chunksMaxParallelUpload, async (chunk) => {
    const chunkDirectory = coursePathForChunk(coursePath, chunk);

    // Generate a UUId for this chunk
    const chunkUuid = crypto.randomUUID();

    // Let's create a tarball for this chunk and send it off to S3
    const tarball = tar.create(
      {
        gzip: true,
        cwd: chunkDirectory,
      },
      ['.'],
    );

    const passthrough = new PassThroughStream();
    tarball.pipe(passthrough);

    await new Upload({
      client: s3,
      params: {
        Bucket: config.chunksS3Bucket,
        Key: `${chunkUuid}.tar.gz`,
        Body: passthrough,
      },
    }).done();

    generatedChunks.push({ ...chunk, uuid: chunkUuid });
  });

  // Now that the new chunks have been uploaded, update their status in the database
  await sqldb.execute(sql.insert_chunks, {
    course_id: courseId,
    // Force this to a string; otherwise, our code in `sql-db.js` will try to
    // convert it into a Postgres `ARRAY[...]` type, which we don't want.
    chunks: JSON.stringify(generatedChunks),
  });
}

/**
 * Deletes the specified chunks from the database. Note that they are not
 * deleted from S3 at this time.
 */
async function deleteChunks(courseId: string, chunksToDelete: ChunkMetadata[]) {
  if (chunksToDelete.length === 0) {
    // Avoid a round-trip to the DB if there's nothing to delete.
    return;
  }

  await sqldb.execute(sql.delete_chunks, {
    course_id: courseId,
    // Force this to a string; otherwise, our code in `sql-db.js` will try to
    // convert it into a Postgres `ARRAY[...]` type, which we don't want.
    chunks: JSON.stringify(chunksToDelete),
  });
}

/**
 * Returns the paths to the chunks directories for the given course
 * ID. The "downloads" directory will hold in-progress chunk
 * downloads, the "chunks" directory will hold fully-downloaded chunk
 * zip files, the "unpacked" directory will hold unpacked zips, and
 * the "course" directory is the reconstructed directory hierarchy
 * that mimics the source repo.
 *
 * IMPORTANT: we previously differentiated between `base` and `course` - that
 * is, `course` was a subdirectory of `base`. However, we've since changed
 * that so that the base directory *is* the course directory, and all
 * chunk-related directories are subdirectories of the course directory. This
 * is crucial for the way that we containerize course code execution, as we
 * need any symlinks to refer to point to something within the course directory.
 * Otherwise, when we mount the course directory into a container, the symlinks
 * won't be resolvable.
 *
 * @param courseId The ID of the course in question
 */
function getChunksDirectoriesForCourseId(courseId: string) {
  const baseDirectory = path.join(config.chunksConsumerDirectory, `course-${courseId}`);
  return {
    base: baseDirectory,
    course: baseDirectory,
    downloads: path.join(baseDirectory, '__chunks', 'downloads'),
    chunks: path.join(baseDirectory, '__chunks', 'chunks'),
    unpacked: path.join(baseDirectory, '__chunks', 'unpacked'),
  };
}

interface CourseWithRuntimeDirectory {
  /** The database ID of the course. */
  id: string;
  /** The path to the course source (not the chunks) */
  path: string;
}

/**
 * Returns the absolute path to the course directory that should be used at
 * runtime for things like serving course files, executing question code, etc.
 * If chunks are enabled, this will be same as the "course" directory from
 * `getChunksDirectoriesForCourseId`. Otherwise, this returns the path of the
 * course that was passed in. This abstraction allows calling code to not need
 * to know if chunks are enabled or not.
 *
 * This function is designed to take a course object like one would get from
 * `res.locals.course`. If such an object isn't readily available, you can
 * just construct one with a course ID and course path.
 */
export function getRuntimeDirectoryForCourse(course: CourseWithRuntimeDirectory): string {
  if (config.chunksConsumer) {
    return getChunksDirectoriesForCourseId(course.id).course;
  } else {
    return course.path;
  }
}

interface UpdateChunksForCourseOptions {
  coursePath: string;
  courseId: string;
  courseData: CourseData;
  oldHash?: string | null;
  newHash?: string | null;
  changedFiles?: string[];
}

export async function updateChunksForCourse({
  coursePath,
  courseId,
  courseData,
  oldHash,
  newHash,
  changedFiles,
}: UpdateChunksForCourseOptions): Promise<ChunksDiff> {
  const resolvedChangedFiles = await run(async () => {
    if (changedFiles && (oldHash || newHash)) {
      throw new Error('cannot specify changedFiles with oldHash or newHash');
    }

    if (changedFiles) return changedFiles;

    if (oldHash && newHash) return await identifyChangedFiles(coursePath, oldHash, newHash);

    return [];
  });

  const { updatedChunks, deletedChunks } = await diffChunks({
    coursePath,
    courseId,
    courseData,
    changedFiles: resolvedChangedFiles,
  });

  await createAndUploadChunks(coursePath, courseId, updatedChunks);
  await deleteChunks(courseId, deletedChunks);

  return { updatedChunks, deletedChunks };
}

/**
 * Generates all chunks for a list of courses.
 */
export async function generateAllChunksForCourseList(course_ids: string[], authn_user_id: string) {
  const serverJob = await createServerJob({
    type: 'generate_all_chunks',
    description: 'Generate all chunks for a list of courses',
    userId: authn_user_id,
    authnUserId: authn_user_id,
  });

  serverJob.executeInBackground(async (job) => {
    for (const [i, courseId] of course_ids.entries()) {
      job.info(`Generating chunks for course ${courseId} [${i + 1}/${course_ids.length}]`);
      await _generateAllChunksForCourseWithJob(courseId, job);
    }
  });

  return serverJob.jobSequenceId;
}

/**
 * Helper function to generate all chunks for a single course.
 */
async function _generateAllChunksForCourseWithJob(course_id: string, job: ServerJob) {
  job.info(chalk.bold('Looking up course directory'));
  let courseDir = await sqldb.queryRow(
    sql.select_course_dir,
    { course_id },
    CourseSchema.shape.path,
  );
  job.verbose(`Found course directory: ${courseDir}`);
  courseDir = path.resolve(process.cwd(), courseDir);
  job.verbose(`Resolved course directory: ${courseDir}`);

  const lockName = getLockNameForCoursePath(courseDir);
  job.info(chalk.bold(`Acquiring lock ${lockName}`));

  await namedLocks.doWithLock(lockName, {}, async () => {
    job.verbose('Acquired lock');

    job.info(chalk.bold(`Loading course data from ${courseDir}`));
    const courseData = await courseDB.loadFullCourse(course_id, courseDir);
    job.verbose('Loaded course data');

    job.info(chalk.bold('Generating all chunks'));
    const chunkOptions = {
      coursePath: courseDir,
      courseId: String(course_id),
      courseData,
    };
    const chunkChanges = await updateChunksForCourse(chunkOptions);
    logChunkChangesToJob(chunkChanges, job);
    job.verbose('Generated all chunks');
  });

  job.verbose('Released lock');

  job.info(chalk.green(`Successfully generated chunks for course ID = ${course_id}`));
}

const ensureChunk = async (courseId: string, chunk: DatabaseChunk) => {
  assert(chunk.uuid != null, 'chunk.uuid is required');
  const courseChunksDirs = getChunksDirectoriesForCourseId(courseId);
  const downloadPath = path.join(courseChunksDirs.downloads, `${chunk.uuid}.tar.gz`);
  const chunkPath = path.join(courseChunksDirs.chunks, `${chunk.uuid}.tar.gz`);
  const unpackPath = path.join(courseChunksDirs.unpacked, chunk.uuid);
  let relativeTargetPath: string;
  switch (chunk.type) {
    case 'elements':
    case 'elementExtensions':
    case 'serverFilesCourse':
    case 'clientFilesCourse':
      relativeTargetPath = chunk.type;
      break;
    case 'clientFilesCourseInstance':
      relativeTargetPath = path.join(
        'courseInstances',
        chunk.course_instance_name,
        'clientFilesCourseInstance',
      );
      break;
    case 'clientFilesAssessment':
      relativeTargetPath = path.join(
        'courseInstances',
        chunk.course_instance_name,
        'assessments',
        chunk.assessment_name,
        'clientFilesAssessment',
      );
      break;
    case 'question':
      relativeTargetPath = path.join('questions', chunk.question_name);
      break;
    default:
      throw new Error(`unknown type for chunk=${JSON.stringify(chunk)}`);
  }
  const targetPath = path.join(courseChunksDirs.course, relativeTargetPath);
  const relativeUnpackPath = path.relative(path.dirname(targetPath), unpackPath);

  // We have a chunk installed if we have a symlink targetPath -> relativeUnpackPath
  let chunkExists = false;
  try {
    const linkString = await fs.readlink(targetPath);
    if (linkString === relativeUnpackPath) {
      chunkExists = true;
    }
  } catch (err: any) {
    // If we encounter an EINVAL error, chances are that we're trying to `readlink`
    // on a directory. This can occur if a question is renamed to a parent directory,
    // e.g. renamed from `foo/bar/baz` to `foo/bar`. In this case, we should remove
    // the existing target path and continue.
    //
    // Our syncing code guarantees that if a question `foo/bar` exists, then no
    // question with that same prefix will exist, so we can always safely remove
    // the existing target directory.
    //
    // If the target path isn't a directory, who knows what state we're in, so we
    // allow the error to propagate.
    if (err.code === 'EINVAL' && (await fs.stat(targetPath)).isDirectory()) {
      await fs.remove(targetPath);
    } else if (err.code !== 'ENOENT') {
      // Allow ENOENT errors to continue, because they mean we don't have the chunk
      throw err;
    }
  }
  if (chunkExists) {
    // If we have the correct link then this chunk is unpacked and
    // installed. We're good to go!
    return;
  }

  // Otherwise, we need to download and untar the chunk. We'll download it
  // to the "downloads" path first, then rename it to the "chunks" path.
  await fs.ensureDir(path.dirname(downloadPath));
  await downloadFromS3(config.chunksS3Bucket, `${chunk.uuid}.tar.gz`, downloadPath);
  await fs.move(downloadPath, chunkPath, { overwrite: true });

  // Once the chunk has been downloaded, we need to untar it. In
  // case we had an earlier unpack attempt, we will remove the
  // existing unpack directory to ensure a clean slate.
  await fs.remove(unpackPath);
  await fs.ensureDir(unpackPath);
  await tar.extract({
    file: chunkPath,
    cwd: unpackPath,
  });

  // Before we configure the symlink, we need to check if there are any
  // outdated symlinks that need to be removed. Those can occur when a question
  // is renamed into a directory nested inside of its former directory, e.g.
  // if `questions/a/b/info.json` is moved to `questions/a/b/c/info.json`.
  //
  // We'll handle this by checking if any parent directory of the `targetPath`
  // exists and is a symlink. If so, we'll remove it. This should always be
  // safe because we should never have nested symlinks.
  const pathSegments = relativeTargetPath.split(path.sep);
  for (let i = 1; i < pathSegments.length; i++) {
    const parentPath = path.join(courseChunksDirs.course, ...pathSegments.slice(0, i));
    try {
      const stat = await fs.lstat(parentPath);
      if (stat.isSymbolicLink()) {
        await fs.remove(parentPath);
      } else if (!stat.isDirectory()) {
        throw new Error(`${parentPath} exists but is not a directory`);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Finally, link targetPath -> relativeUnpackPath
  // Note that ensureSymlink() won't overwrite an existing targetPath
  // See:
  //     https://github.com/jprichardson/node-fs-extra/pull/869
  //     https://github.com/jprichardson/node-fs-extra/issues/786
  //     https://github.com/jprichardson/node-fs-extra/pull/826
  // As a work-around, we symlink a temporary name and move it over targetPath
  const tmpPath = `${targetPath}-${chunk.uuid}`;
  await fs.ensureSymlink(relativeUnpackPath, tmpPath);
  await fs.rename(tmpPath, targetPath);
};

const pendingChunksMap = new Map<string, Promise<void>>();

/**
 * Ensures that specific chunks for a course are loaded. These chunks will either be pulled
 * from S3 if they do not exist, or the existing on-disk chunks will be used if they are
 * still the latest version.
 *
 * For each requested chunk, if the chunk exists on disk but does not exist in
 * the database, the chunk will be removed from the course's runtime directory.
 *
 * @param courseId The ID of the course to load chunks for.
 * @param chunks One or more chunks to load.
 */
export async function ensureChunksForCourseAsync(courseId: string, chunks: Chunk | Chunk[]) {
  if (!config.chunksConsumer) {
    // We only need to worry if we are a chunk consumer server
    return;
  }

  if (!Array.isArray(chunks)) {
    chunks = [chunks];
  }

  // First, query the database to identify the UUID + associated name(s) of each desired chunk
  // "Names" in this case refers to question/course instance/assessment names.
  const dbChunks = await sqldb.queryRows(
    sql.select_metadata_for_chunks,
    {
      course_id: courseId,
      chunks_arr: JSON.stringify(chunks),
    },
    DatabaseChunkSchema,
  );

  // The results from the database contain information for chunks that exist in
  // the database, and also for chunks that do _not_ exist in the database. We
  // use the latter to remove chunks from disk if they no longer correspond to
  // a directory in the course. We differentiate between the two based on the
  // presence of an `id` field in the response.
  //
  // See the end of this function for more details.
  const validChunks = dbChunks.filter((chunk) => chunk.id != null);
  const missingChunks = dbChunks.filter((chunk) => chunk.id == null);

  // Now, ensure each individual chunk is loaded and untarred to the correct
  // place on disk.
  await async.eachLimit(validChunks, config.chunksMaxParallelDownload, async (chunk) => {
    // TypeScript can't handle Omit<DatabaseChunk, 'uuid'> & { uuid: string }
    // since DatabaseChunk is a union. See https://github.com/microsoft/TypeScript/issues/31501
    assert(chunk.uuid != null, 'chunk.uuid is required');
    const pendingChunkKey = `${courseId}-${chunk.uuid}`;
    const pendingChunkPromise = pendingChunksMap.get(pendingChunkKey);
    if (pendingChunkPromise) {
      // If this chunk is already being loaded, reuse the existing promise
      return pendingChunkPromise;
    }

    const chunkPromise = ensureChunk(courseId, chunk);
    pendingChunksMap.set(pendingChunkKey, chunkPromise);
    try {
      await chunkPromise;
    } finally {
      // Once the promise has settled, remove it from our collection of
      // pending promises. This helps prevent memory leaks and, more
      // importantly, ensures we don't cache rejected promises - if loading
      // a chunk fails for some reason, this will ensure we try to load it
      // again the next time it's requested.
      pendingChunksMap.delete(pendingChunkKey);
    }
  });

  // We also need to take care to remove any chunks that are no longer valid.
  // For instance, if a course previously had an `elements` directory but that
  // directory was removed in a more recent revision, we need to ensure that
  // the `elements` directory does not exist inside the course's runtime
  // directory.
  //
  // For any chunk that the caller is asking to "ensure", we check if it exists
  // in the results of `select_metadata_for_chunks`. If it does not, we remove
  // the chunk from the course's runtime directory.
  //
  // See https://github.com/PrairieLearn/PrairieLearn/issues/4692 for more details.
  const courseChunksDirs = getChunksDirectoriesForCourseId(courseId);
  await Promise.all(
    missingChunks.map(async (chunk) => {
      // Blindly remove this chunk from disk - if it doesn't exist, `fs.remove`
      // will silently no-op.
      const chunkMetadata = chunkMetadataFromDatabaseChunk(chunk);
      await fs.remove(coursePathForChunk(courseChunksDirs.course, chunkMetadata));
    }),
  );
}

interface QuestionWithTemplateDirectory {
  id: string;
  template_directory: null | string;
}

/**
 * Get the list of template question IDs for a given question.
 *
 * @param question A question object.
 * @returns Array of question IDs that are (recursive) templates for the given question (may be an empty array).
 */
export async function getTemplateQuestionIds(
  question: QuestionWithTemplateDirectory,
): Promise<string[]> {
  if (!question.template_directory) return [];
  const questionIds = await sqldb.queryRows(
    sql.select_template_question_ids,
    { question_id: question.id },
    IdSchema,
  );
  return questionIds;
}

/**
 * Logs the changes to chunks for a given job.
 */
export function logChunkChangesToJob(
  { updatedChunks, deletedChunks }: ChunksDiff,
  job: Pick<ServerJob, 'verbose'>,
) {
  if (updatedChunks.length === 0 && deletedChunks.length === 0) {
    job.verbose('No chunks changed.');
    return;
  }

  const lines: string[] = [];

  if (updatedChunks.length > 0) {
    lines.push('Generated chunks for the following paths:');
    updatedChunks.forEach((chunk) => {
      lines.push(`  ${pathForChunk(chunk)}`);
    });
  } else {
    lines.push('No chunks were generated.');
  }

  if (deletedChunks.length > 0) {
    lines.push('Deleted chunks for the following paths:');
    deletedChunks.forEach((chunk) => {
      lines.push(`  ${pathForChunk(chunk)}`);
    });
  } else {
    lines.push('No chunks were deleted.');
  }

  job.verbose(lines.join('\n'));
}
