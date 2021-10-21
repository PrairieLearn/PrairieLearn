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

  describe('deletes chunks that are no longer needed', function () {
    this.timeout(60000);

    /** @type {tmp.DirectoryResult} */
    let tempTestCourseDir;
    let courseId;

    before('set up testing server', async () => {
      // We need to modify the test course - create a copy that we can
      // safely manipulate.
      tempTestCourseDir = await tmp.dir({ unsafeCleanup: true });
      await fs.copy(path.resolve(__dirname, '..', 'testCourse'), tempTestCourseDir.path, {
        overwrite: true,
      });

      config.chunksConsumer = true;

      await util.promisify(helperServer.before(tempTestCourseDir.path).bind(this))();

      // Find the ID of this course
      const results = await sqldb.queryOneRowAsync(sql.select_course_by_path, {
        course_path: tempTestCourseDir.path,
      });
      courseId = results.rows[0].id;
    });

    after('shut down testing server', async () => {
      await tempTestCourseDir.cleanup();
      await util.promisify(helperServer.after.bind(this))();

      config.chunksConsumer = false;
    });

    it('deletes chunks that are no longer needed', async () => {
      const course_ids = [courseId];
      const authn_user_id = 1;

      // Generate chunks for the example course
      await chunksLib.generateAllChunksForCourseList(course_ids, authn_user_id);
    });
  });
});
