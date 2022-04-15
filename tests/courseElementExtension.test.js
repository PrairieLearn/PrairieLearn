const assert = require('chai').assert;
const { step } = require('mocha-steps');
const fs = require('fs-extra');
const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const _ = require('lodash');
const path = require('path');
const freeform = require('../question-servers/freeform.js');
const { promisify } = require('util');

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Course element extensions', function () {
  this.timeout(60000);
  const exampleCourseDir = path.join(__dirname, '..', 'exampleCourse');

  describe('Extensions can be loaded', function () {
    const extDir = path.join(exampleCourseDir, 'elementExtensions');
    const element = 'extendable-element';
    const element_extensions = [
      'example-extension',
      'extension-cssjs',
      'extension-fileio',
      'extension-clientfiles',
    ];

    const check_ext = (loaded) => {
      assert.isTrue(element in loaded, `did not find element ${element} in loaded extensions`);
      assert(
        _.isEqual(Object.keys(loaded[element]).sort(), element_extensions.sort()),
        'could not load all extensions'
      );
    };

    it('should correctly load extensions from example course', async () => {
      const extensions = await freeform.loadExtensionsAsync(extDir);
      check_ext(extensions);
    });

    it("shouldn't fail on empty extension directories", async () => {
      const dir = path.join(extDir, element, 'empty');

      await promisify(fs.mkdir)(dir);
      try {
        const extensions = await freeform.loadExtensionsAsync(extDir);
        check_ext(extensions);
      } finally {
        await promisify(fs.rmdir)(dir);
      }
    });

    it("shouldn't fail on empty element directories", async () => {
      const dir = path.join(extDir, 'empty');

      await promisify(fs.mkdir)(dir);
      try {
        const extensions = await freeform.loadExtensionsAsync(extDir);
        check_ext(extensions);
      } finally {
        await promisify(fs.rmdir)(dir);
      }
    });

    it("shouldn't fail when there are no extensions to load", async () => {
      const extensions = await freeform.loadExtensionsAsync(
        path.join(__dirname, '..', 'testCourse', 'elementExtensions')
      );
      assert(
        extensions.length === 0,
        'non-zero number of extensions were loaded from a course without extensions'
      );
    });
  });

  describe('Extensions can insert client-side assets into the page', function () {
    before('set up testing server', helperServer.before(exampleCourseDir));
    after('shut down testing server', helperServer.after);

    const locals = {};
    locals.siteUrl = 'http://localhost:' + config.serverPort;
    locals.baseUrl = locals.siteUrl + '/pl';
    locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
    locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
    locals.questionPreviewTabUrl = '/preview';
    locals.questionSettingsTabUrl = '/settings';
    locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
    locals.isStudentPage = false;
    const testQid = 'demo/custom/extension';

    const incJs = 'extendable-element/extension-cssjs/extension-cssjs.js';
    const incCss = 'extendable-element/extension-cssjs/extension-cssjs.css';
    const incImg =
      'extendable-element/extension-clientfiles/clientFilesExtension/cat-2536662_640.jpg';

    step('find the example question in the database', async () => {
      let results = await sqldb.queryZeroOrOneRowAsync(sql.select_question_by_qid, {
        qid: testQid,
      });
      assert(results.rowCount === 1, `could not find question ${testQid}`);

      locals.question = results.rows[0];
    });
    step('check the question page for extension css and js files', async () => {
      let questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      const response = await helperClient.fetchCheerio(questionUrl);
      assert.isTrue(response.ok, 'could not fetch question page');

      const html = response.$.html();
      assert.isTrue(html.includes(incJs), 'page did not load extension javascript');
      assert.isTrue(html.includes(incCss), 'page did not load extension css');
    });
    step('check the question page for a client-side image', async () => {
      let questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      const response = await helperClient.fetchCheerio(questionUrl);
      assert.isTrue(response.ok, 'could not fetch question page');

      const images = response.$('img');
      let found_image = null;
      for (let i = 0; i < images.length; i++) {
        if (images[i].attribs.src.includes(incImg)) {
          found_image = images[i];
          break;
        }
      }
      assert(found_image !== null, 'could not find image on page');

      const image_response = await helperClient.fetchCheerio(
        locals.siteUrl + found_image.attribs.src
      );
      assert.isTrue(image_response.ok, 'could not fetch image');
    });
  });
});
