// @ts-check
const AWS = require('aws-sdk');
const async = require('async');
const child_process = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const PassThroughStream = require('stream').PassThrough;
const tar = require('tar');
const util = require('util');
const { v4: uuidv4 } = require('uuid');
const { chalk, chalkDim } = require('../lib/chalk');

const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const namedLocks = require('../lib/named-locks');
const courseDB = require('../sync/course-db');
const sqlDb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const globalConfig = require('./config');

const sql = sqlLoader.loadSqlEquiv(__filename);

/** @typedef {"elements" | "elementExtensions" | "clientFilesCourse" | "serverFilesCourse" | "clientFilesCourseInstance" | "clientFilesAssessment" | "question"} ChunkType */

/**
 * @typedef {Object} ElementsChunkMetadata
 * @property {"elements"} type
 */

/**
 * @typedef {Object} ElementExtensionsChunkMetadata
 * @property {"elementExtensions"} type
 */

/**
 * @typedef {Object} ClientFilesCourseChunkMetadata
 * @property {"clientFilesCourse"} type
 */

/**
 * @typedef {Object} ServerFilesCourseChunkMetadata
 * @property {"serverFilesCourse"} type
 */

/**
 * @typedef {Object} ClientFilesCourseInstanceChunkMetadata
 * @property {"clientFilesCourseInstance"} type
 * @property {string} courseInstanceName The course instance name of this chunk
 */

/**
 * @typedef {Object} ClientFilesAssessmentChunkMetadata
 * @property {"clientFilesAssessment"} type
 * @property {string} courseInstanceName The course instance name of this chunk
 * @property {string} assessmentName The assessment name (TID) of this chunk
 */

/**
 * @typedef {Object} QuestionChunkMetadata
 * @property {"question"} type
 * @property {string} questionName The question name (QID) of this chunk
 */

/**
 * {@link ChunkMetadata} objects are used to refer to chunks according to their
 * human-readable names. For instance, a question chunk has a `questionName` property
 * that corresponds to a QID, not a `questionId` property that corresponds to a
 * database identifier.
 *
 * For chunks that are identified by database IDs instead, see {@link Chunk}.
 *
 * @typedef {ElementsChunkMetadata | ElementExtensionsChunkMetadata | ClientFilesCourseChunkMetadata | ServerFilesCourseChunkMetadata | ClientFilesCourseInstanceChunkMetadata | ClientFilesAssessmentChunkMetadata | QuestionChunkMetadata} ChunkMetadata
 */

/**
 * @typedef {Object} ElementsChunk
 * @property {"elements"} type
 */

/**
 * @typedef {Object} ElementExtensionsChunk
 * @property {"elementExtensions"} type
 */

/**
 * @typedef {Object} ClientFilesCourseChunk
 * @property {"clientFilesCourse"} type
 */

/**
 * @typedef {Object} ServerFilesCourseChunk
 * @property {"serverFilesCourse"} type
 */

/**
 * @typedef {Object} ClientFilesCourseInstanceChunk
 * @property {"clientFilesCourseInstance"} type
 * @property {string | number} courseInstanceId
 */

/**
 * @typedef {Object} ClientFilesAssessmentChunk
 * @property {"clientFilesAssessment"} type
 * @property {string | number} courseInstanceId
 * @property {string | number} assessmentId
 */

/**
 * @typedef {Object} QuestionChunk
 * @property {"question"} type
 * @property {string | number} questionId
 */

/**
 * {@link Chunk} objects are used to identify chunks by the IDs of their
 * corresponding entities. For instance, a question chunk has a `questionId`
 * property that corresponds to `questions.id` in the database.
 *
 * For chunks that are identified by human-readable names instead, see
 * {@link ChunkMetadata}.
 *
 * @typedef {ElementsChunk | ElementExtensionsChunk | ClientFilesCourseChunk | ServerFilesCourseChunk | ClientFilesCourseInstanceChunk | ClientFilesAssessmentChunk | QuestionChunk} Chunk
 */

