// @ts-check
const { test } = require('mocha');
const axe = require('axe-core');
const jsdom = require('jsdom');
const fetch = require('node-fetch').default;
const { A11yError } = require('@sa11y/format');

const config = require('../../lib/config');
const helperServer = require('../helperServer');

const SITE_URL = 'http://localhost:' + config.serverPort;

/**
 * Loads the given URL into a JSDOM object.
 *
 * @param {string} url
 * @returns {Promise<import('jsdom').JSDOM>}
 */
async function loadPage(url) {
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
  const page = await loadPage(SITE_URL + url);
  const results = await axe.run(page.window.document.documentElement);
  A11yError.checkAndThrow(results.violations);
  // reportViolations(url, results);
}

const pages = [
  '/',
  '/pl/enroll',
  '/pl/settings',
  '/pl/news_items',
  '/pl/request_course',
  // Student pages
  '/pl/course_instance/1/assessments',
  '/pl/course_instance/1/assessment/1',
  // Instructor pages
  '/pl/course_instance/1/instructor/assessments',
  '/pl/course_instance/1/instructor/assessment/1',
  '/pl/course_instance/1/effectiveUser',
];

describe('accessibility', () => {
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  pages.forEach((page) => {
    test(page, async () => {
      await checkPage(page);
    });
  });
});
