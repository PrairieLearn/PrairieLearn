import { A11yError, A11yResults } from '@sa11y/format';
import axe from 'axe-core';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { HtmlValidate, formatterFactory } from 'html-validate';
import { JSDOM, VirtualConsole } from 'jsdom';
import fetch from 'node-fetch';
import { afterAll, beforeAll, describe, test } from 'vitest';

import expressListEndpoints, { type Endpoint } from '@prairielearn/express-list-endpoints';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';
import * as news_items from '../../news_items/index.js';
import * as server from '../../server.js';
import * as helperServer from '../helperServer.js';

import Bootstrap4ConstructPlugin from './bootstrap4-construct-plugin.js';

const SITE_URL = 'http://localhost:' + config.serverPort;

/**
 * Loads the given URL into a JSDOM object.
 */
async function loadPageJsdom(url: string): Promise<{ text: string; jsdom: JSDOM }> {
  const text = await fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(`Error loading page: ${res.status}`);
    }
    return res.text();
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let output = '';
  const rewriter = new HTMLRewriter((chunk) => {
    output += decoder.decode(chunk);
  });

  // We need to mimic what Bootstrap will do at runtime for tooltips and popovers:
  // it will copy the `data-bs-title` attribute to the `aria-label` attribute if
  // the element doesn't already have an `aria-label` attribute and if its text
  // content is empty.
  //
  // Without this, we'll get a bunch of false positives that don't reflect
  // the actual behavior at runtime.
  rewriter.on('a, button', {
    element(el) {
      // This is slightly different than what we do at runtime. In practice, we'll
      // only add an `aria-label` if the element is empty. But here, we can't
      // inspect the element's children, so we'll only use the presence of an
      // `aria-label` attribute to determine if we should add one.
      if (el.hasAttribute('aria-label')) return;
      const title = el.getAttribute('data-bs-title');
      if (title) {
        el.setAttribute('aria-label', title);
      }
    },
  });

  await rewriter.write(encoder.encode(text));
  await rewriter.end();

  // JSDOM can be very verbose regarding unimplemented features (e.g., canvas).
  // We don't have a need to see these warnings, so we create a virtual console
  // that does not log anything.
  const virtualConsole = new VirtualConsole();
  return { text: output, jsdom: new JSDOM(output, { virtualConsole }) };
}

/**
 * Checks the given URL for accessibility violations.
 */
async function checkPage(url: string) {
  const { text, jsdom } = await loadPageJsdom(SITE_URL + url);

  let messages = '';

  // Since the accessibility checks are already programmatically loading
  // pretty much every page in the application, we'll piggyback on them
  // to also run HTML validation.
  const validator = new HtmlValidate();
  const validationResults = await validator.validateString(text, {
    plugins: [Bootstrap4ConstructPlugin],
    rules: {
      'bootstrap4-construct': 'error',
      'attribute-boolean-style': 'off',
      'attribute-empty-style': 'off',
      deprecated: ['error', { exclude: ['tt'] }],
      'doctype-style': 'off',
      // This rule is mostly relevant for SEO, which doesn't matter since our
      // pages aren't ever crawled by search engines.
      'long-title': 'off',
      'no-inline-style': 'off',
      'no-trailing-whitespace': 'off',
      'script-type': 'off',
      'unique-landmark': 'off',
      'void-style': 'off',
      'wcag/h63': 'off',
    },
  });

  // Filter out some validation results that don't apply to us.
  for (const result of validationResults.results) {
    result.messages = result.messages.filter((m) => {
      // This doesn't appear to be an actual issue and isn't flagged by
      // other tools like https://validator.w3.org/nu.
      if (m.message.match(/<tt> element is not permitted as content under <(small|strong)>/)) {
        return false;
      }

      // The way Bootstrap styles navbars means we can't use native `<button>`
      // elements for the navbar dropdowns.
      if (
        m.ruleId === 'prefer-native-element' &&
        m.selector &&
        [
          '#navbarDropdownMenuCourseAdminLink',
          '#navbarDropdownMenuInstanceAdminLink',
          '#navbarDropdownMenuInstanceChooseLink',
          '#navbarDropdownMenuLink',
          '#navbarDropdown',
        ].includes(m.selector)
      ) {
        return false;
      }

      return true;
    });
    result.errorCount = result.messages.length;
  }

  const formatter = formatterFactory('codeframe');
  messages += formatter(validationResults.results);

  const axeResults = await axe.run(jsdom.window.document.documentElement, {
    resultTypes: ['violations', 'incomplete'],
  });
  if (axeResults.violations.length > 0) {
    const err = new A11yError(
      axeResults.violations,
      A11yResults.convert(axeResults.violations).sort(),
    );
    messages += err.format({});
  }

  return messages.trim();
}