/**
 * {@link DatabaseChunk} objects represent chunks that we've fetched from the
 * database. They're sort of a superset of {@link Chunk} and {@link ChunkMetadata}
 * objects that contain both the IDs and human-readable names of the chunks.
 *
 * @typedef {Object} DatabaseChunk
 * @property {string | number | null} id
 * @property {ChunkType} type
 * @property {string} [uuid]
 * @property {string | number} course_id
 * @property {string | number} [course_instance_id]
 * @property {string} [course_instance_name]
 * @property {string | number} [assessment_id]
 * @property {string} [assessment_name]
 * @property {string | number} [question_id]
 * @property {string} [question_name]
 */

/**
 * @typedef {Object} CourseInstanceChunks
 * @property {boolean} clientFilesCourseInstance
 * @property {Set<string>} assessments
 */

/**
 * @typedef {Object} CourseChunks
 * @property {boolean} elements
 * @property {boolean} elementExtensions
 * @property {boolean} clientFilesCourse
 * @property {boolean} serverFilesCourse
 * @property {Set<string>} questions
 * @property {{ [id: string]: CourseInstanceChunks }} courseInstances
 */

/**
 * Constructs a {@link ChunkMetadata} object from the given {@link DatabaseChunk}
 * object.
 *
 * @param {DatabaseChunk} chunk
 * @returns {ChunkMetadata}
 */
module.exports.chunkMetadataFromDatabaseChunk = function (chunk) {
  switch (chunk.type) {
    case 'elements':
    case 'elementExtensions':
    case 'clientFilesCourse':
    case 'serverFilesCourse':
      return {
        type: chunk.type,
      };
    case 'clientFilesCourseInstance':
      return {
        type: chunk.type,
        courseInstanceName: chunk.course_instance_name,
      };
    case 'clientFilesAssessment':
      return {
        type: chunk.type,
        courseInstanceName: chunk.course_instance_name,
        assessmentName: chunk.assessment_name,
      };
    case 'question':
      return {
        type: chunk.type,
        questionName: chunk.question_name,
      };
  }
};

/**
 * Returns the absolute path for a course's chunk within the course's runtime
 * directory.
 *
 * @param {string} coursePath
 * @param {ChunkMetadata} chunkMetadata
 */
module.exports.coursePathForChunk = function (coursePath, chunkMetadata) {
  switch (chunkMetadata.type) {
    case 'elements':
    case 'elementExtensions':
    case 'clientFilesCourse':
    case 'serverFilesCourse':
      return path.join(coursePath, chunkMetadata.type);
    case 'question':
      return path.join(coursePath, 'questions', chunkMetadata.questionName);
    case 'clientFilesCourseInstance':
      return path.join(
        coursePath,
        'courseInstances',
        chunkMetadata.courseInstanceName,
        'clientFilesCourseInstance'
      );
    case 'clientFilesAssessment':
      return path.join(
        coursePath,
        'courseInstances',
        chunkMetadata.courseInstanceName,
        'assessments',
        chunkMetadata.assessmentName,
        'clientFilesAssessment'
      );
  }
};

/**
 * Identifies the files that changes between two commits in a given course.
 *
 * @param {string} coursePath The course directory to diff
 * @param {string} oldHash The old (previous) hash for the diff
 * @param {string} newHash The new (current) hash for the diff
 * @returns {Promise<string[]>} List of changed files
 */
module.exports.identifyChangedFiles = async (coursePath, oldHash, newHash) => {
  const { stdout } = await util.promisify(child_process.exec)(
    `git diff --name-only ${oldHash}..${newHash}`,
    { cwd: coursePath }
  );
  return stdout.trim().split('\n');
};

/**
 * Given a list of files that have changed (such as that produced by
 * `git diff --name-only`), returns a data structure describing the chunks
 * that need to be generated.
 *
 * @param {string[]} changedFiles A list of files that changed in a given sync.
 * @param {import('../sync/course-db').CourseData} courseData The "full course" that was loaded from disk.
 * @returns {CourseChunks}
 */
