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

  beforeAll(helperServer.before());

  beforeAll(async function () {
    // Set up test users
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Test Instructor',
      uin: '100000000',
      email: 'instructor@example.com',
    });

    // Give the instructor course owner permissions
    await insertCoursePermissionsByUserUid({
      course_id: courseId,
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
    // Give the instructor course instance editor permissions (student data editor)
    // This allows testing course instance permission scenarios
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

    test.sequential('course instance viewer can view publishing page', async () => {
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
          response.$('.alert:contains("You do not have permission to edit publishing settings")'),
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
        response.$('.alert:contains("You do not have permission to edit publishing settings")'),
        0,
      );
    });

    test.sequential(
      'course instance editor can edit publishing settings (no alert shown)',
      async () => {
        const headers = {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor',
        };
        const response = await helperClient.fetchCheerio(publishingUrl, { headers });
        assert.isTrue(response.ok);
        assert.lengthOf(
          response.$('.alert:contains("You do not have permission to edit publishing settings")'),
          0,
        );
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
            '.alert:contains("You do not have permission to view extensions. Extensions require student data permissions.")',
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
            '.alert:contains("You do not have permission to view extensions. Extensions require student data permissions.")',
          ),
          0,
        );
      },
    );
  });
});
