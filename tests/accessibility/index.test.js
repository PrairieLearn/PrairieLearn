// @ts-check
const path = require('path');
const { test } = require('mocha');
const axe = require('axe-core');
const jsdom = require('jsdom');
const fetch = require('node-fetch').default;
const { A11yError } = require('@sa11y/format');

const config = require('../../lib/config');
const helperServer = require('../helperServer');

const SITE_URL = 'http://localhost:' + config.serverPort;
const EXAMPLE_COURSE_DIR = path.resolve(__dirname, '..', '..', 'exampleCourse');

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
  const results = await axe.run(page.window.document.documentElement);
  A11yError.checkAndThrow(results.violations);
}

// These are meant to be a representative sample of pages from across the site.
// We hardcode database IDs to 1, as such entities will always exist. We don't
// case exactly which entities are used, just that we get a representative page
// of each "kind".
const pages = [
  '/',
  '/pl/enroll',
  '/pl/settings',
  '/pl/news_items',
  '/pl/request_course',

  // Student pages
  '/pl/course_instance/1/assessments',
  '/pl/course_instance/1/assessment/1',
  '/pl/course_instance/1/instance_question/1',
  '/pl/course_instance/1/gradebook',

  // Instructor pages (course admin)
  '/pl/course_instance/1/instructor/course_admin/sets',
  '/pl/course_instance/1/instructor/course_admin/instances',
  '/pl/course_instance/1/instructor/course_admin/issues',
  '/pl/course_instance/1/instructor/course_admin/questions',
  '/pl/course_instance/1/instructor/course_admin/settings',
  '/pl/course_instance/1/instructor/course_admin/staff',
  '/pl/course_instance/1/instructor/course_admin/syncs',
  '/pl/course_instance/1/instructor/course_admin/tags',
  '/pl/course_instance/1/instructor/course_admin/topics',

  // Instructor pages (instance admin)
  '/pl/course_instance/1/instructor/instance_admin/access',
  '/pl/course_instance/1/instructor/instance_admin/assessments',
  '/pl/course_instance/1/instructor/instance_admin/file_view',
  '/pl/course_instance/1/instructor/instance_admin/gradebook',
  '/pl/course_instance/1/instructor/instance_admin/lti',
  '/pl/course_instance/1/instructor/instance_admin/settings',

  // Instructor pages (assessment)
  '/pl/course_instance/1/instructor/assessment/1/access',
  '/pl/course_instance/1/instructor/assessment/1/downloads',
  '/pl/course_instance/1/instructor/assessment/1/file_view',
  '/pl/course_instance/1/instructor/assessment/1/groups',
  '/pl/course_instance/1/instructor/assessment/1/questions',
  '/pl/course_instance/1/instructor/assessment/1/question_statistics',
  '/pl/course_instance/1/instructor/assessment/1/regrading',
  '/pl/course_instance/1/instructor/assessment/1/settings',
  '/pl/course_instance/1/instructor/assessment/1/assessment_statistics',
  '/pl/course_instance/1/instructor/assessment/1/instances',
  '/pl/course_instance/1/instructor/assessment/1/uploads',

  // Instructor pages (question)
  '/pl/course_instance/1/instructor/question/1/preview',
  '/pl/course_instance/1/instructor/question/1/settings',
  '/pl/course_instance/1/instructor/question/1/statistics',

  // Instructor pages (miscellaneous)
  '/pl/course_instance/1/effectiveUser',
];

describe('accessibility', () => {
  before('set up testing server', helperServer.before(EXAMPLE_COURSE_DIR));
  after('shut down testing server', helperServer.after);

  pages.forEach((page) => {
    // let title = typeof page === 'string' ? page : page.title;
    test(page, async () => {
      await checkPage(page);
    });
  });
});