module.exports.identifyChunksFromChangedFiles = (changedFiles, courseData) => {
  /** @type {CourseChunks} */
  const courseChunks = {
    elements: false,
    elementExtensions: false,
    clientFilesCourse: false,
    serverFilesCourse: false,
    courseInstances: {},
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
      let questionId = null;
      for (let i = 1; i < pathComponents.length; i++) {
        const candidateQuestionId = path.join(...pathComponents.slice(0, i));
        if (courseData.questions[candidateQuestionId]) {
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

      if (clientFilesCourseInstanceIndex >= 0) {
        // Let's validate that the preceeding path components correspond
        // to an actual course instance
        const courseInstanceId = path.join(
          ...pathComponents.slice(0, clientFilesCourseInstanceIndex)
        );
        if (courseData.courseInstances[courseInstanceId]) {
          if (!courseChunks.courseInstances[courseInstanceId]) {
            courseChunks.courseInstances[courseInstanceId] = {
              assessments: new Set(),
              clientFilesCourseInstance: true,
            };
          }
          courseChunks.courseInstances[courseInstanceId].clientFilesCourseInstance = true;
          return;
        }
      }

      // Important: fall through to account for weird things like people putting
      // `clientFilesCourseInstance` directories inside of `clientFileAssessment`
      // for some strange reason.
      if (
        assessmentsIndex >= 0 &&
        clientFilesAssessmentIndex >= 0 &&
        clientFilesAssessmentIndex > assessmentsIndex
      ) {
        // We probably care about this file - let's validate that by
        // splitting up the path into chunks that hopefully correspond
        // to course instance IDs and assessment IDs.
        const courseInstanceId = path.join(...pathComponents.slice(0, assessmentsIndex));
        const assessmentId = path.join(
          ...pathComponents.slice(assessmentsIndex + 1, clientFilesAssessmentIndex)
        );

        if (
          courseData.courseInstances[courseInstanceId] &&
          courseData.courseInstances[courseInstanceId].assessments[assessmentId]
        ) {
          // This corresponds to something that we need to
          // create/update a chunk for!
          if (!courseChunks.courseInstances[courseInstanceId]) {
            courseChunks.courseInstances[courseInstanceId] = {
              assessments: new Set(),
              clientFilesCourseInstance: false,
            };
          }
          courseChunks.courseInstances[courseInstanceId].assessments.add(assessmentId);
        }
      }
    }
  });

  return courseChunks;
};

/**
 * Returns all the chunks the are currently stored for the given course.
 *
 * @param {string} courseId
 */
module.exports.getAllChunksForCourse = async (courseId) => {
  const result = await sqlDb.queryAsync(sql.select_course_chunks, {
    course_id: courseId,
  });
  return result.rows;
};

/**
 * Given a course ID, computes a list of all chunks that need to be
 * (re)generated.
 *
 * @param {Object} options
 * @param {string} options.coursePath
 * @param {string} options.courseId
 * @param {import('../sync/course-db').CourseData} options.courseData
 * @param {string[]} options.changedFiles
 * @returns {Promise<{ updatedChunks: ChunkMetadata[], deletedChunks: ChunkMetadata[] }>}
 */
