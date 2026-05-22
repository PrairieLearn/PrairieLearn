import * as path from 'node:path';

import { merge } from 'es-toolkit';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { features } from '../lib/features/index.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { syncEnrollmentAccessControl } from '../models/assessment-access-control-rules.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import {
  generateAndEnrollUsers,
  selectUsersAndEnrollmentsByUidsInCourseInstance,
} from '../models/enrollment.js';
import type { AccessControlJsonInput } from '../schemas/accessControl.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';
import { formJsonToEnrollmentRuleData } from '../trpc/assessment/access-control.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperClient from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, getOrCreateUser, withUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;

function makeRule(overrides: Partial<AccessControlJsonInput> = {}): AccessControlJsonInput {
  return merge(
    {
      dateControl: {
        release: { date: '2024-03-14T00:01:00' },
        due: { date: '2024-03-21T23:59:00' },
      },
    },
    overrides,
  );
}

describe('Access control save via tRPC', () => {
  let courseRepo: CourseRepoFixture;
  let assessmentId: string;
  let enrollmentOverrideStudentUid: string;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await features.enable('enhanced-access-control');
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
      email: 'instructor@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: instructor.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: instructor.id,
    });

    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    assessmentId = assessment.id;

    const courseInstance = await selectCourseInstanceById('1');
    const [student] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    enrollmentOverrideStudentUid = student.uid;
    const [{ enrollment }] = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids: [student.uid],
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    await syncEnrollmentAccessControl(
      assessment,
      formJsonToEnrollmentRuleData({
        dateControl: { due: { date: '2024-04-18T23:59:00' } },
      }),
      [enrollment.id],
    );
  });

  afterAll(helperServer.after);

  async function createClient() {
    const user = await getConfiguredUser();
    const trpcPath = getAssessmentTrpcUrl({
      courseInstanceId: '1',
      assessmentId,
    });
    const csrfToken = generatePrefixCsrfToken(
      {
        url: trpcPath,
        authn_user_id: user.id,
      },
      config.secretKey,
    );
    return createAssessmentTrpcClient({
      csrfToken,
      courseInstanceId: '1',
      assessmentId,
      urlBase: siteUrl,
    });
  }

  async function getOrigHash() {
    const hash = await computeScopedJsonHash<AssessmentJsonInput>(
      assessmentPath(),
      (json) => json.accessControl ?? [],
    );
    return hash;
  }

  function assessmentPath() {
    return path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      'Sp15',
      'assessments',
      'hw19-accessControlUi',
      'infoAssessment.json',
    );
  }

  test.sequential('saves rules to disk and syncs to DB', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();

    const rules: AccessControlJsonInput[] = [
      makeRule({ beforeRelease: { listed: true } }),
      makeRule({
        labels: ['Section A'],
        dateControl: { due: { date: '2024-04-01T23:59:00' } },
      }),
    ];

    const result = await client.accessControl.saveAllRules.mutate({ rules, origHash });
    assert.isString(result.newHash);
    assert.notEqual(result.newHash, origHash);

    // Verify the file on disk was updated
    const fileContent = await fs.readFile(assessmentPath(), 'utf8');
    const parsed = JSON.parse(fileContent);

    assert.isArray(parsed.accessControl);
    assert.equal(parsed.accessControl.length, 2);
    assert.deepEqual(parsed.accessControl[0].beforeRelease, { listed: true });
    assert.deepEqual(parsed.accessControl[1].labels, ['Section A']);
    assert.equal(parsed.accessControl[1].dateControl.due?.date, '2024-04-01T23:59:00');

    // Verify other keys are preserved
    assert.equal(parsed.uuid, 'f5b2c8d1-9a3e-4f7b-8c1d-2e5a6b9c0d1f');
    assert.equal(parsed.type, 'Homework');
    assert.isArray(parsed.zones);
  });

  test.sequential('omits beforeRelease.listed: false and empty objects from disk', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();

    const rules: AccessControlJsonInput[] = [{ beforeRelease: { listed: false } }];

    const result = await client.accessControl.saveAllRules.mutate({ rules, origHash });
    assert.isString(result.newHash);

    const fileContent = await fs.readFile(assessmentPath(), 'utf8');
    const parsed = JSON.parse(fileContent);

    assert.equal(parsed.accessControl.length, 1);
    assert.notProperty(parsed.accessControl[0], 'beforeRelease');
  });

  test.sequential('course editor without student data permissions', async () => {
    const courseEditor = await getOrCreateUser({
      uid: 'access-control-course-editor@example.com',
      name: 'Access Control Course Editor',
      uin: '100000001',
      email: 'access-control-course-editor@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: courseEditor.uid,
      course_role: 'Editor',
      authn_user_id: courseEditor.id,
    });

    await withUser(courseEditor, async () => {
      const client = await createClient();
      const origHash = await getOrigHash();

      const saveResult = await client.accessControl.saveAllRules.mutate({
        rules: [makeRule({ dateControl: { due: { date: '2024-04-15T23:59:00' } } })],
        origHash,
      });
      assert.isString(saveResult.newHash);
      assert.notEqual(saveResult.newHash, origHash);
      const parsed = JSON.parse(await fs.readFile(assessmentPath(), 'utf8'));
      assert.equal(parsed.accessControl[0].dateControl.due?.date, '2024-04-15T23:59:00');

      const labels = await client.accessControl.studentLabels.query();
      assert.include(
        labels.map((label) => label.name),
        'Section A',
      );
      assert.deepEqual(
        await client.accessControl.prairieTestExamMetadata.query({ examUuids: [] }),
        [],
      );

      await expect(
        client.accessControl.saveAllRules.mutate({
          rules: [makeRule()],
          enrollmentRules: [],
          origHash: saveResult.newHash,
        }),
      ).rejects.toThrow(/student data editor/);
    });

    const response = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessmentId}/access`,
      {
        headers: {
          cookie: `pl_test_user=test_instructor; pl2_requested_uid=${courseEditor.uid}; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None`,
        },
      },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.notInclude(html, enrollmentOverrideStudentUid);
    assert.include(html, '"hiddenEnrollmentRuleCount":1');
    assert.include(html, 'Student-specific overrides require student data editor permissions.');
    assert.include(html, 'hidden because you do not have student data viewer permissions');
  });

  test.sequential('course editor with student data view permissions', async () => {
    const courseEditorWithStudentDataView = await getOrCreateUser({
      uid: 'access-control-student-data-viewer@example.com',
      name: 'Access Control Student Data Viewer',
      uin: '100000002',
      email: 'access-control-student-data-viewer@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: courseEditorWithStudentDataView.uid,
      course_role: 'Editor',
      authn_user_id: courseEditorWithStudentDataView.id,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: courseEditorWithStudentDataView.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: courseEditorWithStudentDataView.id,
    });

    const response = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessmentId}/access`,
      {
        headers: {
          cookie: `pl_test_user=test_instructor; pl2_requested_uid=${courseEditorWithStudentDataView.uid}; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=Student Data Viewer`,
        },
      },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.include(html, enrollmentOverrideStudentUid);
    assert.include(html, '"hiddenEnrollmentRuleCount":0');
  });

  test.sequential('rejects save with stale origHash', async () => {
    const client = await createClient();
    const staleHash = await getOrigHash();

    // First save succeeds and changes the hash.
    await client.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      origHash: staleHash,
    });

    // Second save with the same (now stale) hash must fail.
    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule({ dateControl: { due: { date: '2024-05-01T23:59:00' } } })],
        origHash: staleHash,
      }),
    ).rejects.toThrow(/modified since you loaded/);
  });
});
