/* eslint-disable @typescript-eslint/dot-notation */
import * as path from 'path';

import * as cheerio from 'cheerio';
import { execa } from 'execa';
import fs from 'fs-extra';
import klaw from 'klaw';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { getCourseInstanceSettingsUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { JobSequenceSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { updateCourseSharingName } from '../models/course.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import * as syncUtil from './sync/util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoFixture;

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const courseUrl = baseUrl + '/course/1';
const courseInstancesUrl = `${courseUrl}/course_admin/instances`;

const courseInstanceUrl = baseUrl + '/course_instance/1/instructor';

const questionCreateUrl = `${courseInstanceUrl}/course_admin/questions/create`;
const assessmentsUrl = `${courseInstanceUrl}/instance_admin/assessments`;

const newQuestionUrl = `${courseInstanceUrl}/question/2/settings`;
const newQuestionFromTemplateUrl = `${courseInstanceUrl}/question/3/settings`;
const newCourseInstanceUrl = baseUrl + '/course_instance/2/instructor';
const newCourseInstanceSettingsUrl = `${newCourseInstanceUrl}/instance_admin/settings`;

const newAssessmentUrl = `${courseInstanceUrl}/assessment/2`;
const newAssessmentSettingsUrl = `${newAssessmentUrl}/settings`;

interface EditData {
  isJSON?: boolean;
  url?: string;
  formSelector: string;
  button?: string;
  action?: string;
  files: Set<string>;
  info?: string;
  data?: Record<string, string | number | boolean>;
  dynamicPostInfo?: (form: cheerio.Cheerio<any>) => {
    csrfToken: string | undefined;
    url?: string;
  };
}

function getCourseInstanceCreatePostInfo(page: cheerio.Cheerio<any>) {
  const csrfToken = page.find('#test_csrf_token').text();

  return {
    csrfToken,
    url: undefined,
  };
}

const testEditData: EditData[] = [
  {
    url: questionCreateUrl,
    formSelector: 'form[method="POST"]',
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
    url: questionCreateUrl,
    formSelector: 'form[method="POST"]',
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
    dynamicPostInfo: getQuestion2DeletePostInfo,
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
    dynamicPostInfo: getQuestion3DeletePostInfo,
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
    formSelector: 'form[name="copy-question-form"]',
    dynamicPostInfo: getQuestionCopyPostInfo,
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
    dynamicPostInfo: getQuestionDeleteFromCurrentUrlPostInfo,
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
    formSelector: 'body',
    dynamicPostInfo: getCourseInstanceCreatePostInfo,
    action: 'add_course_instance',
    info: 'courseInstances/New/infoCourseInstance.json',
    data: {
      short_name: 'New',
      long_name: 'New',
      start_date: '',
      end_date: '',
      course_instance_permission: 'Student Data Editor',
    },
    files: new Set([
      'README.md',
      'infoCourse.json',
      'courseInstances/Fa18/infoCourseInstance.json',
      'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      'questions/test/question/info.json',
      'questions/test/question/question.html',
      'questions/test/question/server.py',
      'courseInstances/New/infoCourseInstance.json',
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
    formSelector: 'body',
    dynamicPostInfo: getCourseInstanceCreatePostInfo,
    action: 'copy_course_instance',
    data: {
      short_name: 'Fa18_copy1',
      long_name: 'Fall 2018 (Copy 1)',
      start_date: '',
      end_date: '',
      self_enrollment_enabled: true,
      self_enrollment_use_enrollment_code: false,
      course_instance_permission: 'Student Data Editor',
    },
    isJSON: true,
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

function getPostInfoFromCopyOption(form: cheerio.Cheerio<any>) {
  const option = form.find('select[name="to_course_id"] option[value="1"]');
  return { csrfToken: option.attr('data-csrf-token'), url: option.attr('data-copy-url') };
}

function getCourseInstanceCopyPostInfo(_: cheerio.Cheerio<any>) {
  const authnUserId = '1';
  // This is a workaround since we have no other way to get the CSRF token
  // for the copy course instance form. That is because a CSRF token is
  // generated for each course, and this page has no GET handler to retrieve a CSRF token off of.
  const csrfToken = generateCsrfToken({
    url: '/pl/course/1/copy_public_course_instance',
    authnUserId,
  });
  return {
    csrfToken,
    url: '/pl/course/1/copy_public_course_instance',
  };
}

function getQuestionCopyPostInfo() {
  // The copy question form is rendered as a React popover, so we generate
  // the CSRF token directly instead of parsing it from data-bs-content.
  return {
    csrfToken: generateCsrfToken({
      url: '/pl/course_instance/1/instructor/question/1/settings',
      authnUserId: '1',
    }),
  };
}

function getQuestion2DeletePostInfo() {
  // The delete modal is rendered by React and only contains content when shown.
  return {
    csrfToken: generateCsrfToken({
      url: '/pl/course_instance/1/instructor/question/2/settings',
      authnUserId: '1',
    }),
  };
}

function getQuestion3DeletePostInfo() {
  // The delete modal is rendered by React and only contains content when shown.
  return {
    csrfToken: generateCsrfToken({
      url: '/pl/course_instance/1/instructor/question/3/settings',
      authnUserId: '1',
    }),
  };
}

function getQuestionDeleteFromCurrentUrlPostInfo() {
  // The delete modal is rendered by React and only contains content when shown.
  // Use currentUrl which was set by the previous test's POST response.
  const url = new URL(currentUrl);
  return {
    csrfToken: generateCsrfToken({
      url: url.pathname,
      authnUserId: '1',
    }),
  };
}

const publicCopyTestData: EditData[] = [
  {
    url: `${baseUrl}/public/course/2/question/2/preview`,
    formSelector: 'form.js-copy-question-form',
    dynamicPostInfo: getPostInfoFromCopyOption,
    action: 'copy_question',
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
    formSelector: 'body',
    dynamicPostInfo: getCourseInstanceCopyPostInfo,
    action: 'copy_course_instance',
    data: {
      course_instance_id: 2,
      start_date: '',
      end_date: '',
      course_instance_permission: 'Student Data Editor',
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
    formSelector: 'body',
    dynamicPostInfo: getCourseInstanceCopyPostInfo,
    action: 'copy_course_instance',
    data: {
      course_instance_id: 2,
      start_date: '',
      end_date: '',
      course_instance_permission: 'Student Data Editor',
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
    beforeAll(async () => {
      courseRepo = await createCourseRepoFixture(courseTemplateDir);
      await helperServer.before(courseRepo.courseLiveDir)();
      await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    });
    afterAll(helperServer.after);

    describe('verify edits', function () {
      testEditData.forEach((element) => {
        testEdit(element);
      });
    });
  });

  describe('Copy from another course', function () {
    beforeAll(async () => {
      courseRepo = await createCourseRepoFixture(courseTemplateDir);
      await helperServer.before(courseRepo.courseLiveDir)();
      await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
      await features.enable('question-sharing');
      config.checkSharingOnSync = true;
      await createSharedCourse();
      await updateCourseSharingName({ course_id: '2', sharing_name: 'test-course' });
    });

    afterAll(async () => {
      config.checkSharingOnSync = false;
      await helperServer.after();
    });

    describe('verify edits', function () {
      publicCopyTestData.forEach((element) => {
        testEdit(element);
      });
    });
  });
});

async function getFiles(options: { baseDir: string }): Promise<Set<string>> {
  const files = new Set<string>();

  const ignoreHidden = (item: string) => {
    const basename = path.basename(item);
    return basename === '.' || !basename.startsWith('.');
  };

  const walker = klaw(options.baseDir, { filter: ignoreHidden });

  for await (const item of walker) {
    if (!item.stats.isDirectory()) {
      const relPath = path.relative(options.baseDir, item.path);
      files.add(relPath);
    }
  }

  return files;
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
      if (params.dynamicPostInfo) {
        const postInfo = params.dynamicPostInfo(currentPage$(`${params.formSelector}`));
        maybeToken = postInfo.csrfToken;
        if (postInfo.url !== undefined) {
          params.url = `${siteUrl}${postInfo.url}`;
        }
      } else if (params.button) {
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
        ...params.data,
      };
      const res = await fetch(url, {
        method: 'POST',
        body: params.isJSON ? JSON.stringify(urlParams) : new URLSearchParams(urlParams),
        headers: params.isJSON
          ? { 'Content-Type': 'application/json', Accept: 'application/json' }
          : { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const text = await res.text();
      if (!params.isJSON) {
        currentUrl = res.url;
        currentPage$ = cheerio.load(text);
      } else {
        // This is a hack to get the CSRF token for the next test since copy_course_instance returns an id.
        assert.equal(params.action, 'copy_course_instance');
        const body = JSON.parse(text);
        const courseInstanceId = body.course_instance_id;
        const settingsUrl = getCourseInstanceSettingsUrl(courseInstanceId);
        const settingsRes = await fetch(siteUrl + settingsUrl);
        assert.isOk(settingsRes.ok);
        currentUrl = settingsRes.url;
        currentPage$ = cheerio.load(await settingsRes.text());
      }
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
      const rowCount = await sqldb.execute(sql.select_sync_warnings_and_errors, {
        course_path: courseRepo.courseLiveDir,
      });
      assert.equal(rowCount, 0);
    });

    it('should pull into dev directory', async () => {
      await execa('git', ['pull'], {
        cwd: courseRepo.courseDevDir,
        env: process.env,
      });
    });

    it('should have correct contents', async () => {
      const files = await getFiles({ baseDir: courseRepo.courseDevDir });
      assert.sameMembers([...files], [...params.files]);
    });

    if (params.info) {
      const info = params.info;
      it('should have a uuid', async () => {
        const contents = await fs.readFile(path.join(courseRepo.courseDevDir, info), 'utf-8');
        const infoJson = JSON.parse(contents);
        assert.isString(infoJson.uuid);
      });
    }
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
  sharingCourseData.courseInstances['Fa19'].assessments['nested/dir/test']['uuid'] =
    crypto.randomUUID();

  await syncUtil.writeAndSyncCourseData(sharingCourseData);
}
