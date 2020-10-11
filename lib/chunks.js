// @ts-check
const AWS = require('aws-sdk');
const async = require('async');
const child_process = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const PassThroughStream = require('stream').PassThrough;
const tar = require('tar');
const util = require('util');
const { v4: uuidv4 } = require('uuid');
const { chalk, chalkDim } = require('../lib/chalk');

const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const namedLocks = require('../lib/named-locks');
const courseDB = require('../sync/course-db');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');

const globalConfig = require('./config');

const sql = sqlLoader.loadSqlEquiv(__filename);

/** @typedef {"elements" | "clientFilesCourse" | "serverFilesCourse" | "clientFilesCourseInstance" | "clientFilesAssessment" | "question"} ChunkType */

/**
 * @typedef {Object} ChunkMetadata
 * @property {ChunkType} type The type of this particular chunk
 * @property {string} [questionName] The question name (QID) of a chunk, if applicable
 * @property {string} [questionUuid] The question UUID of a chunk, if applicable
 * @property {string} [courseInstanceName] The course instance name of a chunk, if applicable
 * @property {string} [courseInstanceUuid] The course instance UUID of a chunk, if applicable
 * @property {string} [assessmentName] The assessment name (TID) of a chunk, if applicable
 * @property {string} [assessmentUuid] the Assessment UUID of a chunk, if applicable
 */

/**
 * @typedef {Object} CourseInstanceChunks
 * @property {boolean} clientFilesCourseInstance
 * @property {Set<string>} assessments
 */

