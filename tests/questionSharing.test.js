// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const { step } = require('mocha-steps');
const path = require('path');
const config = require('../lib/config');
const fetch = require('node-fetch').default;
const helperClient = require('./helperClient');
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqldb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const UUID_REGEXP = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function sharingPageUrl(courseId) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`
}

async function setSharingName(courseId, name) {
  const sharingUrl = sharingPageUrl(courseId);
  const response = await helperClient.fetchCheerio(sharingUrl);

  const token = response.$('#test_csrf_token').text();
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

  // Must sync two courses to test sharing from one to the other, and we must
  // force one sync to complete before the other to avoid database errors 
  before('set up testing server', helperServer.before([
    path.join(__dirname, '..', 'testCourse'),
    // path.join(__dirname, '..', 'exampleCourse')
  ]));
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await sqldb.queryAsync(sql.enable_question_sharing, {});
  });

  describe('Create a sharing set and add a question to it', () => {
    const testCourseId = 1;
    const testCourseSharingName = 'test-course';
    const exampleCourseId = 2;
    const exampleCourseSharingName = 'example-course';
    const sharingSetName = 'share-set-example';

    let exampleCourseSharingId;

    // step('Initialize courses, expect one to fail because of import', async () => {
    //   helperServer.before([
    //     path.join(__dirname, '..', 'testCourse'),
    //     path.join(__dirname, '..', 'exampleCourse')
    //   ])(() => null);
    // });

    // step('ensure course has question sharing enabled', async () => {
    //   await sqldb.queryAsync(sql.enable_question_sharing, {});
    // });

    step('Fail if trying to set an invalid sharing name', async () => {
      // TODO throw an exception in SQL, catch it, return an error
    });

    step('Set test course sharing name', async () => {
      await setSharingName(testCourseId, testCourseSharingName);
      let sharingPage = await (await fetch(sharingPageUrl(testCourseId))).text();
      assert(sharingPage.includes(testCourseSharingName));
    });

    step('Fail if trying to set sharing name again.', async () => {
      // TODO throw an exception in SQL, catch it, return an error
    });

    // step('Set example course sharing name', async () => {
    //   await setSharingName(exampleCourseId, exampleCourseSharingName);
    //   let sharingPage = await (await fetch(sharingPageUrl(exampleCourseId))).text();
    //   assert(sharingPage.includes(exampleCourseSharingName));
    // });

    // step('Generate sharing ID for example course', async () => {
    //   const sharingUrl = sharingPageUrl(exampleCourseId);
    //   let response = await helperClient.fetchCheerio(sharingUrl);    
    //   const token = response.$('#test_csrf_token').text();
    //   await fetch(sharingUrl, {
    //     method: 'POST',
    //     headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    //     body: new URLSearchParams({
    //       __action: 'sharing_id_regenerate',
    //       __csrf_token: token,
    //     }).toString(),
    //   });

    //   response = await helperClient.fetchCheerio(sharingUrl);   
    //   exampleCourseSharingId = UUID_REGEXP.exec(response.text());
    //   console.log(exampleCourseId);
    // });

    // step('Create a sharing set', async () => {
    //   const sharingUrl = sharingPageUrl(exampleCourseId);
    //   let response = await helperClient.fetchCheerio(sharingUrl);    
    //   const token = response.$('#test_csrf_token').text();
    //   await fetch(sharingUrl, {
    //     method: 'POST',
    //     headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    //     body: new URLSearchParams({
    //       __action: 'sharing_set_create',
    //       __csrf_token: token,
    //       sharing_set_name: sharingSetName
    //     }).toString(),
    //   });

    //   let sharingPage = await (await fetch(sharingPageUrl(exampleCourseId))).text();
    //   console.log(sharingPage);
    //   assert(sharingPage.includes(exampleCourseSharingName));
    // });

    // step('Attempt to create another sharing set with the same name', async () => {
    //   // TODO ensure that the sharing set name you created only appears once on the page
    // });


    // step('Attempt to create a sharing set with an invalid name', async () => {

    // });

    // step('Share sharing set with example course', async () => {
    //   const sharingUrl = sharingPageUrl(exampleCourseId);
    //   let response = await helperClient.fetchCheerio(sharingUrl);    
    //   const token = response.$('#test_csrf_token').text();
    //   await fetch(sharingUrl, {
    //     method: 'POST',
    //     headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    //     body: new URLSearchParams({
    //       __action: 'sharing_set_create',
    //       __csrf_token: token,
    //       sharing_set_id: '1',
    //       course_sharing_id: exampleCourseSharingId
    //     }).toString(),
    //   });
    // });

    // step('Attempt to share sharing set with invalid course ID', async () => {

    // });


    // step('Attempt to create another sharing set with the same name', async () => {

    // });


  });
});
