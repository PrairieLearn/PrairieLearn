// @ts-check
const path = require('path');
const { test } = require('mocha');
const axe = require('axe-core');
const jsdom = require('jsdom');
const fetch = require('node-fetch').default;
const { A11yError } = require('@sa11y/format');
const util = require('util');
const expressListEndpoints = require('express-list-endpoints');

const server = require('../../server');
const config = require('../../lib/config');
const helperServer = require('../helperServer');

config.cronActive = false;

const SITE_URL = 'http://localhost:' + config.serverPort;
const EXAMPLE_COURSE_DIR = path.resolve(__dirname, '..', '..', 'exampleCourse');

/**
 * Several pages have very large DOMs or attributes that AXE runs very slow on.
 * None of these elements have accessibility components, so we'll special-case these
 * and remove them before running AXE.
 *
 * @param {import('jsdom').JSDOM} page
 */
function cleanLargePages(url, page) {
  if (url === '/pl/course_instance/1/instructor/course_admin/questions') {
    // This attribute is very large, which somehow corresponds to a long running
    // time for AXE. It's irrelevant for our checks, so we just remove it.
    page.window.document.querySelector('#questionsTable').removeAttribute('data-data');
  }

  if (
    url === '/pl/course_instance/1/instructor/instance_admin/settings' ||
    url === '/pl/course_instance/1/instructor/assessment/1/settings'
  ) {
    // The SVG for the QR code contains many elements, which in turn makes AXE
    // run very slow. We don't need to check the accessibility of the QR code
    // itself, so we'll remove the children.
    page.window.document
      .querySelectorAll('#js-student-link-qrcode svg > *')
      .forEach((e) => e.remove());
  }
}

/**
 * Loads the given URL into a JSDOM object.
 *
 * @param {string} url
 * @returns {Promise<import('jsdom').JSDOM>}
 */
async function loadPageJsdom(url) {
  const text = await fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(`Error loading page: ${res.status}`);
    }
    return res.text();
  });
  return new jsdom.JSDOM(text);
}

/**
 * Checks the given URL for accessibility violations.
 *
 * @param {string} url
 */
async function checkPage(url) {
  const page = await loadPageJsdom(SITE_URL + url);
  cleanLargePages(url, page);
  const results = await axe.run(page.window.document.documentElement);
  A11yError.checkAndThrow(results.violations);
}

// These are trivially known because there will only be one course and course
// instance in the database after syncing the example course.
const STATIC_ROUTE_PARAMS = {
  course_id: 1,
  course_instance_id: 1,
  // We're cheating a bit with this one, as this job (the initial sync) won't
  // actually be renderable on every single job sequence page in production.
  // However, it will be in tests, since we're using an admin role.
  job_sequence_id: 1,
};

const OTHER_ROUTE_PARAMS = {
  // TODO: use specific fixed assessment.
  assessment_id: 1,
  // TODO: use a specific fixed question.
  question_id: 1,
};

function getRouteParams(url) {
  const routeParams = url.match(/:([^/]+)/g);

  if (!routeParams) return [];

  // Strip leading colon.
  return routeParams.map((p) => p.slice(1));
}

/**
 * @param {string} url
 * @param {Record<string, any>} params
 */
