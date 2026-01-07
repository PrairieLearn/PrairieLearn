import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { getCourseInstancePublishingUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';
import { getOrCreateUser } from '../utils/auth.js';

const courseId = '1';
const courseInstanceId = '1';

describe('publishing page access', { timeout: 60_000 }, function () {
  const publishingUrl = `http://localhost:${config.serverPort}${getCourseInstancePublishingUrl(courseInstanceId)}`;

  async function postUpdatePublishing(
    cookie: string,
    options: { startDate?: string; endDate?: string } = {},
  ): Promise<Response> {
    const pageResponse = await helperClient.fetchCheerio(publishingUrl, {
      headers: { cookie },
    });
    const csrfToken = pageResponse.$('input[name="__csrf_token"]').val() as string;
    const origHash = pageResponse.$('input[name="orig_hash"]').val() as string;

    return fetch(publishingUrl, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        __action: 'update_publishing',
        __csrf_token: csrfToken,
        orig_hash: origHash,
        start_date: options.startDate ?? '',
        end_date: options.endDate ?? '',
      }),
      redirect: 'manual',
    });
  }

  async function postAddExtension(
    cookie: string,
    options: { name?: string; endDate: string; uids: string },
  ): Promise<Response> {
    const pageResponse = await helperClient.fetchCheerio(publishingUrl, {
      headers: { cookie },
    });
    const csrfToken = pageResponse.$('input[name="__csrf_token"]').val() as string;

    return fetch(publishingUrl, {
      method: 'POST',
      headers: {
        cookie,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        __action: 'add_extension',
        __csrf_token: csrfToken,
        name: options.name ?? '',
        end_date: options.endDate,
        uids: options.uids,
      }),
    });
  }

  beforeAll(helperServer.before());

  beforeAll(async function () {
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Test Instructor',
      uin: '100000000',
      email: 'instructor@example.com',
    });

    await insertCoursePermissionsByUserUid({
      course_id: courseId,
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });

    await insertCourseInstancePermissions({
      course_id: courseId,
      user_id: instructor.id,
      course_instance_id: courseInstanceId,
      course_instance_role: 'Student Data Editor',
      authn_user_id: instructor.id,
    });
  });

  afterAll(helperServer.after);

  describe('page access with different permission levels', () => {
    test.sequential('course owner can view publishing page', async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.isTrue(response.ok);
    });

    test.sequential('course viewer can view publishing page', async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Viewer; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.isTrue(response.ok);
    });

    test.sequential('student data viewer can view publishing page', async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.isTrue(response.ok);
    });

    test.sequential('user with no permissions cannot view publishing page', async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.equal(response.status, 403);
    });

    test.sequential('course previewer cannot view publishing page', async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.equal(response.status, 403);
    });
  });

  describe('publishing settings edit permissions', () => {
    test.sequential(
      'course viewer sees "no permission to edit" alert for publishing settings',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=Viewer; pl2_requested_course_instance_role=None',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$('.alert:contains("You must be a course editor to edit publishing settings")'),
          1,
        );
      },
    );

    test.sequential('course editor can edit publishing settings (no alert shown)', async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(publishingUrl, { headers });
      assert.isTrue(response.ok);
      assert.lengthOf(
        response.$('.alert:contains("You must be a course editor to edit publishing settings")'),
        0,
      );
    });

    test.sequential(
      'student data editor (without course editor) sees "no permission to edit" alert',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$('.alert:contains("You must be a course editor to edit publishing settings")'),
          1,
        );
      },
    );

    test.sequential(
      'course editor with student data editor can edit publishing settings (no alert shown)',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=Student Data Editor',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$('.alert:contains("You must be a course editor to edit publishing settings")'),
          0,
        );
      },
    );
  });

  describe('publishing settings POST permissions', () => {
    test.sequential(
      'student data editor (without course editor) cannot POST to update publishing settings',
      async () => {
        const cookie =
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor';
        const response = await postUpdatePublishing(cookie, {
          startDate: '2024-01-01T00:00',
          endDate: '2024-12-31T23:59',
        });
        assert.equal(response.status, 403);
      },
    );

    test.sequential(
      'course editor (without student data) can POST to update publishing settings',
      async () => {
        const cookie =
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None';
        const response = await postUpdatePublishing(cookie);
        assert.equal(response.status, 302);
      },
    );
  });

  describe('extensions POST permissions', () => {
    test.sequential(
      'student data editor (without course editor) cannot POST to add extension',
      async () => {
        const cookie =
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor';
        const response = await postAddExtension(cookie, {
          name: 'Test Extension',
          endDate: '2024-12-31T23:59',
          uids: 'student@example.com',
        });
        assert.equal(response.status, 403);
      },
    );

    test.sequential(
      'course editor (without student data editor) cannot POST to add extension',
      async () => {
        const cookie =
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None';
        const response = await postAddExtension(cookie, {
          name: 'Test Extension',
          endDate: '2024-12-31T23:59',
          uids: 'student@example.com',
        });
        assert.equal(response.status, 403);
      },
    );
  });

  describe('extensions view permissions', () => {
    test.sequential(
      'course viewer (no course instance permission) sees "no permission to view extensions" alert',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=Viewer; pl2_requested_course_instance_role=None',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$(
            '.alert:contains("You must have student data permission to view and edit extensions.")',
          ),
          1,
        );
      },
    );

    test.sequential(
      'course instance viewer can view extensions (no "no permission" alert)',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Viewer',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$(
            '.alert:contains("You must have student data permission to view and edit extensions.")',
          ),
          0,
        );
      },
    );
  });
});