/**
 * @typedef {Object} CourseChunks
 * @property {boolean} elements
 * @property {boolean} clientFilesCourse
 * @property {boolean} serverFilesCourse
 * @property {Set<string>} questions
 * @property {{ [id: string]: CourseInstanceChunks }} courseInstances
 */

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
        { cwd: coursePath },
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
        clientFilesCourse: false,
        serverFilesCourse: false,
        courseInstances: {},
        questions: new Set(),
    };

    changedFiles.forEach(changedFile => {
        if (changedFile.startsWith('elements/')) {
            courseChunks.elements = true;
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
                const courseInstanceId = path.join(...pathComponents.slice(0, clientFilesCourseInstanceIndex));
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
                const assessmentId = path.join(...pathComponents.slice(assessmentsIndex + 1, clientFilesAssessmentIndex));

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
    const result = await sqlDb.queryAsync(sql.select_course_chunks, { course_id: courseId });
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
 * @returns {Promise<ChunkMetadata[]>}
 */
module.exports.identifyChunksToGenerate = async ({ coursePath, courseId, courseData, changedFiles }) => {
    const rawCourseChunks = await module.exports.getAllChunksForCourse(courseId);

    // Build a data structure from the result of getAllChunksForCourse so that
    // we can efficiently query to see if a given chunk exists
    /** @type {CourseChunks} */
    const existingCourseChunks = {
        elements: false,
        serverFilesCourse: false,
        clientFilesCourse: false,
        courseInstances: {},
        questions: new Set(),
    };

    rawCourseChunks.forEach(courseChunk => {
        switch (courseChunk.type) {
            case 'elements':
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

    const changedCourseChunks = module.exports.identifyChunksFromChangedFiles(changedFiles, courseData);

    // Now, let's compute the set of chunks that we need to generate
    /** @type {ChunkMetadata[]} */
    const chunksToGenerate = [];

    // First: elements, clientFilesCourse, and serverFilesCourse
    await async.each(['elements', 'clientFilesCourse', 'serverFilesCourse'], async (/** @type {"elements" | "clientFilesCourse" | "serverFilesCourse"} */ chunkType) => {
        const hasChunkDirectory = await fs.pathExists(path.join(coursePath, chunkType));
        if (hasChunkDirectory && (!existingCourseChunks[chunkType] || changedCourseChunks[chunkType])) {
            chunksToGenerate.push({ type: chunkType });
        }
    });

    // Next: questions
    Object.entries(courseData.questions).forEach(([qid, questionInfo]) => {
        if (!existingCourseChunks.questions.has(qid) || changedCourseChunks.questions.has(qid)) {
            chunksToGenerate.push({
                type: 'question',
                questionName: qid,
                questionUuid: questionInfo.uuid,
            });
        }
    });

    // Next: course instances and their assessments
    await async.each(Object.entries(courseData.courseInstances), async ([ciid, courseInstanceInfo]) => {
        const hasClientFilesCourseInstanceDirectory = await fs.pathExists(
            path.join(coursePath, 'courseInstances', ciid, 'clientFilesCourseInstance'),
        );
        if (hasClientFilesCourseInstanceDirectory && (
            (!existingCourseChunks.courseInstances[ciid] ||
             !existingCourseChunks.courseInstances[ciid].clientFilesCourseInstance) ||
                (changedCourseChunks.courseInstances[ciid] &&
                 changedCourseChunks.courseInstances[ciid].clientFilesCourseInstance)
        )) {
            chunksToGenerate.push({
                type: 'clientFilesCourseInstance',
                courseInstanceName: ciid,
                courseInstanceUuid: courseInstanceInfo.courseInstance.uuid,
            });
        }

        await async.each(Object.entries(courseInstanceInfo.assessments), async ([tid, assessmentInfo]) => {
            const hasClientFilesAssessmentDirectory = await fs.pathExists(
                path.join(coursePath, 'courseInstances', ciid, 'assessments', tid, 'clientFilesAssessment'),
            );
            if (hasClientFilesAssessmentDirectory && (
                (!existingCourseChunks.courseInstances[ciid] ||
                 !existingCourseChunks.courseInstances[ciid].assessments ||
                 !existingCourseChunks.courseInstances[ciid].assessments.has(tid)) ||
                    (changedCourseChunks.courseInstances[ciid] &&
                     changedCourseChunks.courseInstances[ciid].assessments &&
                     changedCourseChunks.courseInstances[ciid].assessments.has(tid))
            )) {
                chunksToGenerate.push({
                    type: 'clientFilesAssessment',
                    courseInstanceName: ciid,
                    assessmentName: tid,
                    courseInstanceUuid: courseInstanceInfo.courseInstance.uuid,
                    assessmentUuid: assessmentInfo.uuid,

                });
            }
        });
    });

    return chunksToGenerate;
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
        let chunkDirectory;
        switch (chunk.type) {
        case 'elements':
        case 'clientFilesCourse':
        case 'serverFilesCourse':
            chunkDirectory = path.join(coursePath, chunk.type);
            break;
        case 'question':
            chunkDirectory = path.join(coursePath, 'questions', chunk.questionName);
            break;
        case 'clientFilesCourseInstance':
            chunkDirectory = path.join(
                coursePath,
                'courseInstances',
                chunk.courseInstanceName,
                'clientFilesCourseInstance',
            );
            break;
        case 'clientFilesAssessment':
            chunkDirectory = path.join(
                coursePath,
                'courseInstances',
                chunk.courseInstanceName,
                'assessments',
                chunk.assessmentName,
                'clientFilesAssessment',
            );
            break;
        }

        // Generate a UUId for this chunk
        const chunkUuid = uuidv4();

        // Let's create a tarball for this chunk and send it off to S3
        const tarball = tar.create({
            gzip: true,
            cwd: chunkDirectory,
        }, ['.']);

        const passthrough = new PassThroughStream();
        tarball.pipe(passthrough);

        const params = {
            Bucket: globalConfig.chunksS3Bucket,
            Key: `${chunkUuid}.tar.gz`,
            Body: passthrough,
        };
        const s3 = new AWS.S3(globalConfig.awsServiceGlobalOptions);
        await s3.upload(params).promise();

        generatedChunks.push({ ...chunk, uuid: chunkUuid });
    });

    // Now that the new chunks have been uploaded, update their status in the database
    await sqlDb.callAsync('chunks_insert', [courseId, generatedChunks]);
};


/**
 * Returns the absolute path to the chunks directory for the given course ID.
 * The "chunks directory" is the root of the directory tree where chunks are
 * unzipped to construct a directory hierarchy that mimics that of the source
 * repo.
 *
 * @param {string} courseId The ID of the course in question
 */
module.exports.getChunksDirectoryForCourseId = (courseId) => {
    return path.join(os.tmpdir(), 'pl-chunked-courses', `course-${courseId}`);
};

/**
 * Returns the absolute path to the course directory that should be used at
 * runtime for things like serving course files, executing question code, etc.
 * If chunks are enabled, this will be same as the return value of
 * `getChunksDirectoryForCourseId`. Otherwise, this returns the path of the
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
        return module.exports.getChunksDirectoryForCourseId(course.id);
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
 */
module.exports.createChunksSymlinks = async ({ coursePath, courseId, courseData }) =>  {
    // Ensure we have a directory to create symlinks in
    const chunksDirectory = module.exports.getChunksDirectoryForCourseId(courseId);
    await fs.ensureDir(chunksDirectory);

    const relativeSymlink = async (relativePath) => {
        const targetPath = path.join(coursePath, relativePath);
        const sourcePath = path.join(chunksDirectory, relativePath);

        if (!(await fs.pathExists(targetPath))) return;

        // Note that this will also create any parent directories, if needed
        await fs.ensureSymlink(targetPath, sourcePath);
    };

    await relativeSymlink('elements');
    await relativeSymlink('serverFilesCourse');
    await relativeSymlink('clientFilesCourse');

    // Handle clientFilesCourseInstance and clientFilesAssessment
    await async.each(Object.keys(courseData.courseInstances), async (courseInstanceDir) => {
        await relativeSymlink(path.join('courseInstances', courseInstanceDir, 'clientFilesCourseInstance'));
        await async.each(Object.keys(courseData.courseInstances[courseInstanceDir].assessments), async (assessmentDir) => {
            await relativeSymlink(path.join('courseInstances', courseInstanceDir, 'assessments', assessmentDir, 'clientFilesAssessment'));
        });
    });

    // Handle questions
    await async.each(Object.keys(courseData.questions), async (questionDir) => {
        await relativeSymlink(path.join('questions', questionDir));
    });
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
module.exports.updateChunksForCourse = async ({ coursePath, courseId, courseData, oldHash, newHash }) => {
    let changedFiles = [];
    if (oldHash && newHash) {
        changedFiles = await module.exports.identifyChangedFiles(coursePath, oldHash, newHash);
    }

    const chunksToGenerate = await module.exports.identifyChunksToGenerate({
        coursePath,
        courseId,
        courseData,
        changedFiles,
    });

    await module.exports.createAndUploadChunks(coursePath, courseId, chunksToGenerate);
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
    module.exports._generateAllChunksForCourseListWithJobSequence(course_ids, authn_user_id, job_sequence_id);

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
module.exports._generateAllChunksForCourseListWithJobSequence = async (course_ids, authn_user_id, job_sequence_id) => {
    try {
        for (let i = 0; i < course_ids.length; i++) {
            const course_id = course_ids[i];
            const jobOptions = {
                course_id: null, /* Set the job's course_id to null so we can find it from the admin page */
                type: 'generate_all_chunks',
                description: `Generate all chunks for course ID = ${course_id}`,
                job_sequence_id,
                user_id: authn_user_id,
                authn_user_id,
                last_in_sequence: (i == course_ids.length - 1),
            };
            const job = await serverJobs.createJobAsync(jobOptions);
            job.info(chalkDim(`Course ID = ${course_id}`));

            try {
                await module.exports._generateAllChunksForCourseWithJob(course_id, authn_user_id, job);
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
 * @param {number} authn_user_id
 * @param {object} job
 */
module.exports._generateAllChunksForCourseWithJob = async (course_id, authn_user_id, job) => {
    job.info(chalk.bold(`Looking up course directory`));
    const result = await sqlDb.queryOneRowAsync(sql.select_course_dir, {course_id});
    let courseDir = result.rows[0].path;
    job.info(chalkDim(`Found course directory = ${courseDir}`));
    courseDir = path.resolve(process.cwd(), courseDir);
    job.info(chalkDim(`Resolved course directory = ${courseDir}`));

    const lockName = 'coursedir:' + courseDir;
    job.info(chalk.bold(`Acquiring lock ${lockName}`));
    const lock = await namedLocks.waitLockAsync(lockName, {});
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

    await namedLocks.releaseLockAsync(lock);
    job.info(chalkDim(`Released lock`));

    job.info(chalk.green(`Successfully generated chunks for course ID = ${course_id}`));
};

/**
 * @typedef {Object} ElementsChunk
 * @property {"elements"} type
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
 * @property {string} courseInstanceId
 */

/**
 * @typedef {Object} ClientFilesAssessmentChunk
 * @property {"clientFilesAssessment"} type
 * @property {string} courseInstanceId
 * @property {string} assessmentId
 */

/**
 * @typedef {Object} QuestionChunk
 * @property {"question"} type
 * @property {string} questionId
 */

/** @typedef {ElementsChunk | ClientFilesCourseChunk | ServerFilesCourseChunk | ClientFilesCourseInstanceChunk | ClientFilesAssessmentChunk | QuestionChunk} Chunk */

/**
 * @typedef {Object} DatabaseChunk
 * @property {ChunkType} type
 * @property {string} uuid
 * @property {string} course_instance_name
 * @property {string} assessment_name
 * @property {string} question_name
 */

/**
 *
 * @param {string} courseId
 * @param {DatabaseChunk} chunk
 */
const ensureChunk = async (courseId, chunk) => {
    const courseChunksDir = module.exports.getChunksDirectoryForCourseId(courseId);
    const chunkPath = path.join(courseChunksDir, 'chunks', `${chunk.uuid}.tar.gz`);
    const chunkExists = await fs.pathExists(chunkPath);
    if (chunkExists) {
        // If the chunk is on disk, it must have been untarred to the correct
        // place already. We're good to go!
        return;
    }

    // Otherwise, we need to download and untar the chunk. We'll download it
    // to a staging path first, then rename it to remove the `-staging` from
    // its name.
    const chunkStagingPath = path.join(courseChunksDir, 'chunks', `${chunk.uuid}-staging.tar.gz`);
    const params = {
        Bucket: globalConfig.chunksS3Bucket,
        Key: `${chunk.uuid}.tar.gz`,
    };
    await fs.ensureDir(path.dirname(chunkStagingPath));
    const s3 = new AWS.S3(globalConfig.awsServiceGlobalOptions);
    await new Promise((resolve, reject) => {
        s3.getObject(params)
            .createReadStream()
            .on('error', err => {logger.error(`Could not download chunk ${chunk.uuid}: ${err}`); reject(err);})
            .on('end', () => resolve())
            .pipe(fs.createWriteStream(chunkStagingPath));
    });

    // Once the chunk has been loaded, we need to untar it.
    let targetDirectory;
    switch (chunk.type) {
        case 'elements':
        case 'serverFilesCourse':
        case 'clientFilesCourse':
            targetDirectory = path.join(courseChunksDir, chunk.type);
            break;
        case 'clientFilesCourseInstance':
            targetDirectory = path.join(
                courseChunksDir,
                'courseInstances',
                chunk.course_instance_name,
                'clientFilesCourseInstance',
            );
            break;
        case 'clientFilesAssessment':
            targetDirectory = path.join(
                courseChunksDir,
                'courseInstances',
                chunk.course_instance_name,
                'assessments',
                chunk.assessment_name,
                'clientFilesAssessment',
            );
            break;
        case 'question':
            targetDirectory = path.join(courseChunksDir, 'questions', chunk.question_name);
            break;
    }
    // In case this is an updated chunk for a directory we already have on disk,
    // remove the existing directory to ensure a clean slate.
    await fs.remove(targetDirectory);
    await fs.ensureDir(targetDirectory);
    await tar.extract({
        file: chunkStagingPath,
        cwd: targetDirectory,
    });

    // Finally, rename to remove the `-staging` from the name.
    await fs.move(chunkStagingPath, chunkPath);
};

/** @type {Map<string, Promise>} */
const pendingChunksMap = new Map();

/**
 * Ensures that specific chunks for a course are loaded. These chunks will either be pulled
 * from S3 if they do not exist, or the existing on-disk chunks will be used if they are
 * still the latest version.
 *
 * @param {string} courseId
 * @param {Chunk | Chunk[]} chunks to load.  This can either be a single chunk or an array of chunks.
 */
module.exports.ensureChunksForCourseAsync = async (courseId, chunks) => {
    if (!globalConfig.chunksConsumer) {
        /* We only need to worry if we are a chunk consumer server */
        return;
    }

    if (!Array.isArray(chunks)) {
        chunks = [chunks];
    }

    // First, query the database to identify the UUID + associated name(s) of each desired chunk
    // "Names" in this case referrs to question/course instance/assessment names.
    const dbChunks = await sqlDb.queryAsync(sql.select_metadata_for_chunks, {
        course_id: courseId,
        chunks_arr: JSON.stringify(chunks),
    });

    // Now, ensure each individual chunk is loaded and untarred to the correct
    // place on disk.
    await async.eachLimit(dbChunks.rows, globalConfig.chunksMaxParallelDownload, async (chunk) => {
        const pendingChunkKey = `${courseId}-${chunk.uuid}`;
        const pendingChunkPromise = pendingChunksMap.get(pendingChunkKey);
        if (pendingChunkPromise) {
            // If this chunk is already being loaded, reuse the existing promise
            return pendingChunkPromise;
        }
        const chunkPromise = ensureChunk(courseId, chunk);
        pendingChunksMap.set(pendingChunkKey, chunkPromise);
        return chunkPromise;
    });
};
module.exports.ensureChunksForCourse = util.callbackify(module.exports.ensureChunksForCourseAsync);
