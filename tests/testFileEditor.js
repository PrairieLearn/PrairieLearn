const ERR = require('async-stacktrace');
const request = require('request');
const assert = require('chai').assert;
const fs = require('fs-extra');
const path = require('path');
const async = require('async');
const ncp = require('ncp');
const config = require('../lib/config');
const cheerio = require('cheerio');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const helperServer = require('./helperServer');
const { exec } = require('child_process');
const b64Util = require('../lib/base64-util');
const requestp = require('request-promise-native');
const { encodePath } = require('../lib/uri-util');

const locals = {};
let page, elemList;

// Connect to the exampleCourse
const courseDirExampleCourse = path.join(__dirname, '..', 'exampleCourse');

// Uses course within tests/testFileEditor
const baseDir = path.join(__dirname, 'testFileEditor');
const courseTemplateDir = path.join(baseDir, 'courseTemplate');
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
  fs.readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8')
);
let infoCourseJsonB = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8')
);
infoCourseJsonB.title = 'Test Course (Renamed)';
let infoCourseJsonC = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoCoursePath), 'utf-8')
);
infoCourseJsonC.title = 'Test Course (Renamed Yet Again)';

const infoCourseInstanceJsonA = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8')
);
let infoCourseInstanceJsonB = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8')
);
infoCourseInstanceJsonB.longName = 'Fall 2019';
let infoCourseInstanceJsonC = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoCourseInstancePath), 'utf-8')
);
infoCourseInstanceJsonC.longName = 'Spring 2020';

const infoAssessmentJsonA = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8')
);
let infoAssessmentJsonB = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8')
);
infoAssessmentJsonB.title = 'Homework for file editor test (Renamed)';
let infoAssessmentJsonC = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, infoAssessmentPath), 'utf-8')
);
infoAssessmentJsonC.title = 'Homework for file editor test (Renamed Yet Aagain)';

const questionJsonA = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8')
);
let questionJsonB = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8')
);
questionJsonB.title = 'Test question (Renamed)';
let questionJsonC = JSON.parse(
  fs.readFileSync(path.join(courseTemplateDir, questionJsonPath), 'utf-8')
);
questionJsonC.title = 'Test question (Renamed Yet Again)';

const questionHtmlA = fs.readFileSync(path.join(courseTemplateDir, questionHtmlPath), 'utf-8');
const questionHtmlB = questionHtmlA + '\nAnother line of text.\n\n';
const questionHtmlC = questionHtmlB + '\nYet another line of text.\n\n';

const questionPythonA = fs.readFileSync(path.join(courseTemplateDir, questionPythonPath), 'utf-8');
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
const assesmentSettingsUrl = assessmentUrl + '/settings';
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
    selector: 'a:contains("infoAssessment.json") + a:contains("Edit")',
    url: assesmentSettingsUrl,
    expectedEditUrl: assessmentEditUrl,
  },
  {
    name: 'course admin via course instance',
    selector: 'a:contains("infoCourse.json") + a:contains("Edit")',
    url: courseInstanceCourseAdminSettingsUrl,
    expectedEditUrl: courseInstanceCourseAdminEditUrl,
  },
  {
    name: 'course admin',
    selector: 'a:contains("infoCourse.json") + a:contains("Edit")',
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
    selector: 'a:contains("info.json") + a:contains("Edit")',
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
    serverFilesDir: 'serverFilesQuestion',
    testFilesDir: 'tests',
    index: 3,
  },
  {
    title: 'assessment',
    url: assessmentUrl + '/file_view',
    path: assessmentPath,
    clientFilesDir: 'clientFilesAssessment',
    serverFilesDir: 'serverFilesAssessment',
    index: 1,
  },
  {
    title: 'course instance',
    url: courseInstanceInstanceAdminUrl + '/file_view',
    path: courseInstancePath,
    clientFilesDir: 'clientFilesCourseInstance',
    serverFilesDir: 'serverFilesCourseInstance',
    index: 2,
  },
  {
    title: 'course (through course instance)',
    url: courseInstanceCourseAdminUrl + '/file_view',
    path: '',
    clientFilesDir: 'clientFilesCourse',
    serverFilesDir: 'serverFilesCourse',
    index: 5,
  },
  {
    title: 'course',
    url: courseAdminUrl + '/file_view',
    path: '',
    clientFilesDir: 'clientFilesCourse',
    serverFilesDir: 'serverFilesCourse',
    index: 5,
  },
];

