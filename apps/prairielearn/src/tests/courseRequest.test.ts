import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { insertCourseRequest, selectAllCourseRequests } from '../lib/course-request.js';
import { createAdministratorTrpcClient } from '../trpc/administrator/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const coursesAdminUrl = `${baseUrl}/administrator/courses`;
const courseRequestsAdminUrl = `${baseUrl}/administrator/courseRequests`;
const allCourseRequestsAdminUrl = `${courseRequestsAdminUrl}?status=all`;

describe('Course requests', { timeout: 60_000 }, function () {
  let trpcClient: ReturnType<typeof createAdministratorTrpcClient>;

  beforeAll(helperServer.before());
  beforeAll(() => {
    trpcClient = createAdministratorTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        { url: '/pl/administrator/trpc', authn_user_id: '1' },
        config.secretKey,
      ),
      urlBase: siteUrl,
    });
  });
  afterAll(helperServer.after);

  let courseRequestId: string;
  const shortName = 'TEST 101';
  const title = 'Course Request Test Course';

  test('insert a course request', { concurrent: false }, async () => {
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
    test('deny the course request', { concurrent: false }, async () => {
      await trpcClient.courseRequests.deny.mutate({ courseRequestId });
    });

    test('verify status is denied in database', { concurrent: false }, async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.isDefined(request);
      assert.equal(request.approved_status, 'denied');
    });

    test('verify denied badge is rendered on the page', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // The CourseRequestStatusIcon renders "Denied" for denied requests
      const deniedBadge = response.$(`td:contains("${shortName}")`).closest('tr').find('td');
      const rowHtml = deniedBadge.text();
      assert.include(rowHtml, 'Denied');
    });
  });

  describe('dedicated course requests page', () => {
    test('default course requests page shows pending requests', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // The default view shows pending requests only.
      const heading = response.$('h1');
      assert.include(heading.text(), 'Pending');

      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.strictEqual(requestCell.length, 0);
    });

    test(
      'all course requests page loads and shows all statuses',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
        assert.isTrue(response.ok);

        const heading = response.$('h1');
        assert.include(heading.text(), 'All');

        const requestCell = response.$(`td:contains("${shortName}")`);
        assert.strictEqual(requestCell.length, 1);
        assert.strictEqual(requestCell.text().trim(), `${shortName}: ${title}`);
      },
    );

    test('all course requests page shows "Updated By" column', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const headers = response.$('th');
      const headerTexts = headers.toArray().map((h) => response.$(h).text());
      assert.include(headerTexts, 'Updated By');
    });
  });

  describe('deny then verify actions column', () => {
    let secondRequestId: string;
    const secondShortName = 'CR TEST 202';

    test('insert a new pending course request', { concurrent: false }, async () => {
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

    test('pending request has deny and approve buttons', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
      assert.equal(requestRow.length, 1);
      const rowHtml = requestRow.html();
      assert.isString(rowHtml);
      assert.include(rowHtml, 'Deny');
      assert.include(rowHtml, 'Approve');
    });

    test('deny the second request', { concurrent: false }, async () => {
      await trpcClient.courseRequests.deny.mutate({
        courseRequestId: secondRequestId,
      });
    });

    test(
      'denied request still has action buttons (can be re-approved)',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
        assert.isTrue(response.ok);

        const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
        assert.equal(requestRow.length, 1);
        const rowHtml = requestRow.html();
        assert.isString(rowHtml);
        assert.include(rowHtml, 'Deny');
        assert.include(rowHtml, 'Approve');
      },
    );
  });

  describe('course request appears on the right pages', () => {
    let pendingRequestId: string;
    const pendingShortName = 'CR TEST 303';
    const pendingTitle = 'Pending Test Course';

    test('insert a pending course request', { concurrent: false }, async () => {
      pendingRequestId = await insertCourseRequest({
        short_name: pendingShortName,
        title: pendingTitle,
        user_id: '1',
        github_user: 'EduardoMVAz',
        first_name: 'Test',
        last_name: 'User',
        work_email: 'test3@example.com',
        institution: 'Test Institution',
        referral_source: null,
      });
    });

    test(
      'pending request does not appear on admin courses page',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(coursesAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.strictEqual(requestCell.length, 0);
      },
    );

    test(
      'pending request appears on default course requests page',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.strictEqual(requestCell.length, 1);
        assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
      },
    );

    test('pending request appears on all course requests page', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 1);
      assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
    });

    test('deny the pending request', { concurrent: false }, async () => {
      await trpcClient.courseRequests.deny.mutate({
        courseRequestId: pendingRequestId,
      });
    });

    test(
      'denied request does NOT appear on admin courses page (pending only)',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(coursesAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.equal(requestCell.length, 0);
      },
    );

    test(
      'denied request does not appear on default course requests page',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.strictEqual(requestCell.length, 0);
      },
    );

    test(
      'denied request still appears on all course requests page',
      { concurrent: false },
      async () => {
        const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
        assert.isTrue(response.ok);

        const requestCell = response.$(`td:contains("${pendingShortName}")`);
        assert.strictEqual(requestCell.length, 1);
        assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
      },
    );
  });
});