module.exports.diffChunks = async ({ coursePath, courseId, courseData, changedFiles }) => {
  const rawCourseChunks = await module.exports.getAllChunksForCourse(courseId);

  // Build a data structure from the result of getAllChunksForCourse so that
  // we can efficiently query to see if a given chunk exists
  /** @type {CourseChunks} */
  const existingCourseChunks = {
    elements: false,
    elementExtensions: false,
    serverFilesCourse: false,
    clientFilesCourse: false,
    courseInstances: {},
    questions: new Set(),
  };

  rawCourseChunks.forEach((courseChunk) => {
    switch (courseChunk.type) {
      case 'elements':
      case 'elementExtensions':
      case 'serverFilesCourse':
      case 'clientFilesCourse':
        existingCourseChunks[courseChunk.type] = true;
        break;
      case 'question':
        existingCourseChunks.questions.add(courseChunk.question_name);
        break;
      case 'clientFilesCourseInstance': {
        const courseInstanceName = courseChunk.course_instance_name;
        if (!existingCourseChunks.courseInstances[courseInstanceName]) {
          existingCourseChunks.courseInstances[courseInstanceName] = {
            assessments: new Set(),
            clientFilesCourseInstance: true,
          };
        }
        existingCourseChunks.courseInstances[courseInstanceName].clientFilesCourseInstance = true;
        break;
      }
      case 'clientFilesAssessment': {
        const courseInstanceName = courseChunk.course_instance_name;
        const assessmentName = courseChunk.assessment_name;
        if (!existingCourseChunks.courseInstances[courseInstanceName]) {
          existingCourseChunks.courseInstances[courseInstanceName] = {
            assessments: new Set(),
            clientFilesCourseInstance: false,
          };
        }
        existingCourseChunks.courseInstances[courseInstanceName].assessments.add(assessmentName);
        break;
      }
    }
  });

  const changedCourseChunks = module.exports.identifyChunksFromChangedFiles(
    changedFiles,
    courseData
  );

  // Now, let's compute the set of chunks that we need to update or delete.
  /** @type {ChunkMetadata[]} */
  const updatedChunks = [];
  /** @type {ChunkMetadata[]} */
  const deletedChunks = [];

  // First: elements, clientFilesCourse, and serverFilesCourse
  await async.each(
    ['elements', 'elementExtensions', 'clientFilesCourse', 'serverFilesCourse'],
    async (
      /** @type {"elements" | "elementExtensions" | "clientFilesCourse" | "serverFilesCourse"} */ chunkType
    ) => {
      const hasChunkDirectory = await fs.pathExists(path.join(coursePath, chunkType));
      if (
        hasChunkDirectory &&
        (!existingCourseChunks[chunkType] || changedCourseChunks[chunkType])
      ) {
        updatedChunks.push({ type: chunkType });
      } else if (!hasChunkDirectory) {
        deletedChunks.push({ type: chunkType });
      }
    }
  );

  // Next: questions
  Object.keys(courseData.questions).forEach((qid) => {
    if (!existingCourseChunks.questions.has(qid) || changedCourseChunks.questions.has(qid)) {
      updatedChunks.push({
        type: 'question',
        questionName: qid,
      });
    }
  });

  // Next: course instances and their assessments
  await async.each(
    Object.entries(courseData.courseInstances),
    async ([ciid, courseInstanceInfo]) => {
      const hasClientFilesCourseInstanceDirectory = await fs.pathExists(
        path.join(coursePath, 'courseInstances', ciid, 'clientFilesCourseInstance')
      );
      if (
        hasClientFilesCourseInstanceDirectory &&
        (!existingCourseChunks.courseInstances[ciid] ||
          !existingCourseChunks.courseInstances[ciid].clientFilesCourseInstance ||
          (changedCourseChunks.courseInstances[ciid] &&
            changedCourseChunks.courseInstances[ciid].clientFilesCourseInstance))
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
            'clientFilesAssessment'
          )
        );
        if (
          hasClientFilesAssessmentDirectory &&
          (!existingCourseChunks.courseInstances[ciid] ||
            !existingCourseChunks.courseInstances[ciid].assessments ||
            !existingCourseChunks.courseInstances[ciid].assessments.has(tid) ||
            (changedCourseChunks.courseInstances[ciid] &&
              changedCourseChunks.courseInstances[ciid].assessments &&
              changedCourseChunks.courseInstances[ciid].assessments.has(tid)))
        ) {
          updatedChunks.push({
            type: 'clientFilesAssessment',
            courseInstanceName: ciid,
            assessmentName: tid,
          });
        }
      });
    }
  );

  return { updatedChunks, deletedChunks };
};

/**
 *
 * @param {string} coursePath
 * @param {string} courseId
 * @param {ChunkMetadata[]} chunksToGenerate
 */
module.exports.createAndUploadChunks = async (coursePath, courseId, chunksToGenerate) => {
  const generatedChunks = [];

  await async.eachLimit(chunksToGenerate, globalConfig.chunksMaxParallelUpload, async (chunk) => {
    const chunkDirectory = module.exports.coursePathForChunk(coursePath, chunk);

    // Generate a UUId for this chunk
    const chunkUuid = uuidv4();

    // Let's create a tarball for this chunk and send it off to S3
    const tarball = tar.create(
      {
        gzip: true,
        cwd: chunkDirectory,
      },
      ['.']
    );

    const passthrough = new PassThroughStream();
    tarball.pipe(passthrough);

    const params = {
      Bucket: globalConfig.chunksS3Bucket,
      Key: `${chunkUuid}.tar.gz`,
      Body: passthrough,
    };
    const s3 = new AWS.S3();
    await s3.upload(params).promise();

    generatedChunks.push({ ...chunk, uuid: chunkUuid });
  });

  // Now that the new chunks have been uploaded, update their status in the database
  await sqlDb.queryAsync(sql.insert_chunks, {
    course_id: courseId,
    // Force this to a string; otherwise, our code in `sql-db.js` will try to
    // convert it into a Postgres `ARRAY[...]` type, which we don't want.
    chunks: JSON.stringify(generatedChunks),
  });
};

