import type { CheerioAPI } from 'cheerio';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { insertCourseRequest, selectAllCourseRequests } from '../lib/course-request.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const coursesAdminUrl = `${baseUrl}/administrator/courses`;
const courseRequestsAdminUrl = `${baseUrl}/administrator/courseRequests`;

function extractCsrfToken($: CheerioAPI, component: string): string {
  const dataScript = $(`script[data-component-props][data-component="${component}"]`);
  const props = superjson.parse<{ csrfToken: string }>(dataScript.text());
  return props.csrfToken;
}

describe('Course requests', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  let courseRequestId: string;
  let csrfToken: string;
  const shortName = 'TEST 101';
  const title = 'Course Request Test Course';

  test.sequential('insert a course request', async () => {
    courseRequestId = await insertCourseRequest({
      short_name: shortName,
      title,
      user_id: '1',
      github_user: 'EduardoMVAz',
      first_name: 'Test',
      last_name: 'User',
      work_email: 'test@example.com',
      institution: 'Test Institution',
      referral_source: null,
    });
  });

  describe('deny a course request', () => {
    test.sequential('load admin courses page and extract CSRF token', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);
      csrfToken = extractCsrfToken(response.$, 'AdministratorCourses');
      assert.isString(csrfToken);
    });

    test.sequential('POST deny action', async () => {
      const response = await fetch(coursesAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'deny_course_request',
          __csrf_token: csrfToken,
          request_id: courseRequestId,
        }),
      });
      assert.isTrue(response.ok);
    });

    test.sequential('verify status is denied in database', async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.isDefined(request);
      assert.equal(request.approved_status, 'denied');
    });

    test.sequential('verify denied badge is rendered on the page', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // The CourseRequestStatusIcon renders "Denied" for denied requests
      const deniedBadge = response.$(`td:contains("${shortName}")`).closest('tr').find('td');
      const rowHtml = deniedBadge.text();
      assert.include(rowHtml, 'Denied');
    });
  });

  describe('dedicated course requests page', () => {
    test.sequential('course requests page loads and shows all statuses', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // Should have the "All course requests" header
      const heading = response.$('h2');
      assert.include(heading.text(), 'All');

      // The denied request should appear on this page
      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.isAtLeast(requestCell.length, 1);
    });

    test.sequential('course requests page shows "Updated By" column', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // showAll=true renders an "Updated By" column
      const headers = response.$('th');
      const headerTexts = headers.toArray().map((h) => response.$(h).text());
      assert.include(headerTexts, 'Updated By');
    });
  });

  describe('deny then verify actions column', () => {
    let secondRequestId: string;
    const secondShortName = 'CR TEST 202';

    test.sequential('insert a new pending course request', async () => {
      secondRequestId = await insertCourseRequest({
        short_name: secondShortName,
        title: 'Second Test Course',
        user_id: '1',
        github_user: 'EduardoMVAz',
        first_name: 'Test',
        last_name: 'User',
        work_email: 'test2@example.com',
        institution: 'Test Institution',
        referral_source: null,
      });
    });

    test.sequential('pending request has deny and approve buttons', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
      const rowHtml = requestRow.html() ?? '';
      assert.include(rowHtml, 'Deny');
      assert.include(rowHtml, 'Approve');
    });

    test.sequential('deny the second request', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      csrfToken = extractCsrfToken(response.$, 'AdministratorCourseRequests');

      const denyResponse = await fetch(courseRequestsAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'deny_course_request',
          __csrf_token: csrfToken,
          request_id: secondRequestId,
        }),
      });
      assert.isTrue(denyResponse.ok);
    });

    test.sequential('denied request still has action buttons (can be re-approved)', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // denied !== 'approved', so Deny and Approve buttons should still render
      const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
      const rowHtml = requestRow.html() ?? '';
      assert.include(rowHtml, 'Deny');
      assert.include(rowHtml, 'Approve');
    });
  });

  describe('course request appears on the right pages', () => {
    let pendingRequestId: string;
    const pendingShortName = 'CR TEST 303';

    test.sequential('insert a pending course request', async () => {
      pendingRequestId = await insertCourseRequest({
        short_name: pendingShortName,
        title: 'Pending Test Course',
        user_id: '1',
        github_user: 'EduardoMVAz',
        first_name: 'Test',
        last_name: 'User',
        work_email: 'test3@example.com',
        institution: 'Test Institution',
        referral_source: null,
      });
    });

    test.sequential('pending request appears on admin courses page (pending only)', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.isAtLeast(requestCell.length, 1);
    });

    test.sequential('pending request appears on course requests page (all)', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.isAtLeast(requestCell.length, 1);
    });

    test.sequential('deny the pending request', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      csrfToken = extractCsrfToken(response.$, 'AdministratorCourses');

      const denyResponse = await fetch(coursesAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'deny_course_request',
          __csrf_token: csrfToken,
          request_id: pendingRequestId,
        }),
      });
      assert.isTrue(denyResponse.ok);
    });

    test.sequential(
      'denied request does NOT appear on admin courses page (pending only)',
      async () => {
        const response = await helperClient.fetchCheerio(coursesAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.equal(requestCell.length, 0);
      },
    );

    test.sequential('denied request still appears on course requests page (all)', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.isAtLeast(requestCell.length, 1);
    });
  });
});
