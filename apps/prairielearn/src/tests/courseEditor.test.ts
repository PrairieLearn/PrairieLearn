import * as path from 'path';

import * as cheerio from 'cheerio';
import { execa } from 'execa';
import fs from 'fs-extra';
import klaw from 'klaw';
import fetch from 'node-fetch';
import * as tmp from 'tmp';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { config } from '../lib/config.js';
import { JobSequenceSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { updateCourseSharingName } from '../models/course.js';

import * as helperServer from './helperServer.js';
import * as syncUtil from './sync/util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

// Set up temporary writeable directories for course content
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const courseDir = courseLiveDir;

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const courseUrl = baseUrl + '/course/1';
const courseInstancesUrl = `${courseUrl}/course_admin/instances`;

const courseInstanceUrl = baseUrl + '/course_instance/1/instructor';

const questionsUrl = `${courseInstanceUrl}/course_admin/questions`;
const assessmentsUrl = `${courseInstanceUrl}/instance_admin/assessments`;

const newQuestionUrl = `${courseInstanceUrl}/question/2/settings`;
const newQuestionFromTemplateUrl = `${courseInstanceUrl}/question/3/settings`;
const newCourseInstanceUrl = baseUrl + '/course_instance/2/instructor';
const newCourseInstanceSettingsUrl = `${newCourseInstanceUrl}/instance_admin/settings`;

const newAssessmentUrl = `${courseInstanceUrl}/assessment/2`;
const newAssessmentSettingsUrl = `${newAssessmentUrl}/settings`;

interface EditData {
  url?: string;
  formSelector: string;
  button?: string;
  action?: string;
  files: Set<string>;
  info?: string;
  data?: Record<string, string | number>;
}

const testEditData: EditData[] = [
  {
    url: questionsUrl,
    formSelector: '#createQuestionModal',
    action: 'add_question',
    info: 'questions/New_1/info.json',
    data: {
      qid: 'New',
      title: 'New',
      start_from: 'empty',
    },
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
    // Create a question with a template question as the starting point
    url: questionsUrl,
    formSelector: '#createQuestionModal',
    action: 'add_question',
    info: 'questions/custom_id/info.json',
    data: {
      qid: 'custom_id',
      title: 'Custom Question',
      start_from: 'empty',
      template_qid: 'template/string-input/random',
    },
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
      'questions/custom_id/info.json',
      'questions/custom_id/question.html',
      'questions/custom_id/server.py',
    ]),
  },
  {
    url: newQuestionUrl,
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
      'questions/custom_id/info.json',
      'questions/custom_id/question.html',
      'questions/custom_id/server.py',
    ]),
  },
  {
    // Delete the question created from a template question
    url: newQuestionFromTemplateUrl,
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
    formSelector: '#createAssessmentModal',
    action: 'add_assessment',
    info: 'courseInstances/Fa18/assessments/New_1/infoAssessment.json',
    data: {
      title: 'New',
      aid: 'New',
      type: 'Homework',
      set: 'Homework',
    },
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
    url: newAssessmentSettingsUrl,
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
    formSelector: '#createCourseInstanceModal',
    action: 'add_course_instance',
    info: 'courseInstances/New_1/infoCourseInstance.json',
    data: {
      short_name: 'New',
      long_name: 'New',
    },
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
    url: newCourseInstanceSettingsUrl,
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

const publicCopyTestData: EditData[] = [
  {
    url: `${baseUrl}/public/course/2/question/2/preview`,
    formSelector: 'form.js-copy-question-form',
    data: {
      course_id: 2,
      question_id: 2,
    },
    info: 'questions/shared-publicly/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'questions/shared-publicly/info.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
    ]),
  },
  {
    url: `${baseUrl}/public/course_instance/2/assessments`,
    formSelector: 'form.js-copy-course-instance-form',
    data: {
      course_instance_id: 2,
    },
    info: 'questions/shared-publicly/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa19/infoCourseInstance.json',
      'questions/shared-publicly/info.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'questions/test-course/shared-source-publicly/info.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'courseInstances/Fa19/assessments/test/infoAssessment.json',
      'courseInstances/Fa19/assessments/nested/dir/test/infoAssessment.json',
    ]),
  },
  {
    url: `${baseUrl}/public/course_instance/2/assessments`,
    formSelector: 'form.js-copy-course-instance-form',
    data: {
      course_instance_id: 2,
    },
    info: 'questions/shared-publicly/info.json',
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa19/infoCourseInstance.json',
      'courseInstances/Fa19_copy1/infoCourseInstance.json',
      'questions/shared-publicly/info.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'questions/test-course/shared-source-publicly/info.json',
      'questions/test-course/shared-source-publicly_copy1/info.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'courseInstances/Fa19/assessments/test/infoAssessment.json',
      'courseInstances/Fa19_copy1/assessments/test/infoAssessment.json',
      'courseInstances/Fa19/assessments/nested/dir/test/infoAssessment.json',
      'courseInstances/Fa19_copy1/assessments/nested/dir/test/infoAssessment.json',
    ]),
  },
];

