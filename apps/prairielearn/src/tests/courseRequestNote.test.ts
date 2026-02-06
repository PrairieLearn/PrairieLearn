import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { IdSchema } from '@prairielearn/zod';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const coursesAdminUrl = `${baseUrl}/administrator/courses`;

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Course request note', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  describe('create course request note', () => {
    let courseRequestId: string;
    let csrfToken: string;
    const shortName = `TEST ${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    test.sequential('insert a course request', async () => {
      courseRequestId = await sqldb.queryRow(
        sql.insert_course_request,
        {
          short_name: shortName,
          title: 'Test Course',
          user_id: '1',
          github_user: null,
          first_name: 'Test',
          last_name: 'User',
          work_email: 'test@example.com',
          institution: 'Test Institution',
          referral_source: null,
        },
        IdSchema,
      );
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
          note: 'This is a test note',
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
      assert.equal((textarea.val() as string).trim(), 'This is a test note'); // and content is updated
    });
  });
});
