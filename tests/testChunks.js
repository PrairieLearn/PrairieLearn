// @ts-check
const assert = require('chai').assert;
const util = require('util');
const tmp = require('tmp-promise');
const fs = require('fs-extra');
const path = require('path');

const chunksLib = require('../lib/chunks');
const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

const COURSE = {
  course: {},
  questions: {
    'simple-question': {},
    'complex/question': {},
  },
  courseInstances: {
    'simple-course-instance': {
      courseInstance: {},
      assessments: {
        'simple-assessment': {},
        'complex/assessment': {},
      },
    },
    'complex/course/instance': {
      courseInstance: {},
      assessments: {
        'simple-assessment': {},
        'complex/assessment': {},
      },
    },
  },
};

describe('chunks', () => {
  describe('identifyChunksFromChangedFiles', () => {
    it('should identify change in element', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['elements/my-special-element/impl.py'],
        COURSE
      );
      assert.isOk(chunks.elements);
    });

    it('should identify change in clientFilesCourse', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['clientFilesCourse/path/to/file.js'],
        COURSE
      );
      assert.isOk(chunks.clientFilesCourse);
    });

    it('should identify change in serverFilesCourse', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['serverFilesCourse/path/to/file.js'],
        COURSE
      );
      assert.isOk(chunks.serverFilesCourse);
    });

    it('should identify simple question', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['questions/simple-question/tests/test.py'],
        COURSE
      );
      assert.isOk(chunks.questions.has('simple-question'));
    });

    it('should identify complex question', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['questions/complex/question/tests/test.py'],
        COURSE
      );
      assert.isOk(chunks.questions.has('complex/question'));
    });

    it('should identify simple assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/simple-course-instance/assessments/simple-assessment/clientFilesAssessment/file.txt',
        ],
        COURSE
      );
      assert.isOk(
        chunks.courseInstances['simple-course-instance'].assessments.has('simple-assessment')
      );
    });

    it('should identify complex assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/simple-course-instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE
      );
      assert.isOk(
        chunks.courseInstances['simple-course-instance'].assessments.has('complex/assessment')
      );
    });

    it('should identify simple assessment in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/simple-assessment/clientFilesAssessment/file.txt',
        ],
        COURSE
      );
      assert.isOk(
        chunks.courseInstances['complex/course/instance'].assessments.has('simple-assessment')
      );
    });

    it('should identify complex assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE
      );
      assert.isOk(
        chunks.courseInstances['complex/course/instance'].assessments.has('complex/assessment')
      );
    });

    it('should identify clientFilesCourseInstance in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/simple-course-instance/clientFilesCourseInstance/file.txt'],
        COURSE
      );
      assert.isOk(chunks.courseInstances['simple-course-instance'].clientFilesCourseInstance);
    });

    it('should identify clientFilesCourseInstance in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/complex/course/instance/clientFilesCourseInstance/file.txt'],
        COURSE
      );
      assert.isOk(chunks.courseInstances['complex/course/instance'].clientFilesCourseInstance);
    });
  });

  describe('chunkMetadataEqual', () => {
    it('works for chunks of different types', () => {
      assert.isNotOk(
        chunksLib.chunkMetadataEqual({ type: 'elements' }, { type: 'clientFilesCourse' })
      );
    });

    ['elements', 'elementExtensions', 'clientFilesCourse', 'serverFilesCourse'].forEach(
      (/** @type {chunksLib.ChunkType} */ type) => {
        it(`works for ${type} chunks`, () => {
          assert.isOk(chunksLib.chunkMetadataEqual({ type }, { type }));
        });
      }
    );

    it('works for clientFilesCourseInstance chunks', () => {
      assert.isOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'clientFilesCourseInstance',
            courseInstanceName: 'foo',
          },
          {
            type: 'clientFilesCourseInstance',
            courseInstanceName: 'foo',
          }
        )
      );

      assert.isNotOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'clientFilesCourseInstance',
            courseInstanceName: 'foo',
          },
          {
            type: 'clientFilesCourseInstance',
            courseInstanceName: 'bar',
          }
        )
      );
    });

    it('works for clientFilesAssessment chunks', () => {
      assert.isOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'foo',
            assessmentName: 'foo',
          },
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'foo',
            assessmentName: 'foo',
          }
        )
      );

      // Different courseInstanceName
      assert.isNotOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'foo',
            assessmentName: 'foo',
          },
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'bar',
            assessmentName: 'foo',
          }
        )
      );

      // Different assessmentName
      assert.isNotOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'foo',
            assessmentName: 'foo',
          },
          {
            type: 'clientFilesAssessment',
            courseInstanceName: 'foo',
            assessmentName: 'bar',
          }
        )
      );
    });

    it('works for question chunks', () => {
      assert.isOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'question',
            questionName: 'foo',
          },
          {
            type: 'question',
            questionName: 'foo',
          }
        )
      );

      assert.isNotOk(
        chunksLib.chunkMetadataEqual(
          {
            type: 'question',
            questionName: 'foo',
          },
          {
            type: 'question',
            questionName: 'bar',
          }
        )
      );
    });
  });

  describe('deletes chunks that are no longer needed', function () {
    this.timeout(60000);

    /** @type {tmp.DirectoryResult} */
    let tempTestCourseDir;
    /** @type {tmp.DirectoryResult} */
    let tempChunksDir;
    let originalChunksConsumerDirectory = config.chunksConsumerDirectory;
    let courseId;

    before('set up testing server', async () => {
      // We need to modify the test course - create a copy that we can
      // safely manipulate.
      tempTestCourseDir = await tmp.dir({ unsafeCleanup: true });
      await fs.copy(path.resolve(__dirname, '..', 'testCourse'), tempTestCourseDir.path, {
        overwrite: true,
      });

      // `testCourse` doesn't include an `elementExtensions` directory.
      // We add one here for the sake of testing.
      await fs.ensureDir(path.join(tempTestCourseDir.path, 'elementExtensions'));

      // We need to override the chunks directory too.
      tempChunksDir = await tmp.dir({ unsafeCleanup: true });

      config.chunksConsumerDirectory = tempChunksDir.path;
      config.chunksConsumer = true;

      await util.promisify(helperServer.before(tempTestCourseDir.path).bind(this))();

      // Find the ID of this course
      const results = await sqldb.queryOneRowAsync(sql.select_course_by_path, {
        course_path: tempTestCourseDir.path,
      });
      courseId = results.rows[0].id;
    });

    after('shut down testing server', async () => {
      try {
        await tempTestCourseDir.cleanup();
        await tempChunksDir.cleanup();
      } catch (err) {
        console.error(err);
      }
      await util.promisify(helperServer.after.bind(this))();

      config.chunksConsumer = false;
      config.chunksConsumerDirectory = originalChunksConsumerDirectory;
    });

    it('deletes chunks that are no longer needed', async () => {
      const course_ids = [courseId];
      const authn_user_id = 1;

      /** @type {import('../lib/chunks').Chunk[]} */
      const chunksToLoad = [
        {
          type: 'elements',
        },
        {
          type: 'elementExtensions',
        },
        {
          type: 'serverFilesCourse',
        },
        {
          type: 'clientFilesCourse',
        },
      ];

      // Generate chunks for the example course
      const jobId = await chunksLib.generateAllChunksForCourseList(course_ids, authn_user_id);
      await helperServer.waitForJobSequenceSuccessAsync(jobId);

      // Load and unpack chunks
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Assert that the unpacked chunks exist on disk
      const courseDir = chunksLib.getRuntimeDirectoryForCourse({ id: courseId, path: null });
      assert.isOk(await fs.pathExists(path.join(courseDir, 'elements')));
      assert.isOk(await fs.pathExists(path.join(courseDir, 'elementExtensions')));
      assert.isOk(await fs.pathExists(path.join(courseDir, 'serverFilesCourse')));
      assert.isOk(await fs.pathExists(path.join(courseDir, 'clientFilesCourse')));

      // Remove directories from the course
      await fs.remove(path.join(tempTestCourseDir.path, 'elements'));
      await fs.remove(path.join(tempTestCourseDir.path, 'elementExtensions'));
      await fs.remove(path.join(tempTestCourseDir.path, 'serverFilesCourse'));
      await fs.remove(path.join(tempTestCourseDir.path, 'clientFilesCourse'));

      // Regenerate chunks
      const newJobId = await chunksLib.generateAllChunksForCourseList(course_ids, authn_user_id);
      await helperServer.waitForJobSequenceSuccessAsync(newJobId);

      // Reload the chunks
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Assert that the chunks have been removed from disk
      assert.isNotOk(await fs.pathExists(path.join(courseDir, 'elements')));
      assert.isNotOk(await fs.pathExists(path.join(courseDir, 'elementExtensions')));
      assert.isNotOk(await fs.pathExists(path.join(courseDir, 'serverFilesCourse')));
      assert.isNotOk(await fs.pathExists(path.join(courseDir, 'clientFilesCourse')));
    });
  });
});
