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

function extractCsrfToken($: CheerioAPI, component: string): string {
  const dataScript = $(`script[data-component-props][data-component="${component}"]`);
  const props = superjson.parse<{ csrfToken: string }>(dataScript.text());
  return props.csrfToken;
}

describe('Course request note', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  let courseRequestId: string;
  let csrfToken: string;
  const shortName = 'TEST 101';
  const note = 'This is a test note';

  describe('create course request note', () => {
    test.sequential('insert a course request', async () => {
      courseRequestId = await insertCourseRequest({
        short_name: shortName,
        title: 'Test Course',
        user_id: '1',
        github_user: 'EduardoMVAz',
        first_name: 'Test',
        last_name: 'User',
        work_email: 'test@example.com',
        institution: 'Test Institution',
        referral_source: null,
      });
    });

    test.sequential('load page and extract CSRF token', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);

      csrfToken = extractCsrfToken(response.$, 'AdministratorCourses');
      assert.isString(csrfToken);

      // Verify if the information from the course request has already populated the page
      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.isAtLeast(requestCell.length, 1);
    });

    test.sequential('POST the note to the course request', async () => {
      const response = await fetch(coursesAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_course_request_note',
          __csrf_token: csrfToken,
          request_id: courseRequestId,
          note,
        }),
      });
      assert.isTrue(response.ok);
    });

    test.sequential('check note information', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);

      // Verify if the area for editing the note exists and the content matches the post
      const textarea = response.$(`#course-request-note-${courseRequestId}`);
      assert.lengthOf(textarea, 1); // textarea exists
      assert.equal((textarea.val() as string).trim(), note); // and content is updated
    });
  });

  describe('update note on an already-noted request', () => {
    const firstNote = 'First note';
    const secondNote = 'Updated note';

    test.sequential('extract CSRF token from courses page', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);
      csrfToken = extractCsrfToken(response.$, 'AdministratorCourses');
    });

    test.sequential('POST first note', async () => {
      const response = await fetch(coursesAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_course_request_note',
          __csrf_token: csrfToken,
          request_id: courseRequestId,
          note: firstNote,
        }),
      });
      assert.isTrue(response.ok);
    });

    test.sequential('verify first note is saved', async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.equal(request?.note, firstNote);
    });

    test.sequential('extract fresh CSRF token', async () => {
      const response = await helperClient.fetchCheerio(coursesAdminUrl);
      assert.isTrue(response.ok);
    });

    test.sequential('POST second note overwrites first', async () => {
      const response = await fetch(coursesAdminUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_course_request_note',
          __csrf_token: csrfToken,
          request_id: courseRequestId,
          note: secondNote,
        }),
      });
      assert.isTrue(response.ok);
    });

    test.sequential('verify note was overwritten, not appended', async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.equal(request?.note, secondNote);
    });
  });
});
