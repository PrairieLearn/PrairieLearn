import * as path from 'path';

import { assert } from 'chai';
import * as cheerio from 'cheerio';
import { execa } from 'execa';
import fs from 'fs-extra';
import klaw from 'klaw';
import fetch from 'node-fetch';
import * as tmp from 'tmp';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = {};

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

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
    formSelector: 'form[name="add-question-form"]',
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
    formSelector: '#deleteQuestionModal',
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
    button: '#copyQuestionButton',
    formSelector: 'form[name="copy-question-form"]',
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
    formSelector: '#deleteQuestionModal',
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
    formSelector: 'form[name="add-assessment-form"]',
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
    formSelector: '#deleteAssessmentModal',
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
    formSelector: 'form[name="copy-assessment-form"]',
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
    formSelector: '#deleteAssessmentModal',
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
    formSelector: 'form[name="add-course-instance-form"]',
    action: 'add_course_instance',
    info: 'courseInstances/New_1/infoCourseInstance.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/New_1/infoCourseInstance.json',
    ]),
  },
  {
    button: '.js-change-id-button',
    formSelector: 'form[name="change-id-form"]',
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
    formSelector: '#deleteCourseInstanceModal',
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
    formSelector: 'form[name="copy-course-instance-form"]',
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
    formSelector: '#deleteCourseInstanceModal',
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
    before('create test course files', async () => {
      await createCourseFiles();
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
        let elemList = locals.$(params.button);
        assert.lengthOf(elemList, 1);

        const $ = cheerio.load(elemList[0].attribs['data-content']);
        elemList = $(`${params.formSelector} input[name="__csrf_token"]`);
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.__csrf_token = elemList[0].attribs.value;
        assert.isString(locals.__csrf_token);
      } else {
        const elemList = locals.$(`${params.formSelector} input[name="__csrf_token"]`);
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

  describe('The job sequence', () => {
    it('should have an id', async () => {
      const result = await sqldb.queryOneRowAsync(sql.select_last_job_sequence, []);
      locals.job_sequence_id = result.rows[0].id;
    });
    it('should complete', async () => {
      await helperServer.waitForJobSequenceSuccess(locals.job_sequence_id);
    });
  });

  describe('validate', () => {
    it('should not have any sync warnings or errors', async () => {
      const results = await sqldb.queryAsync(sql.select_sync_warnings_and_errors, {
        course_path: courseLiveDir,
      });
      assert.isEmpty(results.rows);
    });

    it('should pull into dev directory', async () => {
      await execa('git', ['pull'], {
        cwd: courseDevDir,
        env: process.env,
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

async function createCourseFiles() {
  await deleteCourseFiles();
  // Ensure that the default branch is master, regardless of how git
  // is configured on the host machine.
  await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
    cwd: '.',
    env: process.env,
  });
  await execa('git', ['clone', courseOriginDir, courseLiveDir], {
    cwd: '.',
    env: process.env,
  });
  await fs.copy(courseTemplateDir, courseLiveDir, { overwrite: false });
  await execa('git', ['add', '-A'], {
    cwd: courseLiveDir,
    env: process.env,
  });
  await execa('git', ['commit', '-m', 'initial commit'], {
    cwd: courseLiveDir,
    env: process.env,
  });
  await execa('git', ['push'], {
    cwd: courseLiveDir,
    env: process.env,
  });
  await execa('git', ['clone', courseOriginDir, courseDevDir], {
    cwd: '.',
    env: process.env,
  });
}

async function deleteCourseFiles() {
  await fs.remove(courseOriginDir);
  await fs.remove(courseLiveDir);
  await fs.remove(courseDevDir);
}