/**
 * Deletes the specified chunks from the database. Note that they are not
 * deleted from S3 at this time.
 *
 * @param {string} courseId
 * @param {ChunkMetadata[]} chunksToDelete
 */
module.exports.deleteChunks = async function (courseId, chunksToDelete) {
  if (chunksToDelete.length === 0) {
    // Avoid a round-trip to the DB if there's nothing to delete.
    return;
  }

  await sqlDb.queryAsync(sql.delete_chunks, {
    course_id: courseId,
    // Force this to a string; otherwise, our code in `sql-db.js` will try to
    // convert it into a Postgres `ARRAY[...]` type, which we don't want.
    chunks: JSON.stringify(chunksToDelete),
  });
};

/**
 * Returns the paths to the chunks directories for the given course
 * ID. The "downloads" directory will hold in-progress chunk
 * downloads, the "chunks" directory will hold fully-downloaded chunk
 * zip files, the "unpacked" directory will hold unpacked zips, and
 * the "course" directory is the reconstructed directory hierarchy
 * that mimics the source repo.
 *
 * @param {string} courseId The ID of the course in question
 */
module.exports.getChunksDirectoriesForCourseId = (courseId) => {
  const baseDirectory = path.join(globalConfig.chunksConsumerDirectory, `course-${courseId}`);
  return {
    base: baseDirectory,
    downloads: path.join(baseDirectory, 'downloads'),
    chunks: path.join(baseDirectory, 'chunks'),
    unpacked: path.join(baseDirectory, 'unpacked'),
    course: path.join(baseDirectory, 'course'),
  };
};

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
 *
 * @param {Object} course The course object
 * @param {string} course.id The database ID of the course
 * @param {string} course.path The path to the course source (not the chunks)
 */
module.exports.getRuntimeDirectoryForCourse = (course) => {
  if (globalConfig.chunksConsumer) {
    return module.exports.getChunksDirectoriesForCourseId(course.id).course;
  } else {
    return course.path;
  }
};

/**
 *
 * @param {Object} options
 * @param {string} options.coursePath
 * @param {string} options.courseId
 * @param {import('../sync/course-db').CourseData} options.courseData
 * @param {string} [options.oldHash]
 * @param {string} [options.newHash]
 */
module.exports.updateChunksForCourse = async ({
  coursePath,
  courseId,
  courseData,
  oldHash,
  newHash,
}) => {
  let changedFiles = [];
  if (oldHash && newHash) {
    changedFiles = await module.exports.identifyChangedFiles(coursePath, oldHash, newHash);
  }

  const { updatedChunks, deletedChunks } = await module.exports.diffChunks({
    coursePath,
    courseId,
    courseData,
    changedFiles,
  });

  await module.exports.createAndUploadChunks(coursePath, courseId, updatedChunks);
  await module.exports.deleteChunks(courseId, deletedChunks);
};

/**
 * Generates all chunks for a list of courses.
 *
 * @param {number[]} course_ids
 * @param {number} authn_user_id
 */
module.exports.generateAllChunksForCourseList = async (course_ids, authn_user_id) => {
  const jobSequenceOptions = {
    user_id: authn_user_id,
    authn_user_id: authn_user_id,
    type: 'generate_all_chunks',
    description: 'Generate all chunks for a list of courses',
  };
  const job_sequence_id = await serverJobs.createJobSequenceAsync(jobSequenceOptions);

  // don't await this, we want it to run in the background
  module.exports._generateAllChunksForCourseListWithJobSequence(
    course_ids,
    authn_user_id,
    job_sequence_id
  );

  // return immediately, while the generation is still running
  return job_sequence_id;
};

/**
 * Helper function to actually generate all chunks for a list of courses.
 *
 * @param {number[]} course_ids
 * @param {number} authn_user_id
 * @param {number} job_sequence_id
 */
