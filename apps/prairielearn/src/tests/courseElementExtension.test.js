const assert = require('chai').assert;
const { step } = require('mocha-steps');
const fs = require('fs-extra');
const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const _ = require('lodash');
const path = require('path');
const freeform = require('../question-servers/freeform.js');
const { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } = require('../lib/paths');
const { promisify } = require('util');

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Course element extensions', function () {
  this.timeout(60000);

  describe('Extensions can be loaded', function () {
    const extDir = path.resolve(EXAMPLE_COURSE_PATH, 'elementExtensions');
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
        'could not load all extensions',
      );
    };

    it('should correctly load extensions from example course', async () => {
      const extensions = await freeform.loadExtensions(extDir, extDir);
      check_ext(extensions);
    });

    it("shouldn't fail on empty extension directories", async () => {
      const dir = path.join(extDir, element, 'empty');

      await promisify(fs.mkdir)(dir);
      try {
        const extensions = await freeform.loadExtensions(extDir, extDir);
        check_ext(extensions);
      } finally {
        await promisify(fs.rmdir)(dir);
      }
    });

    it("shouldn't fail on empty element directories", async () => {
      const dir = path.join(extDir, 'empty');

      await promisify(fs.mkdir)(dir);
      try {
        const extensions = await freeform.loadExtensions(extDir, extDir);
        check_ext(extensions);
      } finally {
        await promisify(fs.rmdir)(dir);
      }
    });

    it("shouldn't fail when there are no extensions to load", async () => {
      const extensions = await freeform.loadExtensions(
        path.join(TEST_COURSE_PATH, 'elementExtensions'),
        path.join(TEST_COURSE_PATH, 'elementExtensions'),
      );
      assert.isEmpty(
        extensions,
        'non-zero number of extensions were loaded from a course without extensions',
      );
    });
  });

  describe('Extensions can insert client-side assets into the page', function () {
    before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
    after('shut down testing server', helperServer.after);

    const locals = {};
    locals.siteUrl = 'http://localhost:' + config.serverPort;
    locals.baseUrl = locals.siteUrl + '/pl';
    locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
    locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
    locals.questionPreviewTabUrl = '/preview';
    locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
    locals.isStudentPage = false;
    const testQid = 'demo/custom/extension';

    const incJs = 'extendable-element/extension-cssjs/extension-cssjs.js';
    const incCss = 'extendable-element/extension-cssjs/extension-cssjs.css';
    const incDynamicJs = 'd3/dist/d3.min.js';
    const incDynamicJsKey = 'd3';
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

      const page$ = response.$;
      assert.lengthOf(
        page$(`script[src$="${incJs}"]`),
        1,
        'page did not load extension javascript',
      );
      assert.lengthOf(
        page$(`link[rel="stylesheet"][href$="${incCss}"]`),
        1,
        'page did not load extension css',
      );

      const importMap = page$('script[type="importmap"]').html();
      const importMapData = JSON.parse(importMap);
      assert.property(
        importMapData.imports,
        incDynamicJsKey,
        'importmap did not include dynamic extension js',
      );
      assert.equal(
        importMapData.imports[incDynamicJsKey].slice(-incDynamicJs.length),
        incDynamicJs,
      );
    });
    step('check the question page for a client-side image', async () => {
      let questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      const response = await helperClient.fetchCheerio(questionUrl);
      assert.isTrue(response.ok, 'could not fetch question page');

      const image = Array.from(response.$('img')).find((img) => img.attribs.src.includes(incImg));
      assert(image != null, 'could not find image on page');

      const image_response = await helperClient.fetchCheerio(locals.siteUrl + image.attribs.src);
      assert.isTrue(image_response.ok, 'could not fetch image');
    });
  });
});
