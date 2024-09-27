import { readFileSync } from 'node:fs';
import http from 'node:http';
import nodeUrl from 'node:url';
import * as path from 'path';

import { assert } from 'chai';
import * as cheerio from 'cheerio';
import { execa } from 'execa';
import fs from 'fs-extra';
import fetch, { FormData } from 'node-fetch';
import * as tmp from 'tmp';

import * as sqldb from '@prairielearn/postgres';

import * as b64Util from '../lib/base64-util.js';
import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { encodePath } from '../lib/uri-util.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = {};
let page, elemList;

// Uses course within tests/testFileEditor
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

// Set up temporary writeable directories for course content
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const courseDir = courseLiveDir;

const courseInstancePath = path.join('courseInstances', 'Fa18');
const assessmentPath = path.join(courseInstancePath, 'assessments', 'HW1');
const infoCoursePath = 'infoCourse.json';
const infoCourseInstancePath = path.join(courseInstancePath, 'infoCourseInstance.json');
const infoAssessmentPath = path.join(assessmentPath, 'infoAssessment.json');
const questionPath = path.join('questions', 'test', 'question');
const questionJsonPath = path.join(questionPath, 'info.json');
const questionHtmlPath = path.join(questionPath, 'question.html');
const questionPythonPath = path.join(questionPath, 'server.py');

const infoCourseJsonA = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8'),
);
const infoCourseJsonB = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8'),
);
infoCourseJsonB.title = 'Test Course (Renamed)';
const infoCourseJsonC = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8'),
);
infoCourseJsonC.title = 'Test Course (Renamed Yet Again)';

const infoCourseInstanceJsonA = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8'),
);
const infoCourseInstanceJsonB = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8'),
);
infoCourseInstanceJsonB.longName = 'Fall 2019';
const infoCourseInstanceJsonC = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8'),
);
infoCourseInstanceJsonC.longName = 'Spring 2020';

const infoAssessmentJsonA = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8'),
);
const infoAssessmentJsonB = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8'),
);
infoAssessmentJsonB.title = 'Homework for file editor test (Renamed)';
const infoAssessmentJsonC = JSON.parse(
  readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8'),
);
infoAssessmentJsonC.title = 'Homework for file editor test (Renamed Yet Again)';

const questionJsonA = JSON.parse(
  readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8'),
);
const questionJsonB = JSON.parse(
  readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8'),
);
questionJsonB.title = 'Test question (Renamed)';
const questionJsonC = JSON.parse(
  readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8'),
);
questionJsonC.title = 'Test question (Renamed Yet Again)';

const questionHtmlA = readFileSync(path.join(courseTemplateDir, questionHtmlPath), 'utf-8');
const questionHtmlB = questionHtmlA + '\nAnother line of text.\n\n';
const questionHtmlC = questionHtmlB + '\nYet another line of text.\n\n';

const questionPythonA = readFileSync(path.join(courseTemplateDir, questionPythonPath), 'utf-8');
const questionPythonB = questionPythonA + '\n# Comment.\n\n';
const questionPythonC = questionPythonB + '\n# Another comment.\n\n';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseAdminUrl = baseUrl + '/course/1/course_admin';
const courseAdminSettingsUrl = courseAdminUrl + '/settings';
const courseAdminEditUrl = courseAdminUrl + `/file_edit/${encodePath(infoCoursePath)}`;
const courseInstanceUrl = baseUrl + '/course_instance/1/instructor';
const courseInstanceCourseAdminUrl = courseInstanceUrl + '/course_admin';
const courseInstanceCourseAdminSettingsUrl = courseInstanceCourseAdminUrl + '/settings';
const courseInstanceCourseAdminEditUrl =
  courseInstanceCourseAdminUrl + `/file_edit/${encodePath(infoCoursePath)}`;
const courseInstanceInstanceAdminUrl = courseInstanceUrl + '/instance_admin';
const courseInstanceInstanceAdminSettingsUrl = courseInstanceInstanceAdminUrl + '/settings';
const courseInstanceInstanceAdminEditUrl =
  courseInstanceInstanceAdminUrl + `/file_edit/${encodePath(infoCourseInstancePath)}`;
