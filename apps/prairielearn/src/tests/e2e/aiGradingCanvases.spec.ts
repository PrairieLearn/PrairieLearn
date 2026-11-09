import { readFile } from 'node:fs/promises';

import * as cheerio from 'cheerio';
import Mustache from 'mustache';
import sharp from 'sharp';

import { prepareCanvasHtmlForAiGrading } from '../../ee/lib/ai-grading/ai-grading-canvases.js';
import type { QuestionImageContext } from '../../ee/lib/ai-grading/ai-grading-images.js';
import { prepareQuestionPrompt } from '../../ee/lib/ai-grading/ai-grading-util.js';
import { makeAssessmentInstance } from '../../lib/assessment.js';
import {
  assetPath,
  close,
  coreElementAssetPath,
  init,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import { closePrintRenderer } from '../../lib/printing/index.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getConfiguredUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ isEnterprise: true });

// Browser startup and MathJax initialization can exceed the default test timeout.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  config.devMode = true;
  await init();
});

test.afterAll(async () => {
  await closePrintRenderer();
  await close();
});

const scope = {
  courseInstanceId: '1',
  assessmentId: '1',
  assessmentInstanceId: '1',
  instanceQuestionIds: ['1'],
  authnUserId: '1',
  userId: '1',
};

test('captures inline and dynamically created canvases after registered asynchronous work', async ({
  baseURL,
}) => {
  const result = await prepareCanvasHtmlForAiGrading({
    urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
    assetScope: scope,
    extraHeadersHtml: '',
    panelHtml: `<p>Compare these diagrams: \\(F=ma\\).</p>
      <canvas id="first" width="20" height="10" aria-label="Red diagram"></canvas>
      <script>
        document.getElementById('first').getContext('2d').fillStyle = 'red';
        document.getElementById('first').getContext('2d').fillRect(0, 0, 20, 10);
        PrairieLearnAssessmentPrinting.waitUntil(new Promise((resolve) => setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 10;
          canvas.height = 20;
          canvas.setAttribute('aria-label', 'Blue diagram');
          document.body.append(canvas);
          PrairieLearnAssessmentPrinting.waitUntil(new Promise((nestedResolve) => setTimeout(() => {
            const context = canvas.getContext('2d');
            context.fillStyle = 'blue';
            context.fillRect(0, 0, 10, 20);
            nestedResolve();
          }, 50)));
          resolve();
        }, 50)));
      </script>`,
  });
  const $ = cheerio.load(result);
  expect($('canvas, script').length).toBe(0);
  expect($('p').text()).toBe('Compare these diagrams: \\(F=ma\\).');
  expect(
    $('img')
      .map((_, image) => $(image).attr('alt'))
      .get(),
  ).toEqual(['Red diagram', 'Blue diagram']);
  const images = $('img').toArray();
  for (const [index, image] of images.entries()) {
    const png = Buffer.from($(image).attr('src')!.split(',')[1], 'base64');
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual(index === 0 ? [20, 10] : [10, 20]);
    expect([...data.subarray(0, 4)]).toEqual(index === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  }
  const parts = await prepareQuestionPrompt(result, {} as QuestionImageContext);
  expect(parts.filter((part) => part.type === 'file')).toHaveLength(2);
});

test('captures pl-drawing shapes and waits for asynchronous MathJax labels', async ({
  baseURL,
}) => {
  const scripts = [
    nodeModulesAssetPath('fabric/dist/fabric.js'),
    nodeModulesAssetPath('lodash/lodash.js'),
    assetPath('javascripts/sylvester.js'),
    coreElementAssetPath('pl-drawing/pl-drawing.js'),
    coreElementAssetPath('pl-drawing/mechanicsObjects.js'),
  ];
  const template = await readFile(
    new URL('../../../elements/pl-drawing/pl-drawing.mustache', import.meta.url),
    'utf8',
  );
  const panelHtml = Mustache.render(template, {
    render_element: true,
    uuid: 'drawing',
    width: 200,
    height: 100,
    aria_label: 'Force diagram',
    options_json: JSON.stringify({
      width: 200,
      height: 100,
      render_scale: 1,
      editable: false,
      grid_size: 0,
      element_client_files: {},
      snap_to_grid: false,
    }),
    input_answer: JSON.stringify([
      {
        type: 'pl-text',
        label: 'F=ma',
        latex: true,
        left: 30,
        top: 30,
        offsetx: 0,
        offsety: 0,
        fontSize: 20,
        selectable: false,
      },
    ]),
  });
  const result = await prepareCanvasHtmlForAiGrading({
    urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
    assetScope: scope,
    extraHeadersHtml: scripts.map((src) => `<script src="${src}"></script>`).join(''),
    panelHtml,
  });
  const $ = cheerio.load(result);
  expect($('img')).toHaveLength(1);
  const png = Buffer.from($('img').attr('src')!.split(',')[1], 'base64');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([200, 100]);
  expect(data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
});

test('preserves explicitly typeset equations, including math inside pl-xss-safe', async ({
  baseURL,
}) => {
  const template = await readFile(
    new URL('../../../elements/pl-xss-safe/pl-xss-safe.mustache', import.meta.url),
    'utf8',
  );
  const safeHtml = Mustache.render(template, {
    uuid: 'equation',
    language: 'html',
    contents: '<p>\\(x^2+1\\)</p>',
  });
  const result = await prepareCanvasHtmlForAiGrading({
    urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
    assetScope: scope,
    extraHeadersHtml: `<script src="${nodeModulesAssetPath('dompurify/dist/purify.min.js')}"></script>`,
    panelHtml: `${safeHtml}<p id="display-math">\\[y=mx+b\\]</p>
      <script>
        PrairieLearnAssessmentPrinting.waitUntil(MathJax.startup.promise.then(() =>
          MathJax.typesetPromise([document.getElementById('display-math')])
        ));
      </script>`,
  });
  const $ = cheerio.load(result);
  expect(
    $('p')
      .map((_, paragraph) => $(paragraph).text())
      .get(),
  ).toEqual(['\\(x^2+1\\)', '\\[y=mx+b\\]']);
});

test('preserves external image sources when unrelated scripts execute', async ({ baseURL }) => {
  const src = 'https://example.com/diagram.png';
  const result = await prepareCanvasHtmlForAiGrading({
    urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
    assetScope: scope,
    extraHeadersHtml: '',
    panelHtml: `<p>Diagram</p><img src="${src}" alt="External diagram"><script>window.example = true;</script>`,
  });
  const $ = cheerio.load(result);
  expect($('img').attr('src')).toBe(src);
  expect($('img').attr('alt')).toBe('External diagram');
});

test('rejects external script dependencies', async ({ baseURL }) => {
  await expect(
    prepareCanvasHtmlForAiGrading({
      urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
      assetScope: scope,
      extraHeadersHtml: '',
      panelHtml: '<canvas></canvas><script src="https://example.com/drawing.js"></script>',
    }),
  ).rejects.toThrow('Could not load a question script');
});

test('rejects readiness failures and oversized canvases before grading', async ({ baseURL }) => {
  const context = {
    urlPrefix: `${baseURL}/pl/course_instance/1/instructor`,
    assetScope: scope,
    extraHeadersHtml: '',
  };
  await expect(
    prepareCanvasHtmlForAiGrading({
      ...context,
      panelHtml:
        '<script>PrairieLearnAssessmentPrinting.waitUntil(Promise.reject(new Error("Drawing failed")))</script>',
    }),
  ).rejects.toThrow('Drawing failed');
  await expect(
    prepareCanvasHtmlForAiGrading({
      ...context,
      panelHtml: '<canvas width="5000" height="5000"></canvas>',
    }),
  ).rejects.toThrow('rendering size limit');
  await expect(
    prepareCanvasHtmlForAiGrading({
      ...context,
      panelHtml: '<canvas></canvas><script>throw new Error("Broken drawing script")</script>',
    }),
  ).rejects.toThrow('Broken drawing script');
});

test('loads scoped course assets without enabling printable assessments', async ({
  baseURL,
  courseInstance,
}) => {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const urlPrefix = `/pl/course_instance/${courseInstance.id}/instructor`;
  const result = await prepareCanvasHtmlForAiGrading({
    urlPrefix: `${baseURL}${urlPrefix}`,
    assetScope: {
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
      assessmentInstanceId,
      instanceQuestionIds: [],
      authnUserId: user.id,
      userId: user.id,
    },
    extraHeadersHtml: `<link rel="stylesheet" href="${urlPrefix}/clientFilesCourse/sharedElementStyles.css">`,
    panelHtml: `<span class="example-shared-style">Color source</span><canvas width="10" height="10"></canvas>
      <script>
        const context = document.querySelector('canvas').getContext('2d');
        context.fillStyle = getComputedStyle(document.querySelector('span')).color;
        context.fillRect(0, 0, 10, 10);
      </script>`,
  });
  const $ = cheerio.load(result);
  const png = Buffer.from($('img').attr('src')!.split(',')[1], 'base64');
  const data = await sharp(png).ensureAlpha().raw().toBuffer();
  expect([...data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
});
