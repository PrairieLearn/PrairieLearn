import * as path from 'path';
import { promisify } from 'util';

import { isEqual } from 'es-toolkit';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from '../lib/paths.js';
import { selectQuestionByQid } from '../models/question.js';
import * as freeform from '../question-servers/freeform.js';
import type { ElementExtensionNameDirMap } from '../question-servers/freeform.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Course element extensions', { timeout: 60_000 }, function () {
  describe('Extensions can be loaded', function () {
    const extDir = path.resolve(EXAMPLE_COURSE_PATH, 'elementExtensions');
    const element = 'extendable-element';
    const element_extensions = [
      'example-extension',
      'extension-cssjs',
      'extension-fileio',
      'extension-clientfiles',
    ];

    const check_ext = (loaded: ElementExtensionNameDirMap) => {
      assert.isTrue(element in loaded, `did not find element ${element} in loaded extensions`);
      assert(
        isEqual(Object.keys(loaded[element]).sort(), element_extensions.sort()),
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
    beforeAll(helperServer.before(EXAMPLE_COURSE_PATH));

    afterAll(helperServer.after);

    const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };
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

    test.sequential('find the example question in the database', async () => {
      locals.question = await selectQuestionByQid({ qid: testQid, course_id: '1' });
    });
    test.sequential('check the question page for extension css and js files', async () => {
      const questionUrl =
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
      const importMapData = JSON.parse(importMap ?? '');
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
    test.sequential('check the question page for a client-side image', async () => {
      const questionUrl =
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