const assessmentUrl = courseInstanceUrl + '/assessment/1';
const assessmentSettingsUrl = assessmentUrl + '/settings';
const assessmentEditUrl = assessmentUrl + `/file_edit/${encodePath(infoAssessmentPath)}`;
const courseInstanceQuestionUrl = courseInstanceUrl + '/question/1';
const courseInstanceQuestionSettingsUrl = courseInstanceQuestionUrl + '/settings';
const courseInstanceQuestionJsonEditUrl =
  courseInstanceUrl + `/question/1/file_edit/${encodePath(questionJsonPath)}`;
const courseInstanceQuestionHtmlEditUrl =
  courseInstanceUrl + `/question/1/file_edit/${encodePath(questionHtmlPath)}`;
const courseInstanceQuestionPythonEditUrl =
  courseInstanceUrl + `/question/1/file_edit/${encodePath(questionPythonPath)}`;
const badPathUrl = assessmentUrl + '/file_edit/' + encodePath('../PrairieLearn/config.json');
const badExampleCoursePathUrl = courseAdminUrl + '/file_edit/' + encodePath('infoCourse.json');

const findEditUrlData = [
  {
    name: 'assessment',
    selector: '[data-testid="edit-assessment-configuration-link"]',
    url: assessmentSettingsUrl,
    expectedEditUrl: assessmentEditUrl,
  },
  {
    name: 'course admin via course instance',
    selector: '[data-testid="edit-course-configuration-link"]',
    url: courseInstanceCourseAdminSettingsUrl,
    expectedEditUrl: courseInstanceCourseAdminEditUrl,
  },
  {
    name: 'course admin',
    selector: '[data-testid="edit-course-configuration-link"]',
    url: courseAdminSettingsUrl,
    expectedEditUrl: courseAdminEditUrl,
  },
  {
    name: 'instance admin',
    selector: 'a:contains("infoCourseInstance.json") + a:contains("Edit")',
    url: courseInstanceInstanceAdminSettingsUrl,
    expectedEditUrl: courseInstanceInstanceAdminEditUrl,
  },
  {
    name: 'question',
    selector: '[data-testid="edit-question-configuration-link"]',
    url: courseInstanceQuestionSettingsUrl,
    expectedEditUrl: courseInstanceQuestionJsonEditUrl,
  },
];

const verifyEditData = [
  {
    isJson: true,
    url: courseAdminEditUrl,
    path: infoCoursePath,
    contentsA: jsonToContents(infoCourseJsonA),
    contentsB: jsonToContents(infoCourseJsonB),
    contentsC: jsonToContents(infoCourseJsonC),
    contentsX: 'garbage',
  },
  {
    isJson: true,
    url: courseInstanceInstanceAdminEditUrl,
    path: infoCourseInstancePath,
    contentsA: jsonToContents(infoCourseInstanceJsonA),
    contentsB: jsonToContents(infoCourseInstanceJsonB),
    contentsC: jsonToContents(infoCourseInstanceJsonC),
    contentsX: 'garbage',
  },
  {
    isJson: true,
    url: assessmentEditUrl,
    path: infoAssessmentPath,
    contentsA: jsonToContents(infoAssessmentJsonA),
    contentsB: jsonToContents(infoAssessmentJsonB),
    contentsC: jsonToContents(infoAssessmentJsonC),
    contentsX: 'garbage',
  },
  {
    isJson: true,
    url: courseInstanceQuestionJsonEditUrl,
    path: questionJsonPath,
    contentsA: jsonToContents(questionJsonA),
    contentsB: jsonToContents(questionJsonB),
    contentsC: jsonToContents(questionJsonC),
    contentsX: 'garbage',
  },
  {
    isJson: false,
    url: courseInstanceQuestionHtmlEditUrl,
    path: questionHtmlPath,
    contentsA: questionHtmlA,
    contentsB: questionHtmlB,
    contentsC: questionHtmlC,
    contentsX: 'garbage',
  },
  {
    isJson: false,
    url: courseInstanceQuestionPythonEditUrl,
    path: questionPythonPath,
    contentsA: questionPythonA,
    contentsB: questionPythonB,
    contentsC: questionPythonC,
    contentsX: 'garbage',
  },
];