module.exports._generateAllChunksForCourseListWithJobSequence = async (
  course_ids,
  authn_user_id,
  job_sequence_id
) => {
  try {
    for (let i = 0; i < course_ids.length; i++) {
      const course_id = course_ids[i];
      const jobOptions = {
        course_id: null /* Set the job's course_id to null so we can find it from the admin page */,
        type: 'generate_all_chunks',
        description: `Generate all chunks for course ID = ${course_id}`,
        job_sequence_id,
        user_id: authn_user_id,
        authn_user_id,
        last_in_sequence: i === course_ids.length - 1,
      };
      const job = await serverJobs.createJobAsync(jobOptions);
      job.info(chalkDim(`Course ID = ${course_id}`));

      try {
        await module.exports._generateAllChunksForCourseWithJob(course_id, job);
        job.succeed();
      } catch (err) {
        job.error(chalk.red(JSON.stringify(err)));
        await job.failAsync(err);
        throw err;
      }
    }
  } catch (err) {
    try {
      await serverJobs.failJobSequenceAsync(job_sequence_id);
    } catch (err) {
      logger.error(`Failed to fail job_sequence_id=${job_sequence_id}`);
    }
  }
};

/**
 * Helper function to generate all chunks for a single course.
 *
 * @param {number} course_id
 * @param {object} job
 */
module.exports._generateAllChunksForCourseWithJob = async (course_id, job) => {
  job.info(chalk.bold(`Looking up course directory`));
  const result = await sqlDb.queryOneRowAsync(sql.select_course_dir, { course_id });
  let courseDir = result.rows[0].path;
  job.info(chalkDim(`Found course directory = ${courseDir}`));
  courseDir = path.resolve(process.cwd(), courseDir);
  job.info(chalkDim(`Resolved course directory = ${courseDir}`));

  const lockName = `coursedir:${courseDir}`;
  job.info(chalk.bold(`Acquiring lock ${lockName}`));

  await namedLocks.doWithLock(lockName, {}, async () => {
    job.info(chalkDim(`Acquired lock`));

    job.info(chalk.bold(`Loading course data from ${courseDir}`));
    const courseData = await courseDB.loadFullCourseNew(courseDir);
    job.info(chalkDim(`Loaded course data`));

    job.info(chalk.bold(`Generating all chunks`));
    const chunkOptions = {
      coursePath: courseDir,
      courseId: String(course_id),
      courseData,
    };
    await module.exports.updateChunksForCourse(chunkOptions);
    job.info(chalkDim(`Generated all chunks`));
  });

  job.info(chalkDim(`Released lock`));

  job.info(chalk.green(`Successfully generated chunks for course ID = ${course_id}`));
};

/**
 *
 * @param {string} courseId
 * @param {DatabaseChunk} chunk
 */
const ensureChunk = async (courseId, chunk) => {
  const courseChunksDirs = module.exports.getChunksDirectoriesForCourseId(courseId);
  const downloadPath = path.join(courseChunksDirs.downloads, `${chunk.uuid}.tar.gz`);
  const chunkPath = path.join(courseChunksDirs.chunks, `${chunk.uuid}.tar.gz`);
  const unpackPath = path.join(courseChunksDirs.unpacked, chunk.uuid);
  let relativeTargetPath;
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
        'clientFilesCourseInstance'
      );
      break;
    case 'clientFilesAssessment':
      relativeTargetPath = path.join(
        'courseInstances',
        chunk.course_instance_name,
        'assessments',
        chunk.assessment_name,
        'clientFilesAssessment'
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
  } catch (err) {
    // Allow ENOENT errors to continue, because they mean we don't have the chunk
    if (err.code !== 'ENOENT') throw err;
  }
  if (chunkExists) {
    // If we have the correct link then this chunk is unpacked and
    // installed. We're good to go!
    return;
  }

  // Otherwise, we need to download and untar the chunk. We'll download it
  // to the "downloads" path first, then rename it to the "chunks" path.
  const params = {
    Bucket: globalConfig.chunksS3Bucket,
    Key: `${chunk.uuid}.tar.gz`,
  };
  await fs.ensureDir(path.dirname(downloadPath));
  const s3 = new AWS.S3();
  await new Promise((resolve, reject) => {
    s3.getObject(params)
      .createReadStream()
      .on('error', (err) => {
        logger.error(`Could not download chunk ${chunk.uuid}: ${err}`);
        reject(err);
      })
      .on('end', () => resolve())
      .pipe(fs.createWriteStream(downloadPath));
  });
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

/** @type {Map<string, Promise>} */
const pendingChunksMap = new Map();

