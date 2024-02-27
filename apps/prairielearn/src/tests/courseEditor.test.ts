import ERR = require('async-stacktrace');
import { assert } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as async from 'async';
import * as cheerio from 'cheerio';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import klaw = require('klaw');
import * as tmp from 'tmp';

import { config } from '../lib/config';
import * as sqldb from '@prairielearn/postgres';
import * as helperServer from './helperServer';

const sql = sqldb.loadSqlEquiv(__filename);

const locals: Record<string, any> = {};

const courseTemplateDir = path.join(__dirname, 'testFileEditor', 'courseTemplate');

// Set up temporary writeable directories for course content
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const courseDir = courseLiveDir;

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1/instructor';

const questionsUrl = `${courseInstanceUrl}/course_admin/questions`;
const assessmentsUrl = `${courseInstanceUrl}/instance_admin/assessments`;
const courseInstancesUrl = `${courseInstanceUrl}/course_admin/instances`;

const testEditData = [
  {
    url: questionsUrl,
    form: 'add-question-form',
    action: 'add_question',
    info: 'questions/New_1/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'questions/New_1/info.json',
      'questions/New_1/question.html',
      'questions/New_1/server.py',
    ]),
  },
  {
    button: 'changeQidButton',
    form: 'change-id-form',
    data: {
      id: 'newQuestion',
    },
    action: 'change_id',
    info: 'questions/newQuestion/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'questions/newQuestion/info.json',
      'questions/newQuestion/question.html',
      'questions/newQuestion/server.py',
    ]),
  },
  {
    form: 'delete-question-form',
    action: 'delete_question',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
  {
    url: `${courseInstanceUrl}/question/1/settings`,
    button: 'copyQuestionButton',
    form: 'copy-question-form',
    data: {
      to_course_id: 1,
    },
    action: 'copy_question',
    info: 'questions/test/question_copy1/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'questions/test/question_copy1/info.json',
      'questions/test/question_copy1/question.html',
      'questions/test/question_copy1/server.py',
    ]),
  },
  {
    form: 'delete-question-form',
    action: 'delete_question',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
  {
    url: assessmentsUrl,
    form: 'add-assessment-form',
    action: 'add_assessment',
    info: 'courseInstances/Fa18/assessments/New_1/infoAssessment.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18/assessments/New_1/infoAssessment.json',
    ]),
  },
  {
    button: 'changeAidButton',
    form: 'change-id-form',
    data: {
      id: 'newAssessment/nested',
    },
    action: 'change_id',
    info: 'courseInstances/Fa18/assessments/newAssessment/nested/infoAssessment.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18/assessments/newAssessment/nested/infoAssessment.json',
    ]),
  },
  // This second rename specifically tests the case where an existing assessment
  // is renamed such that it leaves behind an empty directory. We want to make
  // sure that that empty directory is cleaned up and not treated as an actual
  // assessment during sync.
  {
    button: 'changeAidButton',
    form: 'change-id-form',
    data: {
      id: 'newAssessmentNotNested',
    },
    action: 'change_id',
    info: 'courseInstances/Fa18/assessments/newAssessmentNotNested/infoAssessment.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18/assessments/newAssessmentNotNested/infoAssessment.json',
    ]),
  },
  {
    form: 'delete-assessment-form',
    action: 'delete_assessment',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
  {
    url: `${courseInstanceUrl}/assessment/1/settings`,
    form: 'copy-assessment-form',
    action: 'copy_assessment',
    info: 'courseInstances/Fa18/assessments/HW1_copy1/infoAssessment.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18/assessments/HW1_copy1/infoAssessment.json',
    ]),
  },
  {
    form: 'delete-assessment-form',
    action: 'delete_assessment',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
  {
    url: courseInstancesUrl,
    form: 'add-course-instance-form',
    action: 'add_course_instance',
    info: `courseInstances/New_1/infoCourseInstance.json`,
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      `courseInstances/New_1/infoCourseInstance.json`,
    ]),
  },
  {
    button: 'changeCiidButton',
    form: 'change-id-form',
    data: {
      id: 'newCourseInstance',
    },
    action: 'change_id',
    info: 'courseInstances/newCourseInstance/infoCourseInstance.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/newCourseInstance/infoCourseInstance.json',
    ]),
  },
  {
    form: 'delete-course-instance-form',
    action: 'delete_course_instance',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
  {
    url: `${courseInstanceUrl}/instance_admin/settings`,
    form: 'copy-course-instance-form',
    action: 'copy_course_instance',
    info: 'courseInstances/Fa18_copy1/infoCourseInstance.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18_copy1/infoCourseInstance.json',
      'courseInstances/Fa18_copy1/assessments/HW1/infoAssessment.json',
    ]),
  },
  {
    form: 'delete-course-instance-form',
    action: 'delete_course_instance',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
    ]),
  },
];