const verifyFileData = [
  {
    title: 'question',
    url: courseInstanceQuestionUrl + '/file_view',
    path: questionPath,
    clientFilesDir: 'clientFilesQuestion',
    testFilesDir: 'tests',
  },
  {
    title: 'assessment',
    url: assessmentUrl + '/file_view',
    path: assessmentPath,
    clientFilesDir: 'clientFilesAssessment',
  },
  {
    title: 'course instance',
    url: courseInstanceInstanceAdminUrl + '/file_view',
    path: courseInstancePath,
    clientFilesDir: 'clientFilesCourseInstance',
  },
  {
    title: 'course (through course instance)',
    url: courseInstanceCourseAdminUrl + '/file_view',
    path: '',
    clientFilesDir: 'clientFilesCourse',
    serverFilesDir: 'serverFilesCourse',
  },
  {
    title: 'course',
    url: courseAdminUrl + '/file_view',
    path: '',
    clientFilesDir: 'clientFilesCourse',
    serverFilesDir: 'serverFilesCourse',
  },
];

describe('test file editor', function () {
  this.timeout(20000);

  describe('not the test course', function () {
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

    describe('verify existence of edit links', function () {
      findEditUrlData.forEach((element) => {
        findEditUrl(element.name, element.selector, element.url, element.expectedEditUrl);
      });
    });

    describe('verify edits', function () {
      verifyEditData.forEach((element) => {
        doEdits(element);
      });
    });

    describe('disallow edits outside course directory', function () {
      badGet(badPathUrl, 500, false);
    });

    describe('verify file handlers', function () {
      verifyFileData.forEach((element) => {
        doFiles(element);
      });
    });
  });

  describe('the exampleCourse', function () {
    before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));

    after('shut down testing server', helperServer.after);

    describe('disallow edits inside exampleCourse', function () {
      badGet(badExampleCoursePathUrl, 403, true);
    });
  });
});