describe('test file editor', function () {
  this.timeout(20000);

  describe('not the test course', function () {
    before('create test course files', function (callback) {
      createCourseFiles((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });

    before('set up testing server', helperServer.before(courseDir));

    after('shut down testing server', helperServer.after);

    after('delete test course files', function (callback) {
      deleteCourseFiles((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });

    describe('the locals object', function () {
      it('should be cleared', function () {
        for (var prop in locals) {
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
      badGet(badPathUrl);
    });

    describe('verify file handlers', function () {
      verifyFileData.forEach((element) => {
        doFiles(element);
      });
    });
  });

  describe('the exampleCourse', function () {
    before('set up testing server', helperServer.before(courseDirExampleCourse));

    after('shut down testing server', helperServer.after);

    describe('disallow edits inside exampleCourse', function () {
      badGet(badExampleCoursePathUrl);
    });
  });
});

function badGet(url) {
  describe(`GET to edit url with bad path`, function () {
    it('should not load successfully', function (callback) {
      locals.preStartTime = Date.now();
      request(url, function (error, response) {
        if (error) {
          return callback(error);
        }
        locals.postStartTime = Date.now();
        if (response.statusCode !== 400) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      });
    });
  });
}

function badPost(action, fileEditContents, url) {
  describe(`POST to edit url with action ${action} and with bad path`, function () {
    it('should not load successfully', function (callback) {
      let form = {
        __action: action,
        __csrf_token: locals.__csrf_token,
        file_edit_contents: b64Util.b64EncodeUnicode(fileEditContents),
        file_edit_user_id: locals.file_edit_user_id,
        file_edit_course_id: locals.file_edit_course_id,
        file_edit_dir_name: '../PrairieLearn/',
        file_edit_file_name: 'config.json',
        file_edit_orig_hash: locals.file_edit_orig_hash,
      };
      locals.preEndTime = Date.now();
      request.post(
        { url: url, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (error) {
            return callback(error);
          }
          locals.postEndTime = Date.now();
          if (response.statusCode !== 400) {
            return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
          }
          callback(null);
        }
      );
    });
  });
}

function createCourseFiles(callback) {
  async.series(
    [
      (callback) => {
        deleteCourseFiles((err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        const execOptions = {
          cwd: '.',
          env: process.env,
        };
        exec(`git init --bare ${courseOriginDir}`, execOptions, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
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
      (callback) => {
        ncp(courseTemplateDir, courseLiveDir, { clobber: false }, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
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
    }
  );
}

function deleteCourseFiles(callback) {
  async.series(
    [
      (callback) => {
        fs.remove(courseOriginDir, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        fs.remove(courseLiveDir, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        fs.remove(courseDevDir, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
}

function editPost(
  action,
  fileEditContents,
  url,
  expectedToFindResults,
  expectedToFindChoice,
  expectedDiskContents
) {
  describe(`POST to edit url with action ${action}`, function () {
    it('should load successfully', function (callback) {
      let form = {
        __action: action,
        __csrf_token: locals.__csrf_token,
        file_edit_contents: b64Util.b64EncodeUnicode(fileEditContents),
        file_edit_user_id: locals.file_edit_user_id,
        file_edit_course_id: locals.file_edit_course_id,
        file_edit_dir_name: locals.file_edit_dir_name,
        file_edit_file_name: locals.file_edit_file_name,
        file_edit_orig_hash: locals.file_edit_orig_hash,
      };
      locals.preEndTime = Date.now();
      request.post(
        { url: url, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (error) {
            return callback(error);
          }
          locals.postEndTime = Date.now();
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    if (action === 'save_and_sync' || action === 'pull_and_save_and_sync') {
      verifyEdit(
        expectedToFindResults,
        expectedToFindChoice,
        fileEditContents,
        expectedDiskContents
      );
    }
  });
}

function jsonToContents(json) {
  return JSON.stringify(json, null, 4) + '\n';
}

function findEditUrl(name, selector, url, expectedEditUrl) {
  describe(`GET to ${name}`, function () {
    it('should load successfully', function (callback) {
      locals.preStartTime = Date.now();
      request(url, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        locals.postStartTime = Date.now();
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it(`should contain edit link at ${selector}`, function () {
      elemList = locals.$(selector);
      assert.lengthOf(elemList, 1);
    });
    it(`should match expected url in edit link`, function () {
      assert.equal(siteUrl + elemList[0].attribs.href, expectedEditUrl);
    });
  });
}

function verifyEdit(
  expectedToFindResults,
  expectedToFindChoice,
  expectedDraftContents,
  expectedDiskContents
) {
  it('should have a CSRF token', function () {
    elemList = locals.$('form[name="editor-form"] input[name="__csrf_token"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });
  it('should have a file_edit_user_id', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_user_id"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_user_id = elemList[0].attribs.value;
    assert.isString(locals.file_edit_user_id);
  });
  it('should have a file_edit_course_id', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_course_id"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_course_id = elemList[0].attribs.value;
    assert.isString(locals.file_edit_course_id);
  });
  it('should have a file_edit_dir_name', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_dir_name"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_dir_name = elemList[0].attribs.value;
    assert.isString(locals.file_edit_dir_name);
  });
  it('should have a file_edit_file_name', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_file_name"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_file_name = elemList[0].attribs.value;
    assert.isString(locals.file_edit_file_name);
  });
  it('should have a file_edit_orig_hash', function () {
    elemList = locals.$('form[name="editor-form"] input[name="file_edit_orig_hash"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.file_edit_orig_hash = elemList[0].attribs.value;
    assert.isString(locals.file_edit_orig_hash);
  });
  it('should have a script with draft file contents', function (callback) {
    elemList = locals.$('script');
    for (let i = 0; i < elemList.length; i++) {
      let elem = elemList[i];
      if (typeof elem != undefined && Object.prototype.hasOwnProperty.call(elem, 'children')) {
        if (elem.children.length > 0) {
          if (Object.prototype.hasOwnProperty.call(elem.children[0], 'data')) {
            let match = elem.children[0].data.match(
              /{[^{]*contents: "([^"]*)"[^{]*elementId: "file-editor-([^"]*)-draft"[^{]*}/ms
            );
            if (match != null) {
              locals.fileContents = b64Util.b64DecodeUnicode(match[1]);
              return callback(null);
            }
          }
        }
      }
    }
    return callback(new Error('found no script with draft file contents'));
  });
  it('should match expected draft file contents', function () {
    assert.strictEqual(locals.fileContents, expectedDraftContents);
  });
  it(`should have results of save and sync - ${expectedToFindResults}`, function () {
    elemList = locals.$('form[name="editor-form"] div[id^="results-"]');
    if (expectedToFindResults) {
      assert.lengthOf(elemList, 1);
    } else {
      assert.lengthOf(elemList, 0);
    }
  });
  it(`should have a script with disk file contents - ${expectedToFindChoice}`, function (callback) {
    elemList = locals.$('script');
    for (let i = 0; i < elemList.length; i++) {
      let elem = elemList[i];
      if (typeof elem != undefined && Object.prototype.hasOwnProperty.call(elem, 'children')) {
        if (elem.children.length > 0) {
          if (Object.prototype.hasOwnProperty.call(elem.children[0], 'data')) {
            let match = elem.children[0].data.match(
              /{[^{]*contents: "([^"]*)"[^{]*elementId: "file-editor-([^"]*)-disk"[^{]*}/ms
            );
            if (match != null) {
              if (expectedToFindChoice) {
                locals.diskContents = b64Util.b64DecodeUnicode(match[1]);
                return callback(null);
              } else {
                return callback(new Error('found a script with disk file contents'));
              }
            }
          }
        }
      }
    }
    if (expectedToFindChoice) {
      return callback(new Error('found no script with disk file contents'));
    } else {
      return callback(null);
    }
  });
  if (expectedToFindChoice) {
    it('should match expected disk file contents', function () {
      assert.strictEqual(locals.diskContents, expectedDiskContents);
    });
  }
}

function editGet(
  url,
  expectedToFindResults,
  expectedToFindChoice,
  expectedDraftContents,
  expectedDiskContents
) {
  describe(`GET to edit url`, function () {
    it('should load successfully', function (callback) {
      locals.preStartTime = Date.now();
      request(url, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        locals.postStartTime = Date.now();
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    verifyEdit(
      expectedToFindResults,
      expectedToFindChoice,
      expectedDraftContents,
      expectedDiskContents
    );
  });
}

function doEdits(data) {
  describe(`edit ${data.path}`, function () {
    //
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
    // (live at last post, live, dev, origin)
    //

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, A, A)

    badPost('save_and_sync', data.contentsB, data.url);
    // (A, A, A, A)

    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    // (B, B, A, B)

    waitForJobSequence(locals, 'Success');
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
    // (A, B, B, B)

    waitForJobSequence(locals, 'Error');
    pullAndVerifyFileInDev(data.path, data.contentsB);
    // (A, B, B, B)

    editGet(data.url, false, false, data.contentsB, null);
    // (B, B, B, B)

    editPost('save_and_sync', data.contentsA, data.url, true, false, null);
    // (A, A, B, A)

    waitForJobSequence(locals, 'Success');
    pullAndVerifyFileInDev(data.path, data.contentsA);
    // (A, A, A, A)

    writeAndPushFileInDev('README.md', `New readme to test edit of ${data.path}`);
    // (A, A, A*, A*)

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, A*, A*)

    editPost('save_and_sync', data.contentsC, data.url, true, false, null);
    // (A, A, A*, A*)

    waitForJobSequence(locals, 'Error');
    pullInLive();
    // (A, A, A, A)

    editGet(data.url, false, false, data.contentsA, null);
    // (A, A, A, A)

    editPost('save_and_sync', data.contentsC, data.url, true, false, null);
    // (C, C, A, C)

    pullAndVerifyFileInDev(data.path, data.contentsC);
    // (C, C, C, C)

    writeAndPushFileInDev('README.md', `Another new readme to test edit of ${data.path}`);
    // (C, C, C*, C*)

    editGet(data.url, false, false, data.contentsC, null);
    // (C, C, C*, C*)

    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    // (C, C, C*, C*)

    waitForJobSequence(locals, 'Error');
    editPost('pull_and_save_and_sync', data.contentsB, data.url, true, false, null);
    // (B, B, C, B)

    waitForJobSequence(locals, 'Success');
    writeAndCommitFileInLive(data.path, data.contentsA);
    // (B, A, C, B)

    editPost('save_and_sync', data.contentsA, data.url, true, false, null);
    // (A, A, C, B)

    waitForJobSequence(locals, 'Error');
    editPost('save_and_sync', data.contentsB, data.url, true, false, null);
    // (B, B, C, B)

    waitForJobSequence(locals, 'Success');
    if (data.isJson) {
      editPost('save_and_sync', data.contentsX, data.url, true, false, null);
      // (X, X, C, X) <- successful push but failed sync because of bad json

      waitForJobSequence(locals, 'Error');
      pullAndVerifyFileInDev(data.path, data.contentsX);
      // (X, X, X, X)

      editPost('save_and_sync', data.contentsA, data.url, true, false, null);
      // (A, A, X, A)

      waitForJobSequence(locals, 'Success');
      pullAndVerifyFileInDev(data.path, data.contentsA);
      // (A, A, A, A)
    }
  });
}

function writeAndCommitFileInLive(fileName, fileContents) {
  describe(`commit a change to ${fileName} by exec`, function () {
    it('should write', function (callback) {
      fs.writeFile(path.join(courseLiveDir, fileName), fileContents, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should add', function (callback) {
      const execOptions = {
        cwd: courseLiveDir,
        env: process.env,
      };
      exec(`git add -A`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should commit', function (callback) {
      const execOptions = {
        cwd: courseLiveDir,
        env: process.env,
      };
      exec(`git commit -m "commit from writeFile"`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
  });
}

function pullAndVerifyFileInDev(fileName, fileContents) {
  describe(`pull in dev and verify contents of ${fileName}`, function () {
    it('should pull', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec(`git pull`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should match contents', function () {
      assert.strictEqual(fs.readFileSync(path.join(courseDevDir, fileName), 'utf-8'), fileContents);
    });
  });
}

function pullAndVerifyFileNotInDev(fileName) {
  describe(`pull in dev and verify ${fileName} does not exist`, function () {
    it('should pull', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec(`git pull`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
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
    it('should write', function (callback) {
      fs.writeFile(path.join(courseDevDir, fileName), fileContents, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should add', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec(`git add -A`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should commit', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec(`git commit -m "commit from writeFile"`, execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should push', function (callback) {
      const execOptions = {
        cwd: courseDevDir,
        env: process.env,
      };
      exec('git push', execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
  });
}

function pullInLive() {
  describe('pull to live', function () {
    it('should pull', function (callback) {
      const execOptions = {
        cwd: courseLiveDir,
        env: process.env,
      };
      exec('git pull', execOptions, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
  });
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
      var checkComplete = function () {
        var params = { job_sequence_id: locals.job_sequence_id };
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

function doFiles(data) {
  describe(`test file handlers for ${data.title}`, function () {
    describe('Files', function () {
      testUploadFile({
        url: data.url,
        path: path.join(data.path, 'testfile.txt'),
        id: 'New',
        contents: 'This is a line of text.',
        filename: 'testfile.txt',
      });

      testUploadFile({
        url: data.url,
        path: path.join(data.path, 'testfile.txt'),
        id: data.index,
        contents: 'This is a different line of text.',
        filename: 'anotherfile.txt',
      });

      testRenameFile({
        url: data.url,
        id: data.index,
        path: path.join(data.path, 'subdir', 'testfile.txt'),
        contents: 'This is a different line of text.',
        new_file_name: path.join('subdir', 'testfile.txt'),
      });

      testDeleteFile({
        url: data.url + '/' + encodePath(path.join(data.path, 'subdir')),
        id: 0,
        path: path.join(data.path, 'subdir', 'testfile.txt'),
      });
    });
    describe('Client Files', function () {
      testUploadFile({
        url: data.url,
        path: path.join(data.path, data.clientFilesDir, 'testfile.txt'),
        id: 'NewClient',
        contents: 'This is a line of text.',
        filename: 'testfile.txt',
      });

      testUploadFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir)),
        path: path.join(data.path, data.clientFilesDir, 'testfile.txt'),
        id: 0,
        contents: 'This is a different line of text.',
        filename: 'anotherfile.txt',
      });

      testRenameFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir)),
        id: 0,
        path: path.join(data.path, data.clientFilesDir, 'subdir', 'testfile.txt'),
        contents: 'This is a different line of text.',
        new_file_name: path.join('subdir', 'testfile.txt'),
      });

      testDeleteFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.clientFilesDir, 'subdir')),
        id: 0,
        path: path.join(data.path, data.clientFilesDir, 'subdir', 'testfile.txt'),
      });
    });
    describe('Server Files', function () {
      testUploadFile({
        url: data.url,
        path: path.join(data.path, data.serverFilesDir, 'testfile.txt'),
        id: 'NewServer',
        contents: 'This is a line of text.',
        filename: 'testfile.txt',
      });

      testUploadFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir)),
        path: path.join(data.path, data.serverFilesDir, 'testfile.txt'),
        id: 0,
        contents: 'This is a different line of text.',
        filename: 'anotherfile.txt',
      });

      testRenameFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir)),
        id: 0,
        path: path.join(data.path, data.serverFilesDir, 'subdir', 'testfile.txt'),
        contents: 'This is a different line of text.',
        new_file_name: path.join('subdir', 'testfile.txt'),
      });

      testDeleteFile({
        url: data.url + '/' + encodePath(path.join(data.path, data.serverFilesDir, 'subdir')),
        id: 0,
        path: path.join(data.path, data.serverFilesDir, 'subdir', 'testfile.txt'),
      });
    });
    if (data.testFilesDir) {
      describe('Test Files', function () {
        testUploadFile({
          url: data.url,
          path: path.join(data.path, data.testFilesDir, 'testfile.txt'),
          id: 'NewTest',
          contents: 'This is a line of text.',
          filename: 'testfile.txt',
        });

        testUploadFile({
          url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir)),
          path: path.join(data.path, data.testFilesDir, 'testfile.txt'),
          id: 0,
          contents: 'This is a different line of text.',
          filename: 'anotherfile.txt',
        });

        testRenameFile({
          url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir)),
          id: 0,
          path: path.join(data.path, data.testFilesDir, 'subdir', 'testfile.txt'),
          contents: 'This is a different line of text.',
          new_file_name: path.join('subdir', 'testfile.txt'),
        });

        testDeleteFile({
          url: data.url + '/' + encodePath(path.join(data.path, data.testFilesDir, 'subdir')),
          id: 0,
          path: path.join(data.path, data.testFilesDir, 'subdir', 'testfile.txt'),
        });
      });
    }
  });
}

function testUploadFile(params) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      page = await requestp(params.url);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should have a CSRF token and either a file_path or a working_path', () => {
      elemList = locals.$(`button[id="instructorFileUploadForm-${params.id}"]`);
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $(
        `form[name="instructor-file-upload-form-${params.id}"] input[name="__csrf_token"]`
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // file_path or working_path
      elemList = $(`form[name="instructor-file-upload-form-${params.id}"] input[name="file_path"]`);
      if (elemList.length > 0) {
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.file_path = elemList[0].attribs.value;
        locals.working_path = undefined;
      } else {
        elemList = $(
          `form[name="instructor-file-upload-form-${params.id}"] input[name="working_path"]`
        );
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.working_path = elemList[0].attribs.value;
        locals.file_path = undefined;
      }
    });
  });

  describe(`POST to ${params.url} with action upload_file`, function () {
    it('should load successfully', async () => {
      const options = {
        url: params.url,
        followAllRedirects: true,
      };
      options.formData = {
        __action: 'upload_file',
        __csrf_token: locals.__csrf_token,
        file: {
          value: Buffer.from(params.contents),
          options: {
            filename: params.filename,
            contentType: 'text/plain',
          },
        },
      };
      if (locals.file_path) options.formData.file_path = locals.file_path;
      else if (locals.working_path) options.formData.working_path = locals.working_path;
      else assert.fail('found neither file_path nor working_path');
      page = await requestp.post(options);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
  });

  pullAndVerifyFileInDev(params.path, params.contents);
}

function testRenameFile(params) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      page = await requestp(params.url);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should have a CSRF token, old_file_name, working_path', () => {
      elemList = locals.$(`button[id="instructorFileRenameForm-${params.id}"]`);
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $(
        `form[name="instructor-file-rename-form-${params.id}"] input[name="__csrf_token"]`
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // old_file_name
      elemList = $(
        `form[name="instructor-file-rename-form-${params.id}"] input[name="old_file_name"]`
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.old_file_name = elemList[0].attribs.value;
      // working_path
      elemList = $(
        `form[name="instructor-file-rename-form-${params.id}"] input[name="working_path"]`
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.working_path = elemList[0].attribs.value;
    });
  });

  describe(`POST to ${params.url} with action rename_file`, function () {
    it('should load successfully', async () => {
      const options = {
        url: params.url,
        followAllRedirects: true,
      };
      options.formData = {
        __action: 'rename_file',
        __csrf_token: locals.__csrf_token,
        working_path: locals.working_path,
        old_file_name: locals.old_file_name,
        new_file_name: params.new_file_name,
      };
      page = await requestp.post(options);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
  });

  pullAndVerifyFileInDev(params.path, params.contents);
}

function testDeleteFile(params) {
  describe(`GET to ${params.url}`, () => {
    it('should load successfully', async () => {
      page = await requestp(params.url);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should have a CSRF token and a file_path', () => {
      elemList = locals.$(`button[id="instructorFileDeleteForm-${params.id}"]`);
      assert.lengthOf(elemList, 1);
      const $ = cheerio.load(elemList[0].attribs['data-content']);
      // __csrf_token
      elemList = $(
        `form[name="instructor-file-delete-form-${params.id}"] input[name="__csrf_token"]`
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      // file_path
      elemList = $(`form[name="instructor-file-delete-form-${params.id}"] input[name="file_path"]`);
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.file_path = elemList[0].attribs.value;
    });
  });

  describe(`POST to ${params.url} with action delete_file`, function () {
    it('should load successfully', async () => {
      const options = {
        url: params.url,
        followAllRedirects: true,
      };
      options.formData = {
        __action: 'delete_file',
        __csrf_token: locals.__csrf_token,
        file_path: locals.file_path,
      };
      page = await requestp.post(options);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
  });

  pullAndVerifyFileNotInDev(params.path);
}