function getMissingRouteParams(url, params) {
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

  // This page is not user-visible.
  '/pl/webhooks/ping',

  // These routes just render JSON.
  /^\/pl\/api\/v1\//,
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id/instances.json',

  // Static assets.
  '/pl/static/elements/*',
  '/pl/static/cacheableElements/:cachebuster/*',
  '/pl/course/:course_id/cacheableElementExtensions/:cachebuster/*',
  '/pl/course/:course_id/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/cacheableElementExtensions/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/cacheableElements/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/instructor/cacheableElementExtensions/:cachebuster/*',
  '/pl/course_instance/:course_instance_id/instructor/cacheableElements/:cachebuster/*',

  // File downloads.
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/file/:unsafe_file_id/:unsafe_display_filename',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/submission/:submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/downloads/:filename',
  '/pl/course_instance/:course_instance_id/instructor/grading_job/:job_id/file/:file',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/instance_admin/gradebook/:filename',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/clientFilesQuestion/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/generatedFilesQuestion/variant/:variant_id/*',
  '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/submission/:submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/news_item/:news_item_id/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_download/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/file/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/text/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/statistics/:filename',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/submission/:submission_id/file/*',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/text/:filename',
  '/pl/course_instance/:course_instance_id/news_item/:news_item_id/*',
  '/pl/course/:course_id/clientFilesCourse/*',
  '/pl/course/:course_id/course_admin/file_download/*',
  '/pl/course/:course_id/news_item/:news_item_id/*',
  '/pl/course/:course_id/question/:question_id/preview/text/:filename',
  '/pl/course/:course_id/question/:question_id/statistics/:filename',
  '/pl/course/:course_id/question/:question_id/submission/:submission_id/file/*',
  '/pl/course/:course_id/question/:question_id/file/:filename',
  '/pl/course/:course_id/question/:question_id/text/:filename',

  // Renders partial HTML documents, not a full page.
  '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/variant/:variant_id/submission/:submission_id',
  '/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/variant/:variant_id/submission/:submission_id',
  '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/time_remaining',

  // These pages just redirect to other pages and thus don't have to be tested.
  '/pl/loadFromDisk',
  '/pl/oauth2login',
  '/pl/oauth2callback',
  '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id/next_ungraded',

  // TODO: enable once the following PR is merged:
  // https://github.com/PrairieLearn/PrairieLearn/pull/7382
  '/pl/course/:course_id/effectiveUser',
];

// const ONLY_ROUTES = ['/pl/course_instance/:course_instance_id/effectiveUser'];
const ONLY_ROUTES = [];

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
  let endpoints = [];
  let routeParams = {};
  before('set up testing server', async function () {
    await util.promisify(helperServer.before(EXAMPLE_COURSE_DIR).bind(this))();

    const app = server.initExpress();
    endpoints = expressListEndpoints(app);
    endpoints.sort((a, b) => a.path.localeCompare(b.path));

    routeParams = {
      ...STATIC_ROUTE_PARAMS,
      ...OTHER_ROUTE_PARAMS,
    };
  });
  after('shut down testing server', helperServer.after);

  test('All pages pass accessibility checks', async function () {
    this.timeout(120_000);

    const invalidEndpoints = [];
    const missingParamsEndpoints = [];
    const failingEndpoints = [];

    for (const endpoint of endpoints) {
      console.log(endpoint);

      if (endpoint.path.startsWith('/ RegExp(')) {
        // `express-list-endpoints` doesn't handle regex routes well.
        // We'll just ignore them for now.
        invalidEndpoints.push(endpoint);
        continue;
      }

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

      if (ONLY_ROUTES.length > 0 && !ONLY_ROUTES.includes(endpoint.path)) {
        continue;
      }

      const url = substituteParams(endpoint.path, routeParams);
      try {
        await checkPage(url);
      } catch (err) {
        failingEndpoints.push([endpoint, err]);
      }
    }

    let shouldFail = false;

    if (missingParamsEndpoints.length > 0) {
      console.log('The following endpoints are missing params:');
      missingParamsEndpoints.forEach((e) => console.log(`  ${e.path}`));
      shouldFail = true;
    }

    if (invalidEndpoints.length > 0) {
      console.log('The following endpoints are invalid:');
      invalidEndpoints.forEach((e) => console.log(`  ${e.path}`));
    }

    if (failingEndpoints.length > 0) {
      console.log('The following endpoints failed accessibility checks:\n');
      failingEndpoints.forEach(([e, err]) => {
        console.log(e.path);
        console.log(err.message);
        console.log('\n');
      });
    }

    if (shouldFail) {
      // TODO: construct one big string for all the errors?
      throw new Error('See logs for errors.');
    }
  });
});