function badGet(url, expected_status, should_parse) {
  describe('GET to edit url with bad path', function () {
    it(`should load with status ${expected_status}`, async () => {
      // `fetch()` pre-normalizes the URL, which means we can't use it to test
      // path traversal attacks. In this specific case, we'll use `http.request()`
      // directly to avoid this normalization.
      const res = await new Promise<{ status: number; text: () => Promise<string> }>(
        (resolve, reject) => {
          // We deliberately use the deprecated `node:url#parse()` instead of
          // `new URL()` to avoid path normalization.
          const parsedUrl = nodeUrl.parse(url);
          const req = http.request(
            {
              hostname: 'localhost',
              port: config.serverPort,
              path: parsedUrl.path,
              method: 'GET',
            },
            (res) => {
              let data = '';

              res.on('data', (chunk) => {
                data += chunk;
              });

              res.on('end', () => {
                resolve({
                  status: res.statusCode ?? 500,
                  text: () => Promise.resolve(data),
                });
              });
            },
          );

          req.on('error', (err) => {
            reject(err);
          });

          req.end();
        },
      );

      assert.equal(res.status, expected_status);
      page = await res.text();
    });
    if (should_parse) {
      it('should parse', function () {
        locals.$ = cheerio.load(page);
      });
      it('should not have an editor-form', function () {
        elemList = locals.$('form[name="editor-form"]');
        assert.lengthOf(elemList, 0);
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

function editPost(
  action,
  fileEditContents,
  url,
  expectedToFindResults,
  expectedToFindChoice,
  expectedDiskContents,
) {
  describe(`POST to edit url with action ${action}`, function () {
    it('should load successfully', async () => {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({
          __action: action,
          __csrf_token: locals.__csrf_token,
          file_edit_contents: b64Util.b64EncodeUnicode(fileEditContents),
          file_edit_orig_hash: locals.file_edit_orig_hash,
        }),
      });
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    if (action === 'save_and_sync') {
      verifyEdit(
        expectedToFindResults,
        expectedToFindChoice,
        fileEditContents,
        expectedDiskContents,
      );
    }
  });
}

function jsonToContents(json) {
  return JSON.stringify(json, null, 4) + '\n';
}

function findEditUrl(name, selector, url, expectedEditUrl) {
  describe(`GET to ${name}`, function () {
    it('should load successfully', async () => {
      const res = await fetch(url);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it(`should contain edit link at ${selector}`, function () {
      elemList = locals.$(selector);
      assert.lengthOf(elemList, 1);
    });
    it('should match expected url in edit link', function () {
      assert.equal(siteUrl + elemList[0].attribs.href, expectedEditUrl);
    });
  });
}

function verifyEdit(
  expectedToFindResults,
  expectedToFindChoice,
  expectedDraftContents,
  expectedDiskContents,
) {
  it('should have a CSRF token', function () {
    elemList = locals.$('form[name="editor-form"] input[name="__csrf_token"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });
  it('should have a file_edit_orig_hash', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_orig_hash"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_orig_hash = elemList[0].attribs.value;
    assert.isString(locals.file_edit_orig_hash);
  });
  it('editor element should match expected draft file contents', function () {
    const editor = locals.$('#file-editor-draft');
    assert.lengthOf(editor, 1);
    const fileContents = b64Util.b64DecodeUnicode(editor.data('contents'));
    assert.strictEqual(fileContents, expectedDraftContents);
  });
  it(`should have results of save and sync - ${expectedToFindResults}`, function () {
    elemList = locals.$('form[name="editor-form"] #job-sequence-results');
    if (expectedToFindResults) {
      assert.lengthOf(elemList, 1);
    } else {
      assert.lengthOf(elemList, 0);
    }
  });
  it(`should ${expectedToFindChoice ? '' : 'not '}have an editor with disk file contents`, function () {
    const editor = locals.$('#file-editor-disk');
    if (expectedToFindChoice) {
      assert.lengthOf(editor, 1);
      const fileContents = b64Util.b64DecodeUnicode(editor.data('contents'));
      assert.strictEqual(fileContents, expectedDiskContents);
    } else {
      assert.lengthOf(editor, 0);
    }
  });
}

function editGet(
  url,
  expectedToFindResults,
  expectedToFindChoice,
  expectedDraftContents,
  expectedDiskContents,
) {
  describe('GET to edit url', function () {
    it('should load successfully', async () => {
      const res = await fetch(url);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    verifyEdit(
      expectedToFindResults,
      expectedToFindChoice,
      expectedDraftContents,
      expectedDiskContents,
    );
  });
}

function doEdits(data) {
  describe(`edit ${data.path}`, function () {
    // "live" is a clone of origin (this is what's on the production server)
    // "dev" is a clone of origin (this is what's on someone's laptop)
    // "origin" is the bare git repo
    //
    // in LIVE
    // - writeAndCommitFileInLive does git commit
    // - pullInLive does git pull
    // in DEV
    // - pullAndVerifyFileInDev does git pull
    // - writeAndPushFileInDev does git push
    //
    // Remember that "origHash" has whatever was on disk at last GET.
    //
    // The below tests are annotated with state of the file under test in
    // several locations:
    //
    // (live at last GET, live, dev, origin)
    //
    // Note that "live at last GET" refers to the fact that GET responses
    // include the hash of the file on disk at the time of the GET, which
    // is used to detect concurrent modifications. `editGet` and `editPost`
    // store this hash in `locals` and include it in subsequent `POST` requests.

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, A, A)

    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (B, B, A, B)

    pullAndVerifyFileInDev(data.path, data.contentsB);
    // (B, B, B, B)

    editGet(data.url, false, false, data.contentsB, null);
    // (B, B, B, B)

    writeAndCommitFileInLive(data.path, data.contentsA);
    // (B, A, B, B)

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, B, B)

    writeAndCommitFileInLive(data.path, data.contentsB);
    // (A, B, B, B)

    editPost('save_and_sync', data.contentsC, data.url, true, true, data.contentsB);
    waitForJobSequence(locals, 'Error');
    // (B, B, B, B)

    pullAndVerifyFileInDev(data.path, data.contentsB);
    // (B, B, B, B)

    editGet(data.url, false, false, data.contentsB, null);
    // (B, B, B, B)

    editPost('save_and_sync', data.contentsA, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (A, A, B, A)

    pullAndVerifyFileInDev(data.path, data.contentsA);
    // (A, A, A, A)

    writeAndPushFileInDev('README.md', `New readme to test edit of ${data.path}`);
    // (A, A, A*, A*)

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, A*, A*)

    editPost('save_and_sync', data.contentsC, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (C, C, A*, C)

    pullAndVerifyFileInDev(data.path, data.contentsC);
    // (C, C, C, C)

    writeAndPushFileInDev('README.md', `Another new readme to test edit of ${data.path}`);
    // (C, C, C*, C*)

    editGet(data.url, false, false, data.contentsC, null);
    // (C, C, C*, C*)

    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (B, B, C*, B)

    editPost('save_and_sync', data.contentsA, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (A, A, C*, A)

    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    waitForJobSequence(locals, 'Success');
    // (B, B, C*, B)

    if (data.isJson) {
      editPost('save_and_sync', data.contentsX, data.url, true, false, null);
      waitForJobSequence(locals, 'Error');
      // (X, X, C*, X) <- successful push but failed sync because of bad json

      pullAndVerifyFileInDev(data.path, data.contentsX);
      // (X, X, X, X)

      editPost('save_and_sync', data.contentsA, data.url, true, false, null);
      waitForJobSequence(locals, 'Success');
      // (A, A, X, A)

      pullAndVerifyFileInDev(data.path, data.contentsA);
      // (A, A, A, A)
    }
  });
}

function writeAndCommitFileInLive(fileName, fileContents) {
  describe(`commit a change to ${fileName} by exec`, function () {
    it('should write', async () => {
      await fs.writeFile(path.join(courseLiveDir, fileName), fileContents);
    });
    it('should add', async () => {
      await execa('git', ['add', '-A'], {
        cwd: courseLiveDir,
        env: process.env,
      });
    });
    it('should commit', async () => {
      await execa('git', ['commit', '-m', 'commit from writeFile'], {
        cwd: courseLiveDir,
        env: process.env,
      });
    });
  });
}

function pullAndVerifyFileInDev(fileName, fileContents) {
  describe(`pull in dev and verify contents of ${fileName}`, function () {
    it('should pull', async () => {
      await execa('git', ['pull'], {
        cwd: courseDevDir,
        env: process.env,
      });
    });
    it('should match contents', function () {
      assert.strictEqual(readFileSync(path.join(courseDevDir, fileName), 'utf-8'), fileContents);
    });
  });
}

function pullAndVerifyFileNotInDev(fileName) {
  describe(`pull in dev and verify ${fileName} does not exist`, function () {
    it('should pull', async () => {
      await execa('git', ['pull'], {
        cwd: courseDevDir,
        env: process.env,
      });
    });
    it('should not exist', function (callback) {
      fs.access(path.join(courseDevDir, fileName), (err) => {
        if (err) {
          if (err.code === 'ENOENT') callback(null);
          else callback(new Error(`got wrong error: ${err}`));
        } else {
          callback(new Error(`${fileName} should not exist, but does`));
        }
      });
    });
  });
}

function writeAndPushFileInDev(fileName, fileContents) {
  describe(`write ${fileName} in courseDev and push to courseOrigin`, function () {
    it('should write', async () => {
      await fs.writeFile(path.join(courseDevDir, fileName), fileContents);
    });
    it('should add', async () => {
      await execa('git', ['add', '-A'], {
        cwd: courseDevDir,
        env: process.env,
      });
    });
    it('should commit', async () => {
      await execa('git', ['commit', '-m', 'commit from writeFile'], {
        cwd: courseDevDir,
        env: process.env,
      });
    });
    it('should push', async () => {
      await execa('git', ['push'], {
        cwd: courseDevDir,
        env: process.env,
      });
    });
  });
}

function waitForJobSequence(locals, expectedResult: 'Success' | 'Error') {
  describe('The job sequence', function () {
    it('should have an id', async () => {
      const result = await sqldb.queryOneRowAsync(sql.select_last_job_sequence, []);
      locals.job_sequence_id = result.rows[0].id;
    });
    it('should complete', async () => {
      await helperServer.waitForJobSequenceStatus(locals.job_sequence_id, expectedResult);
    });
  });
}

function doFiles(data: {
  title: string;
  url: string;
  path: string;
  clientFilesDir: string;
  serverFilesDir?: string;
  testFilesDir?: string;
}) {
  describe(`test file handlers for ${data.title}`, function () {
    describe('Files', function () {
      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url,
        path: path.join(data.path, 'testfile.txt'),
        newButtonId: 'New',
        contents: 'This is a line of text.',
        filename: 'testfile.txt',
      });

      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url,
        path: path.join(data.path, 'testfile.txt'),
        contents: 'This is a different line of text.',
        filename: 'anotherfile.txt',
      });

      testRenameFile({
        url: data.url,
        path: path.join(data.path, 'subdir', 'testfile.txt'),
        contents: 'This is a different line of text.',
        new_file_name: path.join('subdir', 'testfile.txt'),
      });

      testDeleteFile({
        url: data.url + '/' + encodePath(path.join(data.path, 'subdir')),
        path: path.join(data.path, 'subdir', 'testfile.txt'),
      });
    });
    describe('Client Files', function () {
      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url,
        path: path.join(data.path, data.clientFilesDir, 'testfile.txt'),
        newButtonId: 'NewClient',
        contents: 'This is a line of text.',
        filename: 'testfile.txt',
      });

      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir)),
        path: path.join(data.path, data.clientFilesDir, 'testfile.txt'),
        contents: 'This is a different line of text.',
        filename: 'anotherfile.txt',
      });

      testRenameFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir)),
        path: path.join(data.path, data.clientFilesDir, 'subdir', 'testfile.txt'),
        contents: 'This is a different line of text.',
        new_file_name: path.join('subdir', 'testfile.txt'),
      });

      testDeleteFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir, 'subdir')),
        path: path.join(data.path, data.clientFilesDir, 'subdir', 'testfile.txt'),
      });
    });
    describe('Server Files', function () {
      if (data.serverFilesDir) {
        testUploadFile({
          fileViewBaseUrl: data.url,
          url: data.url,
          path: path.join(data.path, data.serverFilesDir, 'testfile.txt'),
          newButtonId: 'NewServer',
          contents: 'This is a line of text.',
          filename: 'testfile.txt',
        });

        testUploadFile({
          fileViewBaseUrl: data.url,
          url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir)),
          path: path.join(data.path, data.serverFilesDir, 'testfile.txt'),
          contents: 'This is a different line of text.',
          filename: 'anotherfile.txt',
        });

        testRenameFile({
          url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir)),
          path: path.join(data.path, data.serverFilesDir, 'subdir', 'testfile.txt'),
          contents: 'This is a different line of text.',
          new_file_name: path.join('subdir', 'testfile.txt'),
        });

        testDeleteFile({
          url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir, 'subdir')),
          path: path.join(data.path, data.serverFilesDir, 'subdir', 'testfile.txt'),
        });
      }
    });
    if (data.testFilesDir) {
      describe('Test Files', function () {
        if (data.testFilesDir) {
          testUploadFile({
            fileViewBaseUrl: data.url,
            url: data.url,
            path: path.join(data.path, data.testFilesDir, 'testfile.txt'),
            newButtonId: 'NewTest',
            contents: 'This is a line of text.',
            filename: 'testfile.txt',
          });

          testUploadFile({
            fileViewBaseUrl: data.url,
            url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir)),
            path: path.join(data.path, data.testFilesDir, 'testfile.txt'),
            contents: 'This is a different line of text.',
            filename: 'anotherfile.txt',
          });

          testRenameFile({
            url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir)),
            path: path.join(data.path, data.testFilesDir, 'subdir', 'testfile.txt'),
            contents: 'This is a different line of text.',
            new_file_name: path.join('subdir', 'testfile.txt'),
          });

          testDeleteFile({
            url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir, 'subdir')),
            path: path.join(data.path, data.testFilesDir, 'subdir', 'testfile.txt'),
          });
        }
      });
    }
    describe('Files with % in name', function () {
      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url,
        path: path.join(data.path, 'test%file.txt'),
        newButtonId: 'New',
        contents: 'This is a line of text in a file with percent.',
        filename: 'test%file.txt',
      });

      testUploadFile({
        fileViewBaseUrl: data.url,
        url: data.url,
        path: path.join(data.path, 'test%file.txt'),
        contents: 'This is a different line of text in a file with percent.',
        filename: 'test%file.txt',
      });

      // TODO Rename currently has very restrictive naming conventions that
      // don't allow for this kind of name. Once this is removed it should be
      // possible to enable the test below.

      // testRenameFile({
      //   url: data.url,
      //   path: path.join(data.path, 'sub%dir', 'test%file.txt'),
      //   contents: 'This is a line of text in a file with percent.',
      //   new_file_name: path.join('sub%dir', 'test%file.txt'),
      // });

      testDeleteFile({
        url: data.url + '/' + encodePath(data.path),
        path: path.join(data.path, 'test%file.txt'),
      });
    });
  });
}

