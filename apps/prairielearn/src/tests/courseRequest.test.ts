import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import {
  getNewCourseRequestContactEmail,
  insertCourseRequest,
  selectAllCourseRequests,
  selectCourseRequestById,
} from '../lib/course-request.js';
import { createAdministratorTrpcClient } from '../trpc/administrator/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const coursesAdminUrl = `${baseUrl}/administrator/courses`;
const courseRequestsAdminUrl = `${baseUrl}/administrator/courseRequests`;
const allCourseRequestsAdminUrl = `${courseRequestsAdminUrl}?status=all`;

describe('Course requests', { timeout: 60_000, concurrent: false }, function () {
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

  describe('new request contact email', () => {
    test('uses the explicitly submitted email for the default institution', () => {
      assert.equal(
        getNewCourseRequestContactEmail({
          isDefaultInstitution: true,
          submittedEmail: 'explicit@example.edu',
          accountEmail: 'account@example.edu',
        }),
        'explicit@example.edu',
      );
    });

    test('uses the account email for a non-default institution', () => {
      assert.equal(
        getNewCourseRequestContactEmail({
          isDefaultInstitution: false,
          submittedEmail: 'ignored@example.edu',
          accountEmail: 'account@example.edu',
        }),
        'account@example.edu',
      );
    });

    test('does not substitute the UID when the account email is missing', () => {
      assert.isNull(
        getNewCourseRequestContactEmail({
          isDefaultInstitution: false,
          submittedEmail: '',
          accountEmail: null,
        }),
      );
    });
  });

  describe('admin requester identities', () => {
    const explicitShortName = 'CONTACT 101';
    const legacyShortName = 'CONTACT 102';
    const missingShortName = 'CONTACT 103';

    test('derives contact email without conflating it with the account UID', async () => {
      const explicitUser = await getOrCreateUser({
        uid: 'explicit-login-id',
        name: 'Explicit Account Name',
        uin: null,
        email: 'account-address@example.edu',
      });
      const legacyUser = await getOrCreateUser({
        uid: 'legacy.uid@identity.example',
        name: 'Legacy Account Name',
        uin: null,
        email: 'legacy-contact@example.edu',
      });
      const missingEmailUser = await getOrCreateUser({
        uid: 'missing-email-login-id',
        name: 'Missing Email Account',
        uin: null,
        email: null,
      });

      const explicitRequestId = await insertCourseRequest({
        short_name: explicitShortName,
        title: 'Explicit contact email',
        user_id: explicitUser.id,
        github_user: null,
        first_name: 'Explicit',
        last_name: 'Requester',
        work_email: 'explicit-contact@example.edu',
        institution: 'Test Institution',
        referral_source: null,
      });
      const legacyRequestId = await insertCourseRequest({
        short_name: legacyShortName,
        title: 'Legacy UID copy',
        user_id: legacyUser.id,
        github_user: null,
        first_name: 'Legacy',
        last_name: 'Requester',
        work_email: legacyUser.uid,
        institution: 'Test Institution',
        referral_source: null,
      });
      const missingRequestId = await insertCourseRequest({
        short_name: missingShortName,
        title: 'Missing account email',
        user_id: missingEmailUser.id,
        github_user: null,
        first_name: 'Missing',
        last_name: 'Requester',
        work_email: missingEmailUser.uid,
        institution: 'Test Institution',
        referral_source: null,
      });

      const requests = await selectAllCourseRequests();
      const explicitRequest = requests.find((request) => request.id === explicitRequestId);
      const legacyRequest = requests.find((request) => request.id === legacyRequestId);
      const missingRequest = requests.find((request) => request.id === missingRequestId);

      assert.isDefined(explicitRequest);
      assert.equal(explicitRequest.work_email, 'explicit-contact@example.edu');
      assert.equal(explicitRequest.contact_email, 'explicit-contact@example.edu');
      assert.equal(explicitRequest.user_uid, explicitUser.uid);

      assert.isDefined(legacyRequest);
      assert.equal(legacyRequest.work_email, legacyUser.uid);
      assert.equal(legacyRequest.contact_email, legacyUser.email);
      assert.equal(legacyRequest.user_uid, legacyUser.uid);

      const legacyRequestForLegitimacyCheck = await selectCourseRequestById({
        courseRequestId: legacyRequestId,
      });
      assert.equal(legacyRequestForLegitimacyCheck.contact_email, legacyUser.email);
      assert.equal(legacyRequestForLegitimacyCheck.user_uid, legacyUser.uid);

      assert.isDefined(missingRequest);
      assert.equal(missingRequest.work_email, missingEmailUser.uid);
      assert.isNull(missingRequest.contact_email);
      assert.equal(missingRequest.user_uid, missingEmailUser.uid);
    });

    test('renders distinct requester contact and account UID columns', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const headerTexts = response
        .$('th')
        .toArray()
        .map((header) => response.$(header).text());
      assert.include(headerTexts, 'Requester / contact email');
      assert.include(headerTexts, 'PrairieLearn account (UID)');

      const explicitCells = response
        .$(`td:contains("${explicitShortName}")`)
        .closest('tr')
        .find('td');
      assert.include(explicitCells.eq(3).text(), 'explicit-contact@example.edu');
      assert.notInclude(explicitCells.eq(3).text(), 'explicit-login-id');
      assert.include(explicitCells.eq(4).text(), 'explicit-login-id');

      const legacyCells = response.$(`td:contains("${legacyShortName}")`).closest('tr').find('td');
      assert.include(legacyCells.eq(3).text(), 'legacy-contact@example.edu');
      assert.notInclude(legacyCells.eq(3).text(), 'legacy.uid@identity.example');
      assert.include(legacyCells.eq(4).text(), 'legacy.uid@identity.example');

      const missingCells = response
        .$(`td:contains("${missingShortName}")`)
        .closest('tr')
        .find('td');
      assert.include(missingCells.eq(3).text(), 'Contact email unavailable');
      assert.include(missingCells.eq(4).text(), 'missing-email-login-id');
    });
  });

  test('insert a course request', async () => {
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
    test('deny the course request', async () => {
      await trpcClient.courseRequests.deny.mutate({ courseRequestId });
    });

    test('verify status is denied in database', async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.isDefined(request);
      assert.equal(request.approved_status, 'denied');
    });

    test('verify denied badge is rendered on the page', async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // The CourseRequestStatusIcon renders "Denied" for denied requests
      const deniedBadge = response.$(`td:contains("${shortName}")`).closest('tr').find('td');
      const rowHtml = deniedBadge.text();
      assert.include(rowHtml, 'Denied');
    });
  });

  describe('dedicated course requests page', () => {
    test('default course requests page shows pending requests', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      // The default view shows pending requests only.
      const heading = response.$('h1');
      assert.include(heading.text(), 'Pending');

      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.strictEqual(requestCell.length, 0);
    });

    test('all course requests page loads and shows all statuses', async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const heading = response.$('h1');
      assert.include(heading.text(), 'All');

      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.strictEqual(requestCell.length, 1);
      assert.strictEqual(requestCell.text().trim(), `${shortName}: ${title}`);
    });

    test('all course requests page shows "Updated By" column', async () => {
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

    test('insert a new pending course request', async () => {
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

    test('pending request has deny and approve buttons', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
      assert.equal(requestRow.length, 1);
      const rowHtml = requestRow.html();
      assert.isString(rowHtml);
      assert.include(rowHtml, 'Deny');
      assert.include(rowHtml, 'Approve');
    });

    test('deny the second request', async () => {
      await trpcClient.courseRequests.deny.mutate({
        courseRequestId: secondRequestId,
      });
    });

    test('denied request still has action buttons (can be re-approved)', async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestRow = response.$(`td:contains("${secondShortName}")`).closest('tr');
      assert.equal(requestRow.length, 1);
      const rowHtml = requestRow.html();
      assert.isString(rowHtml);
      assert.include(rowHtml, 'Deny');
      assert.include(rowHtml, 'Approve');
    });
  });

  describe('course request appears on the right pages', () => {
    let pendingRequestId: string;
    const pendingShortName = 'CR TEST 303';
    const pendingTitle = 'Pending Test Course';

    test('insert a pending course request', async () => {
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

    test('pending request does not appear on admin courses page', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 0);
    });

    test('pending request appears on default course requests page', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 1);
      assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
    });

    test('pending request appears on all course requests page', async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 1);
      assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
    });

    test('deny the pending request', async () => {
      await trpcClient.courseRequests.deny.mutate({
        courseRequestId: pendingRequestId,
      });
    });

    test('denied request does NOT appear on admin courses page (pending only)', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.equal(requestCell.length, 0);
    });

    test('denied request does not appear on default course requests page', async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 0);
    });

    test('denied request still appears on all course requests page', async () => {
      const response = await helperClient.fetchCheerio(allCourseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const requestCell = response.$(`td:contains("${pendingShortName}")`);
      assert.strictEqual(requestCell.length, 1);
      assert.strictEqual(requestCell.text().trim(), `${pendingShortName}: ${pendingTitle}`);
    });
  });
});