const STATIC_ROUTE_PARAMS = {
  // These are trivially known because there will only be one course and course
  // instance in the database after syncing the test course.
  course_id: 1,
  course_instance_id: 1,
};

function getRouteParams(url: string) {
  const routeParams = url.match(/:([^/]+)/g);

  if (!routeParams) return [];

  // Strip leading colon.
  return routeParams.map((p) => p.slice(1));
}

function getMissingRouteParams(url: string, params: Record<string, any>) {
  const routeParams = getRouteParams(url);
  return routeParams.filter((p) => !(p in params));
}

function substituteParams(path: string, params: Record<string, string>) {
  const routeParams = getRouteParams(path);
  let newPath = path;
  for (const param of routeParams) {
    newPath = newPath.replace(`:${param}`, params[param]);
  }
  return newPath;
}

const SKIP_ROUTES = [
  // This is not a real page.
  '/*',

  // Special-case: `express-list-endpoints` doesn't handle regexp routes well.
  // This matches the serialized path for regexp routes. Yes, there is a trailing
  // space here.
  '/ RegExp(/\\/pl\\/shibcallback/) ',

  // This page is not user-visible.
  '/pl/webhooks/ping',

  // These routes just render JSON.
  /^\/pl\/api\/v1\//,
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/instances/raw_data.json',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id/instances.json',
  '/pl/course_instance/:course_instance_id/instructor/ai_generate_question_drafts/generation_logs.json',
  '/pl/course/:course_id/ai_generate_question_drafts/generation_logs.json',

  // Static assets.
  '/assets/elements/:cachebuster/*',
  '/pl/static/elements/*',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/instances/client.js',

  // File downloads.
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/file/:unsafe_file_id/:unsafe_display_filename',
  '/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesCourseInstance/*',
  '/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesAssessment/*',
  '/pl/course_instance/:course_instance_id/cacheableElementExtensions/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/clientFilesCourseInstance/*',
  '/pl/course_instance/:course_instance_id/elementExtensions/*',
  '/pl/course_instance/:course_instance_id/elements/*',
  '/pl/course_instance/:course_instance_id/gradebook/:filename',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/generatedFilesQuestion/variant/:unsafe_variant_id/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/submission/:unsafe_submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment_instance/:assessment_instance_id/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/assessment_statistics/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesCourseInstance/*',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesAssessment/*',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/downloads/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/question_statistics/:filename',
  '/pl/course_instance/:course_instance_id/instructor/cacheableElementExtensions/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/instructor/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/instructor/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instructor/clientFilesCourseInstance/*',
  '/pl/course_instance/:course_instance_id/instructor/course_admin/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/elements/*',
  '/pl/course_instance/:course_instance_id/instructor/elementExtensions/*',
  '/pl/course_instance/:course_instance_id/instructor/grading_job/:job_id/file/:file',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/gradebook/:filename',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/gradebook/raw_data.json',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/generatedFilesQuestion/variant/:unsafe_variant_id/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/submission/:unsafe_submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/news_item/:news_item_id/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/generatedFilesQuestion/variant/:unsafe_variant_id/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/statistics/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/submission/:unsafe_submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/news_item/:news_item_id/*',
  '/pl/course_instance/:course_instance_id/sharedElements/course/:producing_course_id/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/sharedElements/course/:producing_course_id/elements/*',
  '/pl/course_instance/:course_instance_id/instructor/sharedElements/course/:producing_course_id/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/instructor/sharedElements/course/:producing_course_id/elements/*',
  '/pl/course/:course_id/cacheableElementExtensions/:cachebuster/*',
  '/pl/course/:course_id/cacheableElements/:cachebuster/*',
  '/pl/course/:course_id/clientFilesCourse/*',
  '/pl/course/:course_id/course_admin/file_download/*',
  '/pl/course/:course_id/news_item/:news_item_id/*',
  '/pl/course/:course_id/question/:question_id/clientFilesCourse/*',
  '/pl/course/:course_id/question/:question_id/clientFilesQuestion/*',
  '/pl/course/:course_id/elements/*',
  '/pl/course/:course_id/elementExtensions/*',
  '/pl/course/:course_id/question/:question_id/file_download/*',
  '/pl/course/:course_id/question/:question_id/file/:filename',
  '/pl/course/:course_id/question/:question_id/generatedFilesQuestion/variant/:unsafe_variant_id/*',
  '/pl/course/:course_id/question/:question_id/preview/file/:filename',
  '/pl/course/:course_id/question/:question_id/preview/text/:filename',
  '/pl/course/:course_id/question/:question_id/statistics/:filename',
  '/pl/course/:course_id/question/:question_id/submission/:unsafe_submission_id/file/*',
  '/pl/course/:course_id/question/:question_id/text/:filename',
  '/pl/course/:course_id/grading_job/:job_id/file/:file',
  '/pl/course/:course_id/sharedElements/course/:producing_course_id/cacheableElements/:cachebuster/*',
  '/pl/course/:course_id/sharedElements/course/:producing_course_id/elements/*',
  '/pl/news_item/:news_item_id/*',
  '/pl/public/course/:course_id/cacheableElements/:cachebuster/*',
  '/pl/public/course/:course_id/elements/*',
  '/pl/public/course/:course_id/question/:question_id/clientFilesQuestion/*',
  '/pl/public/course/:course_id/question/:question_id/file_download/*',
  '/pl/public/course/:course_id/question/:question_id/generatedFilesQuestion/variant/:unsafe_variant_id/*',
  '/pl/public/course/:course_id/question/:question_id/submission/:unsafe_submission_id/file/*',

  // File upload pages for external image capture.
  '/pl/course/:course_id/question/:question_id/externalImageCapture/variant/:variant_id',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/externalImageCapture/variant/:variant_id',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/externalImageCapture/variant/:variant_id',
  '/pl/public/course/:course_id/question/:question_id/externalImageCapture/variant/:variant_id',

  // Renders partial HTML documents, not a full page.
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/instance_question/:instance_question_id/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments/stats/:assessment_id',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/time_remaining',
  '/pl/course/:course_id/question/:question_id/preview/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/public/course/:course_id/question/:question_id/preview/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/course_instance/:course_instance_id/instructor/ai_generate_editor/:question_id/variant/:unsafe_variant_id/submission/:unsafe_submission_id',
  '/pl/course/:course_id/ai_generate_editor/:question_id/variant/:unsafe_variant_id/submission/:unsafe_submission_id',

  // These pages just redirect to other pages and thus don't have to be tested.
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id/next_ungraded',
  '/pl/course_instance/:course_instance_id/instructor/course_admin/questions/qid/*',
  '/pl/course_instance/:course_instance_id/instructor/loadFromDisk',
  '/pl/course_instance/:course_instance_id/loadFromDisk',
  '/pl/course/:course_id/course_admin/questions/qid/*',
  '/pl/course/:course_id/file_transfer/:file_transfer_id',
  '/pl/course/:course_id/loadFromDisk',
  '/pl/loadFromDisk',
  '/pl/oauth2callback',
  '/pl/oauth2login',

  // Admin page; we aren't guaranteed to have subpages to navigate to.
  '/pl/administrator/batchedMigrations/:batched_migration_id',
  '/pl/administrator/features/:feature',
  '/pl/administrator/features/:feature/modal',

  // These are only HTML fragments rendered by HTMX; we can't test them as full
  // HTML documents.
  /^\/pl\/navbar\/course/,
  /^\/pl\/assessments_switcher\/course_instance/,

  // TODO: add tests for file editing/viewing.
  /\/file_edit\/\*$/,
  /\/file_view\/\*$/,

  // TODO: add tests for job sequence pages.
  /\/:job_sequence_id$/,

  // TODO: add tests for workspace pages. These will require us to open a question
  // in order to create a workspace.
  // TODO: open a question and create a workspace so we can test this page.
  /^\/pl\/workspace\//,

  // TODO: run a query so we can test this page.
  '/pl/administrator/query/:query',

  // TODO: create an assessment instance and create an instance question so we can test these pages.
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment_instance/:assessment_instance_id',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/instance_question/:instance_question_id',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/instance_question/:instance_question_id/grading_rubric_panels',

  // TODO: submit an answer to a question so we can test this page.
  '/pl/course_instance/:course_instance_id/instructor/grading_job/:job_id',
  '/pl/course/:course_id/grading_job/:job_id',

  // TODO: create a test course with AI generation feature flag enabled to test page
  '/pl/course_instance/:course_instance_id/instructor/ai_generate_editor/:question_id',
  '/pl/course/:course_id/ai_generate_editor/:question_id',
  '/pl/course_instance/:course_instance_id/instructor/ai_generate_question_drafts/:job_id',
];

function shouldSkipPath(path) {
  return SKIP_ROUTES.some((r) => {
    if (typeof r === 'string') {
      return r === path;
    } else if (r instanceof RegExp) {
      return r.test(path);
    } else {
      throw new Error(`Invalid route: ${r}`);
    }
  });
}

describe('accessibility', () => {
  let endpoints: Endpoint[] = [];
  let routeParams: Record<string, any> = {};

  beforeAll(async function () {
    config.cronActive = false;
    // We use the test course since editing functionality is disabled in the
    // example course.
    await helperServer.before(TEST_COURSE_PATH)();
    config.cronActive = true;

    // We want to test a news item page, so we need to "init" them.
    await news_items.init({
      notifyIfPreviouslyEmpty: true,
      errorIfLockNotAcquired: true,
    });

    const app = await server.initExpress();
    endpoints = expressListEndpoints(app);
    endpoints.sort((a, b) => a.path.localeCompare(b.path));

    const firstNewsItemResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM news_items ORDER BY id ASC LIMIT 1',
      {},
    );

    const assessmentResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM assessments WHERE tid = $tid',
      { tid: 'hw1-automaticTestSuite' },
    );

    const questionResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM questions WHERE qid = $qid',
      { qid: 'downloadFile' },
    );

    await features.enable('question-sharing');

    routeParams = {
      ...STATIC_ROUTE_PARAMS,
      news_item_id: firstNewsItemResult.rows[0].id,
      assessment_id: assessmentResult.rows[0].id,
      question_id: questionResult.rows[0].id,
    };

    await sqldb.queryOneRowAsync(
      'UPDATE questions SET share_publicly = true WHERE id = $question_id',
      { question_id: routeParams.question_id },
    );

    await sqldb.queryOneRowAsync(
      'UPDATE assessments SET share_source_publicly = true WHERE id = $assessment_id',
      { assessment_id: routeParams.assessment_id },
    );

    await sqldb.queryOneRowAsync(
      'UPDATE course_instances SET share_source_publicly = true WHERE id = $course_instance_id',
      { course_instance_id: routeParams.course_instance_id },
    );

    const courseId = await sqldb.queryOneRowAsync(
      'SELECT course_id FROM course_instances WHERE id = $course_instance_id',
      { course_instance_id: routeParams.course_instance_id },
    );

    await sqldb.queryOneRowAsync(
      'UPDATE pl_courses SET sharing_name = $sharing_name WHERE id = $course_id',
      { sharing_name: 'test', course_id: courseId.rows[0].course_id },
    );
  });

  afterAll(helperServer.after);

  test('All pages pass accessibility checks', async function () {
    const missingParamsEndpoints: Endpoint[] = [];
    const failingEndpoints: [Endpoint, string][] = [];

    for (const endpoint of endpoints) {
      if (shouldSkipPath(endpoint.path)) {
        continue;
      }

      if (!endpoint.methods.includes('GET')) {
        // We won't try to test routes that don't have a GET handler.
        continue;
      }

      const missingParams = getMissingRouteParams(endpoint.path, routeParams);
      if (missingParams.length > 0) {
        missingParamsEndpoints.push(endpoint);
        continue;
      }

      const url = substituteParams(endpoint.path, routeParams);
      const messages = await checkPage(url);
      if (messages !== '') {
        failingEndpoints.push([endpoint, messages]);
      }
    }

    const errLines: string[] = [];

    if (missingParamsEndpoints.length > 0) {
      errLines.push('The following endpoints are missing params:');
      missingParamsEndpoints.forEach((e) => errLines.push(`  ${e.path}`));
    }

    if (failingEndpoints.length > 0) {
      errLines.push('The following endpoints failed accessibility checks:\n');
      failingEndpoints.forEach(([endpoint, messages]) => {
        errLines.push(endpoint.path, messages, '');
      });
    }

    if (errLines.length > 0) {
      throw new Error(errLines.join('\n'));
    }
  }, 240_000);
});
