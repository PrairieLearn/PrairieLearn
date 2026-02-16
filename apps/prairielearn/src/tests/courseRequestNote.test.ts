import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { insertCourseRequest } from '../lib/course-request.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const coursesAdminUrl = `${baseUrl}/administrator/courses`;

describe('Course request note', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  describe('create course request note', () => {
    let courseRequestId: string;
    let csrfToken: string;
    const shortName = 'TEST 101';
    const note = 'This is a test note';

    test.sequential('insert a course request', async () => {
      courseRequestId = await insertCourseRequest({
        short_name: shortName,
        title: 'Test Course',
        user_id: '1',
        github_user: null,
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

      csrfToken = response.$('input[name="__csrf_token"]').val() as string;
      assert.isString(csrfToken);

      // Verify if the information from the course request has already populated the page
      const requestCell = response.$(`td:contains("${shortName}")`);
      assert.isAtLeast(requestCell.length, 1);

      // Verify if the area for editing the note exists
      const textarea = response.$(`#course-request-note-${courseRequestId}`);
      assert.lengthOf(textarea, 1); // textarea exists
      assert.equal((textarea.val() as string).trim(), ''); // but content is empty
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
});