/**
 * Ensures that specific chunks for a course are loaded. These chunks will either be pulled
 * from S3 if they do not exist, or the existing on-disk chunks will be used if they are
 * still the latest version.
 *
 * For each requested chunk, if the chunk exists on disk but does not exist in
 * the database, the chunk will be removed from the course's runtime directory.
 *
 * @param {string} courseId
 * @param {Chunk | Chunk[]} chunks to load.  This can either be a single chunk or an array of chunks.
 */
module.exports.ensureChunksForCourseAsync = async (courseId, chunks) => {
  if (!globalConfig.chunksConsumer) {
    // We only need to worry if we are a chunk consumer server
    return;
  }

  if (!Array.isArray(chunks)) {
    chunks = [chunks];
  }

  // First, query the database to identify the UUID + associated name(s) of each desired chunk
  // "Names" in this case referrs to question/course instance/assessment names.
  /** @type {import('pg').QueryResult<DatabaseChunk>} */
  const dbChunks = await sqlDb.queryAsync(sql.select_metadata_for_chunks, {
    course_id: courseId,
    chunks_arr: JSON.stringify(chunks),
  });

  // The results from the database contain information for chunks that exist in
  // the database, and also for chunks that do _not_ exist in the database. We
  // use the latter to remove chunks from disk if they no longer correspond to
  // a directory in the course. We differentiate between the two based on the
  // presence of an `id` field in the response.
  //
  // See the end of this function for more details.
  const validChunks = dbChunks.rows.filter((chunk) => chunk.id != null);
  const missingChunks = dbChunks.rows.filter((chunk) => chunk.id == null);

  // Now, ensure each individual chunk is loaded and untarred to the correct
  // place on disk.
  await async.eachLimit(validChunks, globalConfig.chunksMaxParallelDownload, async (chunk) => {
    const pendingChunkKey = `${courseId}-${chunk.uuid}`;
    const pendingChunkPromise = pendingChunksMap.get(pendingChunkKey);
    if (pendingChunkPromise) {
      // If this chunk is already being loaded, reuse the existing promise
      return pendingChunkPromise;
    }
    const chunkPromise = ensureChunk(courseId, chunk);
    pendingChunksMap.set(pendingChunkKey, chunkPromise);
    chunkPromise.finally(() => {
      // Once the promise has settled, remove it from our collection of
      // pending promises. This helps prevent memory leaks and, more
      // importantly, ensures we don't cache rejected promises - if loading
      // a chunk fails for some reason, this will ensure we try to load it
      // again the next time it's requested.
      pendingChunksMap.delete(pendingChunkKey);
    });
    return chunkPromise;
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
  // At this time, we only do this for `elements`, `elementExtensions`,
  // `serverFilesCourse`, and `clientFilesCourse`, since it's critical that they
  // not be present on disk if they're removed from a course. If it becomes
  // necessary to handle additional chunks in the future, this code can easily
  // be extended to support that.
  //
  // See https://github.com/PrairieLearn/PrairieLearn/issues/4692 for more details.
  const courseChunksDirs = module.exports.getChunksDirectoriesForCourseId(courseId);
  await Promise.all(
    missingChunks.map(async (chunk) => {
      // Blindly remove this chunk from disk - if it doesn't exist, `fs.remove`
      // will silently no-op.
      const chunkMetadata = module.exports.chunkMetadataFromDatabaseChunk(chunk);
      await fs.remove(module.exports.coursePathForChunk(courseChunksDirs.course, chunkMetadata));
    })
  );
};
module.exports.ensureChunksForCourse = util.callbackify(module.exports.ensureChunksForCourseAsync);

/**
 * Get the list of template question IDs for a given question.
 *
 * @param {Object} question - A question object.
 * @returns {Promise<string[]>} - Array of question IDs that are (recursive) templates for the given question (may be an empty array).
 */
module.exports.getTemplateQuestionIdsAsync = async (question) => {
  if (!question.template_directory) return [];
  const result = await sqlDb.queryAsync(sql.select_template_question_ids, {
    question_id: question.id,
  });
  const questionIds = result.rows.map((r) => r.id);
  return questionIds;
};
module.exports.getTemplateQuestionIds = util.callbackify(
  module.exports.getTemplateQuestionIdsAsync
);
