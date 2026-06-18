import * as path from 'node:path';

import { merge } from 'es-toolkit';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  replaceEnrollmentAccessControlRules,
  selectAccessControlRules,
} from '../models/assessment-access-control-rules.js';
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
    await replaceEnrollmentAccessControlRules(assessment, [
      {
        ruleData: formJsonToEnrollmentRuleData({
          dateControl: { due: { date: '2024-04-18T23:59:00' } },
        }),
        enrollmentIds: [enrollment.id],
      },
    ]);
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

  test.sequential(
    'saves rules to disk and preserves omitted DB-only enrollment rules',
    async () => {
      const client = await createClient();
      const origHash = await getOrigHash();

      const rules: AccessControlJsonInput[] = [
        makeRule({ beforeRelease: { listed: true } }),
        makeRule({
          uuid: '11111111-1111-4111-8111-111111111111',
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
      assert.notProperty(parsed.accessControl[1], 'uuid');
      assert.equal(parsed.accessControl[1].dateControl.due?.date, '2024-04-01T23:59:00');

      // Verify other keys are preserved
      assert.equal(parsed.uuid, 'f5b2c8d1-9a3e-4f7b-8c1d-2e5a6b9c0d1f');
      assert.equal(parsed.type, 'Homework');
      assert.isArray(parsed.zones);

      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw19-accessControlUi',
      });
      const enrollmentRules = await selectAccessControlRules(assessment, ['enrollment']);
      assert.lengthOf(enrollmentRules, 1);
      assert.isString(enrollmentRules[0].uuid);
      assert.isTrue(
        enrollmentRules[0].enrollments?.some(
          (enrollment) => enrollment.uid === enrollmentOverrideStudentUid,
        ),
      );
    },
  );

  test.sequential('saves existing student-specific override with no label rules', async () => {
    const client = await createClient();
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const [existingEnrollmentRule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(existingEnrollmentRule);
    const enrollmentRuleUuid = existingEnrollmentRule.uuid;
    assert.isString(enrollmentRuleUuid);

    const result = await client.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      enrollmentRules: [
        {
          id: existingEnrollmentRule.id,
          enrollmentIds:
            existingEnrollmentRule.enrollments?.map((enrollment) => enrollment.enrollmentId) ?? [],
          ruleJson: makeRule({
            uuid: enrollmentRuleUuid,
            dateControl: { due: { date: '2024-04-20T23:59:00' } },
          }),
        },
      ],
      origHash: await getOrigHash(),
    });
    assert.isString(result.newHash);

    const parsed = JSON.parse(await fs.readFile(assessmentPath(), 'utf8'));
    assert.equal(parsed.accessControl.length, 2);
    assert.equal(parsed.accessControl[1].uuid, enrollmentRuleUuid);
    assert.notProperty(parsed.accessControl[1], 'labels');
    assert.notProperty(parsed.accessControl[1], 'enrollments');
    assert.notProperty(parsed.accessControl[1], 'ruleType');

    const enrollmentRules = await selectAccessControlRules(assessment, ['enrollment']);
    assert.lengthOf(enrollmentRules, 1);
    assert.equal(enrollmentRules[0].uuid, enrollmentRuleUuid);
  });

  test.sequential('saves mixed UUID-format overrides to disk and syncs enrollments', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const courseInstance = await selectCourseInstanceById('1');
    const [{ enrollment }] = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids: [enrollmentOverrideStudentUid],
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });

    const labelRuleUuid = '22222222-2222-4222-8222-222222222222';
    const enrollmentRuleUuid = '33333333-3333-4333-8333-333333333333';
    const enrollmentRule = makeRule({
      uuid: enrollmentRuleUuid,
      dateControl: { due: { date: '2024-04-22T23:59:00' } },
    });

    const result = await client.accessControl.saveAllRules.mutate({
      rules: [
        makeRule({ beforeRelease: { listed: true } }),
        makeRule({
          uuid: labelRuleUuid,
          labels: ['Section A'],
          dateControl: { due: { date: '2024-04-01T23:59:00' } },
        }),
      ],
      enrollmentRules: [
        {
          enrollmentIds: [enrollment.id],
          ruleJson: enrollmentRule,
        },
      ],
      origHash,
    });
    assert.isString(result.newHash);

    const parsed = JSON.parse(await fs.readFile(assessmentPath(), 'utf8'));
    assert.equal(parsed.accessControl.length, 3);
    assert.equal(parsed.accessControl[1].uuid, labelRuleUuid);
    assert.deepEqual(parsed.accessControl[1].labels, ['Section A']);
    assert.equal(parsed.accessControl[2].uuid, enrollmentRuleUuid);
    assert.notProperty(parsed.accessControl[2], 'labels');
    assert.notProperty(parsed.accessControl[2], 'enrollments');
    assert.notProperty(parsed.accessControl[2], 'ruleType');
    assert.notProperty(parsed.accessControl[2], 'id');
    assert.notProperty(parsed.accessControl[2], 'number');

    const enrollmentRules = await selectAccessControlRules(assessment, ['enrollment']);
    const savedEnrollmentRule = enrollmentRules.find((rule) => rule.uuid === enrollmentRuleUuid);
    assert.isOk(savedEnrollmentRule);
    assert.isTrue(
      savedEnrollmentRule.enrollments?.some(
        (enrollment) => enrollment.uid === enrollmentOverrideStudentUid,
      ),
    );
  });

  test.sequential(
    'rejects student-specific rules submitted in the label/default rules array',
    async () => {
      const client = await createClient();

      await expect(
        client.accessControl.saveAllRules.mutate({
          rules: [
            makeRule(),
            makeRule({
              uuid: '44444444-4444-4444-8444-444444444444',
              dateControl: { due: { date: '2024-04-22T23:59:00' } },
            }),
          ],
          origHash: await getOrigHash(),
        }),
      ).rejects.toThrow(/must be submitted via enrollmentRules/);
    },
  );

  test.sequential('rejects student-label rules without UUIDs', async () => {
    const client = await createClient();

    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule(), makeRule({ labels: ['Section A'] })],
        origHash: await getOrigHash(),
      }),
    ).rejects.toThrow(/must include a UUID/);
  });

  test.sequential('rejects student-specific rules without UUIDs', async () => {
    const client = await createClient();

    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule()],
        enrollmentRules: [
          {
            enrollmentIds: [],
            ruleJson: makeRule(),
          },
        ],
        origHash: await getOrigHash(),
      }),
    ).rejects.toThrow(/must include a UUID/);
  });

  test.sequential('rejects student-label rules submitted as enrollment rules', async () => {
    const client = await createClient();

    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule()],
        enrollmentRules: [
          {
            enrollmentIds: [],
            ruleJson: makeRule({
              uuid: '55555555-5555-4555-8555-555555555555',
              labels: ['Section A'],
              dateControl: { due: { date: '2024-04-22T23:59:00' } },
            }),
          },
        ],
        origHash: await getOrigHash(),
      }),
    ).rejects.toThrow(/must be submitted via rules/);
  });

  test.sequential('rejects duplicate enrollment IDs in one student-specific rule', async () => {
    const client = await createClient();
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const [existingEnrollmentRule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(existingEnrollmentRule);
    const enrollmentId = existingEnrollmentRule.enrollments?.[0]?.enrollmentId;
    assert.isString(enrollmentId);

    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule()],
        enrollmentRules: [
          {
            enrollmentIds: [enrollmentId, enrollmentId],
            ruleJson: makeRule({
              uuid: '66666666-6666-4666-8666-666666666666',
              dateControl: { due: { date: '2024-04-22T23:59:00' } },
            }),
          },
        ],
        origHash: await getOrigHash(),
      }),
    ).rejects.toThrow(/Duplicate enrollment IDs/);
  });

  test.sequential('omits beforeRelease.listed: false and empty objects from rules', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();

    const rules: AccessControlJsonInput[] = [{ beforeRelease: { listed: false } }];

    const result = await client.accessControl.saveAllRules.mutate({ rules, origHash });
    assert.isString(result.newHash);

    const fileContent = await fs.readFile(assessmentPath(), 'utf8');
    const parsed = JSON.parse(fileContent);

    assert.equal(parsed.accessControl.length, 2);
    assert.notProperty(parsed.accessControl[0], 'beforeRelease');
    assert.notProperty(parsed.accessControl[1], 'labels');
    assert.isString(parsed.accessControl[1].uuid);
  });

  test.sequential('course editor without student data permissions', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const [existingEnrollmentRule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(existingEnrollmentRule);
    const hiddenEnrollmentRuleUuid = existingEnrollmentRule.uuid;
    assert.isString(hiddenEnrollmentRuleUuid);
    const hiddenEnrollmentRuleJson = makeRule({
      uuid: hiddenEnrollmentRuleUuid,
      dateControl: { due: { date: '2024-04-18T23:59:00' } },
    });
    const adminClient = await createClient();
    const seedSaveResult = await adminClient.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      enrollmentRules: [
        {
          id: existingEnrollmentRule.id,
          enrollmentIds:
            existingEnrollmentRule.enrollments?.map((enrollment) => enrollment.enrollmentId) ?? [],
          ruleJson: hiddenEnrollmentRuleJson,
        },
      ],
      origHash: await getOrigHash(),
    });

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

      const saveResult = await client.accessControl.saveAllRules.mutate({
        rules: [makeRule({ dateControl: { due: { date: '2024-04-15T23:59:00' } } })],
        origHash: seedSaveResult.newHash,
      });
      assert.isString(saveResult.newHash);
      assert.notEqual(saveResult.newHash, seedSaveResult.newHash);
      const parsed = JSON.parse(await fs.readFile(assessmentPath(), 'utf8'));
      assert.equal(parsed.accessControl[0].dateControl.due?.date, '2024-04-15T23:59:00');
      const hiddenEnrollmentRule = parsed.accessControl.find(
        (rule: AccessControlJsonInput, index: number) =>
          index > 0 && rule.uuid === hiddenEnrollmentRuleUuid,
      );
      assert.isOk(hiddenEnrollmentRule);
      assert.notProperty(hiddenEnrollmentRule, 'labels');
      assert.notProperty(hiddenEnrollmentRule, 'enrollments');

      const labels = await client.accessControl.studentLabels.query();
      assert.include(
        labels.map((label) => label.name),
        'Section A',
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

  test.sequential('persists student-specific override order', async () => {
    const client = await createClient();
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const courseInstance = await selectCourseInstanceById('1');
    const [studentA, studentB] = await generateAndEnrollUsers({
      count: 2,
      course_instance_id: '1',
    });
    const enrollmentRows = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids: [studentA.uid, studentB.uid],
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    const enrollmentByUid = new Map(enrollmentRows.map((row) => [row.user.uid, row.enrollment]));
    const enrollmentA = enrollmentByUid.get(studentA.uid)!;
    const enrollmentB = enrollmentByUid.get(studentB.uid)!;
    const ruleAUuid = '77777777-7777-4777-8777-777777777777';
    const ruleBUuid = '88888888-8888-4888-8888-888888888888';

    const firstSave = await client.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      enrollmentRules: [
        {
          enrollmentIds: [enrollmentA.id],
          ruleJson: {
            uuid: ruleAUuid,
            dateControl: { due: { date: '2024-04-01T23:59:00' } },
          },
        },
        {
          enrollmentIds: [enrollmentB.id],
          ruleJson: {
            uuid: ruleBUuid,
            dateControl: { due: { date: '2024-04-08T23:59:00' } },
          },
        },
      ],
      origHash: await getOrigHash(),
    });

    let enrollmentRules = await selectAccessControlRules(assessment, ['enrollment']);
    const ruleA = enrollmentRules.find((rule) =>
      rule.enrollments?.some((enrollment) => enrollment.enrollmentId === enrollmentA.id),
    );
    const ruleB = enrollmentRules.find((rule) =>
      rule.enrollments?.some((enrollment) => enrollment.enrollmentId === enrollmentB.id),
    );
    assert.isOk(ruleA);
    assert.isOk(ruleB);
    assert.equal(ruleA.number, 1);
    assert.equal(ruleB.number, 2);

    await client.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      enrollmentRules: [
        {
          id: ruleB.id,
          enrollmentIds: [enrollmentB.id],
          ruleJson: {
            uuid: ruleBUuid,
            dateControl: { due: { date: '2024-04-08T23:59:00' } },
          },
        },
        {
          id: ruleA.id,
          enrollmentIds: [enrollmentA.id],
          ruleJson: {
            uuid: ruleAUuid,
            dateControl: { due: { date: '2024-04-01T23:59:00' } },
          },
        },
      ],
      origHash: firstSave.newHash,
    });

    enrollmentRules = await selectAccessControlRules(assessment, ['enrollment']);
    const reorderedRuleA = enrollmentRules.find((rule) =>
      rule.enrollments?.some((enrollment) => enrollment.enrollmentId === enrollmentA.id),
    );
    const reorderedRuleB = enrollmentRules.find((rule) =>
      rule.enrollments?.some((enrollment) => enrollment.enrollmentId === enrollmentB.id),
    );
    assert.isOk(reorderedRuleA);
    assert.isOk(reorderedRuleB);
    assert.equal(reorderedRuleB.number, 1);
    assert.equal(reorderedRuleA.number, 2);
  });

  test.sequential('rejects duplicate student-specific override ids', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    const existingRules = await selectAccessControlRules(assessment, ['enrollment']);
    const existingRule = existingRules[0];
    assert.isOk(existingRule);
    const enrollmentIds = existingRule.enrollments!.map((enrollment) => enrollment.enrollmentId);

    await expect(
      replaceEnrollmentAccessControlRules(assessment, [
        {
          ruleData: {
            ...formJsonToEnrollmentRuleData({
              dateControl: { due: { date: '2024-04-01T23:59:00' } },
            }),
            id: existingRule.id,
          },
          enrollmentIds,
        },
        {
          ruleData: {
            ...formJsonToEnrollmentRuleData({
              dateControl: { due: { date: '2024-04-08T23:59:00' } },
            }),
            id: existingRule.id,
          },
          enrollmentIds,
        },
      ]),
    ).rejects.toThrow(`Duplicate enrollment access control rule ID: ${existingRule.id}`);

    const rulesAfterRejection = await selectAccessControlRules(assessment, ['enrollment']);
    assert.deepEqual(
      rulesAfterRejection.map((rule) => rule.id),
      existingRules.map((rule) => rule.id),
    );
  });

  test.sequential('rejects save with stale origHash', async () => {
    const client = await createClient();
    const staleHash = await getOrigHash();

    // First save succeeds and changes the hash.
    const firstSave = await client.accessControl.saveAllRules.mutate({
      rules: [makeRule({ beforeRelease: { listed: true } })],
      origHash: staleHash,
    });
    assert.notEqual(firstSave.newHash, staleHash);

    // Second save with the same (now stale) hash must fail.
    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule({ dateControl: { due: { date: '2024-05-01T23:59:00' } } })],
        origHash: staleHash,
      }),
    ).rejects.toThrow(/modified since you loaded/);
  });
});
