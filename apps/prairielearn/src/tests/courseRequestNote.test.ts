import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { insertCourseRequest, selectAllCourseRequests } from '../lib/course-request.js';
import { createAdministratorTrpcClient } from '../trpc/administrator/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const courseRequestsAdminUrl = `${baseUrl}/administrator/courseRequests`;

describe('Course request note', { timeout: 60_000 }, function () {
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
  const note = 'This is a test note';

  describe('create course request note', () => {
    test('insert a course request', { concurrent: false }, async () => {
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

    test('update the note on the course request', { concurrent: false }, async () => {
      await trpcClient.courseRequests.updateNote.mutate({
        courseRequestId,
        note,
      });
    });

    test('check note information', { concurrent: false }, async () => {
      const response = await helperClient.fetchCheerio(courseRequestsAdminUrl);
      assert.isTrue(response.ok);

      const textarea = response.$(`#course-request-note-${courseRequestId}`);
      assert.lengthOf(textarea, 1);
      assert.equal(textarea.text().trim(), note);
    });
  });

  describe('update note on an already-noted request', () => {
    const firstNote = 'First note';
    const secondNote = 'Updated note';

    test('update with first note', { concurrent: false }, async () => {
      await trpcClient.courseRequests.updateNote.mutate({
        courseRequestId,
        note: firstNote,
      });
    });

    test('verify first note is saved', { concurrent: false }, async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.isDefined(request);
      assert.equal(request.note, firstNote);
    });

    test('update with second note overwrites first', { concurrent: false }, async () => {
      await trpcClient.courseRequests.updateNote.mutate({
        courseRequestId,
        note: secondNote,
      });
    });

    test('verify note was overwritten, not appended', { concurrent: false }, async () => {
      const allRequests = await selectAllCourseRequests();
      const request = allRequests.find((r) => r.id === courseRequestId);
      assert.isDefined(request);
      assert.equal(request.note, secondNote);
      assert.notInclude(request.note ?? '', firstNote);
    });
  });
});