describe('test course editor', { timeout: 20_000 }, function () {
  describe('not the example course', function () {
    beforeAll(createCourseFiles);
    afterAll(deleteCourseFiles);

    beforeAll(helperServer.before(courseDir));
    afterAll(helperServer.after);

    beforeAll(async () => {
      await sqldb.queryAsync(sql.update_course_repository, {
        course_path: courseLiveDir,
        course_repository: courseOriginDir,
      });
    });

    describe('verify edits', function () {
      testEditData.forEach((element) => {
        testEdit(element);
      });
    });
  });

  describe('Copy from another course', function () {
    beforeAll(createCourseFiles);
    afterAll(deleteCourseFiles);

    beforeAll(helperServer.before(courseDir));
    afterAll(helperServer.after);

    beforeAll(async () => {
      await sqldb.queryAsync(sql.update_course_repository, {
        course_path: courseLiveDir,
        course_repository: courseOriginDir,
      });
      await features.enable('question-sharing');
      config.checkSharingOnSync = true;
    });

    afterAll(() => {
      config.checkSharingOnSync = false;
    });

    beforeAll(createSharedCourse);

    beforeAll(async () => {
      await updateCourseSharingName({ course_id: 2, sharing_name: 'test-course' });
    });

    describe('verify edits', async function () {
      publicCopyTestData.forEach((element) => {
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

// Some tests follow a redirect, and so we have a couple of globals to keep
// information about the current page to persist to the next test
let currentUrl: string;
let currentPage$: cheerio.CheerioAPI;
function testEdit(params: EditData) {
  let __csrf_token: string;
  describe(`GET to ${params.url}`, () => {
    if (params.url) {
      const url = params.url;
      it('should load successfully', async () => {
        const res = await fetch(url);

        assert.isOk(res.ok);
        currentPage$ = cheerio.load(await res.text());
      });
    }
    it('should have a CSRF token', () => {
      let maybeToken: string | undefined;
      if (params.button) {
        let elem = currentPage$(params.button);
        assert.lengthOf(elem, 1);
        const formContent = elem.attr('data-bs-content');
        assert.ok(formContent);
        const $ = cheerio.load(formContent);
        elem = $(`${params.formSelector} input[name="__csrf_token"]`);
        assert.lengthOf(elem, 1);
        maybeToken = elem.attr('value');
      } else {
        const elem = currentPage$(`${params.formSelector} input[name="__csrf_token"]`);
        assert.lengthOf(elem, 1);
        maybeToken = elem.attr('value');
      }
      assert.ok(maybeToken);
      __csrf_token = maybeToken;
    });
  });

  describe(`POST to ${params.url} with action ${params.action}`, function () {
    it('should load successfully', async () => {
      const url = run(() => {
        // to handle the difference between POSTing to the same URL as the page you are
        // on vs. POSTing to a different URL
        if (!params.action) {
          const elem = currentPage$(params.formSelector);
          assert.lengthOf(elem, 1);
          return `${siteUrl}${elem.attr('action')}`;
        } else {
          return params.url || currentUrl;
        }
      });
      const urlParams: Record<string, string> = {
        __csrf_token,
        ...(params.action ? { __action: params.action } : {}),
        ...params?.data,
      };
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams(urlParams),
      });
      assert.isOk(res.ok);
      currentUrl = res.url;
      currentPage$ = cheerio.load(await res.text());
    });
  });

  describe('The job sequence', () => {
    let job_sequence_id: string;
    it('should have an id', async () => {
      const jobSequence = await sqldb.queryRow(sql.select_last_job_sequence, JobSequenceSchema);
      job_sequence_id = jobSequence.id;
    });
    it('should complete', async () => {
      await helperServer.waitForJobSequenceSuccess(job_sequence_id);
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
      const info = params.info;
      it('should have a uuid', async () => {
        const contents = await fs.readFile(path.join(courseDevDir, info), 'utf-8');
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

async function createSharedCourse() {
  const PUBLICLY_SHARED_QUESTION_QID = 'shared-publicly';
  const PUBLICLY_SHARED_SOURCE_QUESTION_QID = 'shared-source-publicly';

  const sharingCourseData = syncUtil.getCourseData();
  sharingCourseData.course.name = 'SHARING 101';
  sharingCourseData.questions = {
    [PUBLICLY_SHARED_QUESTION_QID]: {
      uuid: '11111111-1111-1111-1111-111111111111',
      type: 'v3',
      title: 'Shared publicly',
      topic: 'TOPIC HERE',
      sharePublicly: true,
      shareSourcePublicly: true,
    },
    [PUBLICLY_SHARED_SOURCE_QUESTION_QID]: {
      uuid: '11111111-1111-1111-1111-111111111112',
      type: 'v3',
      title: 'Shared source publicly',
      topic: 'TOPIC HERE',
      shareSourcePublicly: true,
    },
  };
  sharingCourseData.courseInstances['Fa19'].assessments['test'].zones = [
    {
      questions: [
        {
          id: PUBLICLY_SHARED_QUESTION_QID,
          points: 1,
        },
        {
          id: PUBLICLY_SHARED_SOURCE_QUESTION_QID,
          points: 1,
        },
      ],
    },
  ];
  sharingCourseData.courseInstances['Fa19'].assessments['test'].shareSourcePublicly = true;
  sharingCourseData.courseInstances['Fa19'].courseInstance.shareSourcePublicly = true;

  sharingCourseData.courseInstances['Fa19'].assessments['nested/dir/test'] = structuredClone(
    sharingCourseData.courseInstances['Fa19'].assessments['test'],
  );
  sharingCourseData.courseInstances['Fa19'].assessments['nested/dir/test']['uuid'] = uuidv4();

  await syncUtil.writeAndSyncCourseData(sharingCourseData);
}

async function deleteCourseFiles() {
  await fs.remove(courseOriginDir);
  await fs.remove(courseLiveDir);
  await fs.remove(courseDevDir);
}