describe('test course editor', function () {
  this.timeout(20000);

  describe('not the example course', function () {
    before('create test course files', function (callback) {
      createCourseFiles((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });

    before('set up testing server', helperServer.before(courseDir));

    before('update course repository in database', async () => {
      await sqldb.queryAsync(sql.update_course_repository, {
        course_path: courseLiveDir,
        course_repository: courseOriginDir,
      });
    });

    after('shut down testing server', helperServer.after);

    after('delete test course files', async () => {
      await deleteCourseFiles();
    });

    describe('the locals object', function () {
      it('should be cleared', function () {
        for (const prop in locals) {
          delete locals[prop];
        }
      });
    });

    describe('verify edits', function () {
      testEditData.forEach((element) => {
        testEdit(element);
      });
    });
  });
});

async function getFiles(options): Promise<Set<string>> {
  const files = new Set<string>();

  const ignoreHidden = (item) => {
    const basename = path.basename(item);
    return basename === '.' || basename[0] !== '.';
  };

  const walker = klaw(options.baseDir, { filter: ignoreHidden });

  options.ignoreDirs = options.ignoreDirs || [];

  walker.on('readable', () => {
    for (;;) {
      const item = walker.read();
      if (!item) {
        break;
      }
      if (!item.stats.isDirectory()) {
        const relPath = path.relative(options.baseDir, item.path);
        const prefix = relPath.split(path.sep)[0];
        if (!options.ignoreDirs.includes(prefix)) {
          files.add(relPath);
        }
      }
    }
  });

  return new Promise((resolve, reject) => {
    walker.on('error', (err) => {
      reject(err);
    });

    walker.on('end', () => {
      resolve(files);
    });
  });
}

function testEdit(params) {
  describe(`GET to ${params.url}`, () => {
    if (params.url) {
      it('should load successfully', async () => {
        const res = await fetch(params.url);
        assert.isOk(res.ok);
        locals.$ = cheerio.load(await res.text());
      });
    }
    it('should have a CSRF token', () => {
      if (params.button) {
        let elemList = locals.$(`button[id="${params.button}"]`);
        assert.lengthOf(elemList, 1);

        const $ = cheerio.load(elemList[0].attribs['data-content']);
        elemList = $(`form[name="${params.form}"] input[name="__csrf_token"]`);
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.__csrf_token = elemList[0].attribs.value;
        assert.isString(locals.__csrf_token);
      } else {
        const elemList = locals.$(`form[name="${params.form}"] input[name="__csrf_token"]`);
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.__csrf_token = elemList[0].attribs.value;
        assert.isString(locals.__csrf_token);
      }
    });
  });

  describe(`POST to ${params.url} with action ${params.action}`, function () {
    it('should load successfully', async () => {
      const form = {
        __action: params.action,
        __csrf_token: locals.__csrf_token,
        ...(params?.data ?? {}),
      };
      const res = await fetch(params.url || locals.url, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
      locals.url = res.url;
      locals.$ = cheerio.load(await res.text());
    });
  });

  waitForJobSequence(locals, 'Success');

  describe('validate', () => {
    it('should not have any sync warnings or errors', async () => {
      const results = await sqldb.queryAsync(sql.select_sync_warnings_and_errors, {
        course_path: courseLiveDir,
      });
      assert.isEmpty(results.rows);
    });

    it('should pull into dev directory', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec(`git pull`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });

    it('should have correct contents', async () => {
      const files = await getFiles({ baseDir: courseDevDir });
      assert.sameMembers([...files], [...params.files]);
    });

    if (params.info) {
      it('should have a uuid', async () => {
        const contents = await fs.readFile(path.join(courseDevDir, params.info), 'utf-8');
        const infoJson = JSON.parse(contents);
        assert.isString(infoJson.uuid);
      });
    }
  });
}

function createCourseFiles(callback) {
  async.series(
    [
      async () => await deleteCourseFiles(),
      (callback) => {
        const execOptions = {
          cwd: '.',
          env: process.env,
        };
        // Ensure that the default branch is master, regardless of how git
        // is configured on the host machine.
        exec(
          `git -c "init.defaultBranch=master" init --bare ${courseOriginDir}`,
          execOptions,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          },
        );
      },
      (callback) => {
        const execOptions = {
          cwd: '.',
          env: process.env,
        };
        exec(`git clone ${courseOriginDir} ${courseLiveDir}`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      async () => {
        await fs.copy(courseTemplateDir, courseLiveDir, { overwrite: false });
      },
      (callback) => {
        const execOptions = {
          cwd: courseLiveDir,
          env: process.env,
        };
        exec(`git add -A`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        const execOptions = {
          cwd: courseLiveDir,
          env: process.env,
        };
        exec(`git commit -m "initial commit"`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        const execOptions = {
          cwd: courseLiveDir,
          env: process.env,
        };
        exec(`git push`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        const execOptions = {
          cwd: '.',
          env: process.env,
        };
        exec(`git clone ${courseOriginDir} ${courseDevDir}`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
}

async function deleteCourseFiles() {
  await fs.remove(courseOriginDir);
  await fs.remove(courseLiveDir);
  await fs.remove(courseDevDir);
}

function waitForJobSequence(locals, expectedResult) {
  describe('The job sequence', function () {
    it('should have an id', function (callback) {
      sqldb.queryOneRow(sql.select_last_job_sequence, [], (err, result) => {
        if (ERR(err, callback)) return;
        locals.job_sequence_id = result.rows[0].id;
        callback(null);
      });
    });
    it('should complete', function (callback) {
      const checkComplete = function () {
        const params = { job_sequence_id: locals.job_sequence_id };
        sqldb.queryOneRow(sql.select_job_sequence, params, (err, result) => {
          if (ERR(err, callback)) return;
          locals.job_sequence_status = result.rows[0].status;
          if (locals.job_sequence_status === 'Running') {
            setTimeout(checkComplete, 10);
          } else {
            callback(null);
          }
        });
      };
      setTimeout(checkComplete, 10);
    });
    it(`should have result "${expectedResult}"`, function () {
      assert.equal(locals.job_sequence_status, expectedResult);
    });
  });
}
