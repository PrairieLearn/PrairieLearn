// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const fetch = require('node-fetch').default;
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqldb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

function sharingPageUrl(courseId) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`
}

async function setSharingName(courseId, name) {
  const sharingUrl = sharingPageUrl(courseId);
  let sharingPage = await (await fetch(sharingUrl)).text();
  let $sharingPage = cheerio.load(sharingPage);

  const token = $sharingPage('#test_csrf_token').text();
  await fetch(sharingUrl, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      __action: 'choose_sharing_name',
      __csrf_token: token,
      course_sharing_name: name
    }).toString(),
  });
}

describe('Question Sharing', function () {
  this.timeout(80000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await sqldb.queryAsync(sql.enable_question_sharing, {});
  });

  describe('Create a sharing set and add a question to it', () => {
    const testCourseId = 1;
    const testCourseSharingName = 'test-course';
    const exampleCourseId = 2;
    const exampleCourseSharingName = 'example-course';
    let exampleCourseSharingId;

    step('Fail if trying to set an invalid sharing name', async () => {
      // TODO throw an exception in SQL, catch it, return an error
    });

    step('Set test course sharing name', async () => {
      await setSharingName(testCourseId, testCourseSharingName);
      let sharingPage = await (await fetch(sharingPageUrl(testCourseId))).text();
      assert(sharingPage.includes('test-course'));
    });

    step('Fail if trying to set sharing name again.', async () => {
      // TODO throw an exception in SQL, catch it, return an error
    });

    step('Set example course sharing name', async () => {

    });

    step('Generate sharing ID for example course', async () => {

      exampleCourseSharingId = ""; // scrape off the webpage after generating it.
    });

    step('Create a sharing set', async () => {

    });

    step('Attempt to create a sharing set with an invalid name', async () => {

    });

    step('Share sharing set with example course', async () => {

    });

    step('Attempt to share sharing set with invalid course ID', async () => {

    });

    step('Attempt to create another sharing set with the same name', async () => {

    });


    step('Attempt to create another sharing set with the same name', async () => {

    });


  });
});
