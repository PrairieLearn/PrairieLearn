// The OpenTelemetry instrumentation for Express breaks our ability to inspect
// the Express routes. We need to disable it before loading the server.
import { disableInstrumentations } from '@prairielearn/opentelemetry';
disableInstrumentations();

import { test } from 'mocha';
import axe = require('axe-core');
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import { A11yError } from '@sa11y/format';
import expressListEndpoints = require('express-list-endpoints');
import * as sqldb from '@prairielearn/postgres';

import * as server from '../../server';
import * as news_items from '../../news_items';
import { config } from '../../lib/config';
import * as helperServer from '../helperServer';
import { features } from '../../lib/features/index';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths';

const SITE_URL = 'http://localhost:' + config.serverPort;

/**
 * Loads the given URL into a JSDOM object.
 */
async function loadPageJsdom(url: string): Promise<JSDOM> {
  const text = await fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(`Error loading page: ${res.status}`);
    }
    return res.text();
  });
  return new JSDOM(text);
}

/**
 * Checks the given URL for accessibility violations.
 */
async function checkPage(url: string) {
  const page = await loadPageJsdom(SITE_URL + url);
  const results = await axe.run(page.window.document.documentElement, {
    resultTypes: ['violations', 'incomplete'],
  });
  A11yError.checkAndThrow(results.violations);
}

const STATIC_ROUTE_PARAMS = {
  // These are trivially known because there will only be one course and course
  // instance in the database after syncing the example course.
  course_id: 1,
  course_instance_id: 1,
};

function getRouteParams(url) {
  const routeParams = url.match(/:([^/]+)/g);

  if (!routeParams) return [];

  // Strip leading colon.
  return routeParams.map((p) => p.slice(1));
}

function getMissingRouteParams(url: string, params: Record<string, any>) {
  const routeParams = getRouteParams(url);
  return routeParams.filter((p) => !(p in params));
}

function substituteParams(path, params) {
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
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/submission/:submission_id/file/*',
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
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/submission/:submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/news_item/:news_item_id/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesCourse/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/statistics/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/submission/:submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/news_item/:news_item_id/*',
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
  '/pl/course/:course_id/question/:question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course/:course_id/question/:question_id/preview/file/:filename',
  '/pl/course/:course_id/question/:question_id/preview/text/:filename',
  '/pl/course/:course_id/question/:question_id/statistics/:filename',
  '/pl/course/:course_id/question/:question_id/submission/:submission_id/file/*',
  '/pl/course/:course_id/question/:question_id/text/:filename',
  '/pl/course/:course_id/grading_job/:job_id/file/:file',
  '/pl/news_item/:news_item_id/*',
  '/pl/public/course/:course_id/question/:question_id/clientFilesQuestion/*',
  '/pl/public/course/:course_id/question/:question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/public/course/:course_id/question/:question_id/submission/:submission_id/file/*',

  // Renders partial HTML documents, not a full page.
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/variant/:variant_id/submission/:submission_id',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/instance_question/:instance_question_id/variant/:variant_id/submission/:submission_id',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments/stats/:assessment_id',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/variant/:variant_id/submission/:submission_id',
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/time_remaining',
  '/pl/course/:course_id/question/:question_id/preview/variant/:variant_id/submission/:submission_id',
  '/pl/public/course/:course_id/question/:question_id/preview/variant/:variant_id/submission/:submission_id',

  // These pages just redirect to other pages and thus don't have to be tested.
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id/next_ungraded',
  '/pl/course_instance/:course_instance_id/instructor/loadFromDisk',
  '/pl/course_instance/:course_instance_id/loadFromDisk',
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
  let endpoints: expressListEndpoints.Endpoint[] = [];
  let routeParams: Record<string, any> = {};
  before('set up testing server', async function () {
    config.cronActive = false;
    await helperServer.before(EXAMPLE_COURSE_PATH).call(this);
    config.cronActive = true;

    // We want to test a news item page, so we need to "init" them.
    await news_items.init({
      notifyIfPreviouslyEmpty: true,
      errorIfLockNotAcquired: true,
    });

    const app = server.initExpress();
    endpoints = expressListEndpoints(app);
    endpoints.sort((a, b) => a.path.localeCompare(b.path));

    const firstNewsItemResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM news_items ORDER BY id ASC LIMIT 1',
      {},
    );

    const questionGalleryAssessmentResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM assessments WHERE tid = $tid',
      {
        tid: 'gallery/elements',
      },
    );

    const codeElementQuestionResult = await sqldb.queryOneRowAsync(
      'SELECT id FROM questions WHERE qid = $qid',
      {
        qid: 'element/code',
      },
    );

    await features.enable('question-sharing');

    routeParams = {
      ...STATIC_ROUTE_PARAMS,
      news_item_id: firstNewsItemResult.rows[0].id,
      assessment_id: questionGalleryAssessmentResult.rows[0].id,
      question_id: codeElementQuestionResult.rows[0].id,
    };

    await sqldb.queryOneRowAsync(
      'UPDATE questions SET shared_publicly = true WHERE id = $question_id',
      { question_id: routeParams.question_id },
    );
  });
  after('shut down testing server', helperServer.after);

  test('All pages pass accessibility checks', async function () {
    this.timeout(240_000);

    const missingParamsEndpoints: expressListEndpoints.Endpoint[] = [];
    const failingEndpoints: [expressListEndpoints.Endpoint, any][] = [];

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
      try {
        await checkPage(url);
      } catch (err) {
        failingEndpoints.push([endpoint, err]);
      }
    }

    const errLines: string[] = [];

    if (missingParamsEndpoints.length > 0) {
      errLines.push('The following endpoints are missing params:');
      missingParamsEndpoints.forEach((e) => errLines.push(`  ${e.path}`));
    }

    if (failingEndpoints.length > 0) {
      errLines.push('The following endpoints failed accessibility checks:\n');
      failingEndpoints.forEach(([e, err]) => {
        errLines.push(e.path, err.message, '');
      });
    }

    if (errLines.length > 0) {
      throw new Error(errLines.join('\n'));
    }
  });
});