function testUploadFile(params: {
  fileViewBaseUrl: string;
  url: string;
  path: string;
  newButtonId?: string;
  contents: string;
  filename: string;
}) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      const res = await fetch(params.url);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should have a CSRF token and either a file_path or a working_path', () => {
      if (params.newButtonId) {
        elemList = locals.$(`button[id="instructorFileUploadForm-${params.newButtonId}"]`);
      } else {
        const row = locals.$(`tr:has(a:contains("${params.path.split('/').pop()}"))`);
        elemList = row.find('button[id^="instructorFileUploadForm-"]');
      }
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $('input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // file_path or working_path
      if (!params.newButtonId) {
        elemList = $('input[name="file_path"]');
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.file_path = elemList[0].attribs.value;
        locals.working_path = undefined;
      } else {
        elemList = $('input[name="working_path"]');
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.working_path = elemList[0].attribs.value;
        locals.file_path = undefined;
      }
    });
  });

  describe(`POST to ${params.url} with action upload_file`, function () {
    it('should load successfully', async () => {
      const formData = new FormData();
      formData.append('__action', 'upload_file');
      formData.append('__csrf_token', locals.__csrf_token);
      formData.append('file', new Blob([Buffer.from(params.contents)]), params.filename);

      if (locals.file_path) {
        formData.append('file_path', locals.file_path);
      } else if (locals.working_path) {
        formData.append('working_path', locals.working_path);
      } else {
        assert.fail('found neither file_path nor working_path');
      }

      const res = await fetch(params.url, { method: 'POST', body: formData });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
  });

  describe('Uploaded file is available', function () {
    it('file view should match contents', async () => {
      const res = await fetch(`${params.fileViewBaseUrl}/${encodePath(params.path)}`);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
      const pre = locals.$('.card-body pre');
      assert.lengthOf(pre, 1);
      assert.strictEqual(pre.text(), params.contents);
    });

    it('file download should match contents', async () => {
      const downloadUrl = locals.$('.card-header a:contains("Download")').attr('href');
      const res = await fetch(`${siteUrl}${downloadUrl}`);
      assert.isOk(res.ok);
      assert.strictEqual(await res.text(), params.contents);
    });
  });

  pullAndVerifyFileInDev(params.path, params.contents);
}

function testRenameFile(params: {
  url: string;
  path: string;
  contents: string;
  new_file_name: string;
}) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      const res = await fetch(params.url);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should have a CSRF token, old_file_name, working_path', () => {
      const row = locals.$(`tr:has(a:contains("${params.path.split('/').pop()}"))`);
      elemList = row.find('button[data-testid="rename-file-button"]');
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $('input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // old_file_name
      elemList = $('input[name="old_file_name"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.old_file_name = elemList[0].attribs.value;
      assert.equal(locals.old_file_name, params.path.split('/').pop());
      // working_path
      elemList = $('input[name="working_path"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.working_path = elemList[0].attribs.value;
    });
  });

  describe(`POST to ${params.url} with action rename_file`, function () {
    it('should load successfully', async () => {
      const form = {
        __action: 'rename_file',
        __csrf_token: locals.__csrf_token,
        working_path: locals.working_path,
        old_file_name: locals.old_file_name,
        new_file_name: params.new_file_name,
      };
      const res = await fetch(params.url, { method: 'POST', body: new URLSearchParams(form) });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
  });

  pullAndVerifyFileInDev(params.path, params.contents);
}

function testDeleteFile(params: { url: string; path: string }) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      const res = await fetch(params.url);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should have a CSRF token and a file_path', () => {
      const row = locals.$(`tr:has(a:contains("${params.path.split('/').pop()}"))`);
      elemList = row.find('button[data-testid="delete-file-button"]');
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $('input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // file_path
      elemList = $('input[name="file_path"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.file_path = elemList[0].attribs.value;
      assert.equal(locals.file_path, params.path);
    });
  });

  describe(`POST to ${params.url} with action delete_file`, function () {
    it('should load successfully', async () => {
      const form = {
        __action: 'delete_file',
        __csrf_token: locals.__csrf_token,
        file_path: locals.file_path,
      };
      const res = await fetch(params.url, { method: 'POST', body: new URLSearchParams(form) });
      assert.isOk(res.ok);
    });
  });

  pullAndVerifyFileNotInDev(params.path);
}
