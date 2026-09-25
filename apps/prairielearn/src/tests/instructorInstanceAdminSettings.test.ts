import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, afterEach, assert, beforeAll, beforeEach, describe, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import {
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from '../ee/lib/billing/plans.js';
import { ensurePlanGrant } from '../ee/models/plan-grants.js';
import { enableEnterpriseEdition, withoutEnterpriseEdition } from '../ee/tests/ee-helpers.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';

import { fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';
import { enrollRandomUsers } from './utils/enrollments.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoFixture;

async function setSharingFilesPublic(sharePublicly: boolean) {
  const fileUpdates = [
    {
      relPath: 'questions/test/question/info.json',
      properties: ['sharePublicly', 'shareSourcePublicly'],
    },
    {
      relPath: 'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      properties: ['shareSourcePublicly'],
    },
    {
      relPath: 'courseInstances/Fa18/infoCourseInstance.json',
      properties: ['shareSourcePublicly'],
    },
  ];

  for (const fileUpdate of fileUpdates) {
    const absPath = path.join(courseRepo.courseOriginDir, fileUpdate.relPath);
    const info = await fs.readJSON(absPath);
    for (const property of fileUpdate.properties) {
      if (sharePublicly) {
        info[property] = true;
      } else {
        delete info[property];
      }
    }
    await fs.writeJSON(absPath, info, { spaces: 2 });
  }

  await commitOriginAndSync(
    courseRepo,
    sharePublicly ? 'Share test content' : 'Unshare test content',
    fileUpdates.map((u) => u.relPath),
  );
}

describe('Updating a course instance ID', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    // The sharing-related tests below rely on the share_source_publicly server-side
    // validation, which only runs when this feature flag is enabled.
    await features.enable('question-sharing');
  });

  afterAll(async () => {
    await features.disable('question-sharing');
    await helperServer.after();
  });

  test('should not be able to change course instance id to one that falls outside the correct root directory', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Attempt to update the course instance id to one that falls outside the correct root directory
    // It should fail
    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'change_id',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
          id: '../Fa25',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );
  });

  async function buildUpdateConfigurationBody({
    shareSourcePublicly,
  }: {
    shareSourcePublicly: boolean;
  }) {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const body: Record<string, string> = {
      __action: 'update_configuration',
      __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
      orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
      ciid: 'Fa18',
      long_name: 'Fall 2018',
      display_timezone: 'America/Chicago',
      group_assessments_by: 'Set',
    };
    if (shareSourcePublicly) body.share_source_publicly = 'on';
    for (const name of [
      'self_enrollment_enabled',
      'self_enrollment_use_enrollment_code',
      'self_enrollment_restrict_to_institution',
      'self_enrollment_enabled_before_date_enabled',
      'self_enrollment_enabled_before_date',
    ]) {
      const value = settingsPageResponse.$(`input[name="${name}"]`).last().val();
      if (typeof value === 'string') body[name] = value;
    }
    return body;
  }

  test('cannot share course instance source publicly while it contains non-public assessments', async () => {
    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      {
        method: 'POST',
        body: new URLSearchParams(
          await buildUpdateConfigurationBody({ shareSourcePublicly: true }),
        ),
      },
    );
    assert.equal(response.status, 400);
  });

  test('un-shares course instance source', async () => {
    await setSharingFilesPublic(true);
    try {
      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
        {
          method: 'POST',
          body: new URLSearchParams(
            await buildUpdateConfigurationBody({ shareSourcePublicly: false }),
          ),
        },
      );
      assert.equal(response.status, 200);
      const courseInstanceInfoPath = path.join(
        courseRepo.courseLiveDir,
        'courseInstances',
        'Fa18',
        'infoCourseInstance.json',
      );
      const courseInstanceInfo = await fs.readJSON(courseInstanceInfoPath);
      assert.isUndefined(courseInstanceInfo.shareSourcePublicly);
    } finally {
      await setSharingFilesPublic(false);
    }
  });
});

describe('Course instance enrollment and billing', () => {
  enableEnterpriseEdition();
  beforeEach(helperServer.before());
  afterEach(helperServer.after);

  const sql = loadSqlEquiv(import.meta.url);
  const pageUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`;

  async function setLimits({
    institutionLimit = 10_000,
    courseLimit = null,
    instanceLimit = null,
    institutionYearlyLimit = 100_000,
    courseYearlyLimit = null,
  }: {
    institutionLimit?: number;
    courseLimit?: number | null;
    instanceLimit?: number | null;
    institutionYearlyLimit?: number;
    courseYearlyLimit?: number | null;
  }) {
    await execute(sql.update_institution_limits, { institutionLimit, institutionYearlyLimit });
    await execute(sql.update_course_limits, { courseLimit, courseYearlyLimit });
    await execute(sql.update_instance_limit, { instanceLimit });
  }

  test.each([10_000, 10_001])(
    'shows payment status without an allowance for a limit of %i',
    async (limit) => {
      await setLimits({ institutionLimit: limit });
      await enrollRandomUsers('1', 1);
      const { $, status } = await fetchCheerio(pageUrl);
      assert.equal(status, 200);
      assert.lengthOf($('#enrollment-and-billing-heading'), 1);
      const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
      assert.include(summary, 'Student payment not required');
      assert.include(summary, 'Students can enroll without paying for course access.');
      assert.notInclude(summary, 'Enrollment allowance');
      assert.notInclude(summary, 'remaining');
    },
  );

  test.each([
    { institutionLimit: 20, expected: 20 },
    { institutionLimit: 20, courseLimit: 30, expected: 30 },
    { institutionLimit: 20, courseLimit: 30, instanceLimit: 40, expected: 40 },
    { instanceLimit: 9999, expected: 9999 },
  ])('shows the effective limit: $expected', async ({ expected, ...limits }) => {
    await setLimits(limits);
    await enrollRandomUsers('1', 2);
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, `2 of ${expected.toLocaleString('en-US')} enrollments used`);
    assert.include(summary, `${(expected - 2).toLocaleString('en-US')} remaining`);
    assert.notInclude(summary, 'shared enrollment limit');
  });

  test('hides capacity without enterprise enrollment enforcement', async () => {
    await setLimits({ instanceLimit: 20 });
    await withoutEnterpriseEdition(async () => {
      const { $, status } = await fetchCheerio(pageUrl);
      assert.equal(status, 200);
      assert.lengthOf($('#enrollment-and-billing-heading'), 0);
    });
  });

  test.each([0, 1, 2])('shows zero remaining for an exhausted limit of %i', async (limit) => {
    await enrollRandomUsers('1', 2);
    await setLimits({ instanceLimit: limit });
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, `2 of ${limit} enrollments used`);
    assert.include(summary, '0 remaining');
    assert.include(
      summary,
      'The enrollment allowance has been reached. Contact support to increase it.',
    );
  });

  test.each([
    { institutionYearlyLimit: 3, courseYearlyLimit: 10, source: 'institution' },
    { institutionYearlyLimit: 10, courseYearlyLimit: 3, source: 'course' },
  ])('accounts for the shared $source annual limit', async ({ source, ...limits }) => {
    await enrollRandomUsers('1', 2);
    await setLimits({ instanceLimit: 20, ...limits });
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, '2 of 20 enrollments used');
    assert.include(summary, '1 remaining');
    assert.include(summary, `${source}'s shared enrollment limit over the past year`);
  });

  test('excludes paid and non-joined enrollments from capacity', async () => {
    await enrollRandomUsers('1', 3);
    const paidUser = await getOrCreateUser({
      uid: 'student1@example.com',
      name: 'Paid Student',
      uin: 'student-0',
    });
    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: paidUser.id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });
    await execute(sql.mark_enrollment_removed);
    await setLimits({ instanceLimit: 20, institutionYearlyLimit: 2 });
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, '1 of 20 enrollments used');
    assert.include(
      summary,
      'Students with individually purchased or sponsored course access do not use this allowance.',
    );
    assert.include(summary, '1 remaining');
  });

  test('counts older enrollments toward the instance limit but not annual limits', async () => {
    await enrollRandomUsers('1', 2);
    await execute(sql.age_enrollments);
    await setLimits({ instanceLimit: 20, institutionYearlyLimit: 3 });
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, '2 of 20 enrollments used');
    assert.include(summary, '3 remaining');
  });

  test.each([false, true])(
    'shows student billing instead of an allowance (compute: %s)',
    async (compute) => {
      await enrollRandomUsers('1', 2);
      await setLimits({ instanceLimit: 0, institutionYearlyLimit: 0, courseYearlyLimit: 0 });
      await updateRequiredPlansForCourseInstance(
        '1',
        compute ? ['basic', 'compute'] : ['basic'],
        '1',
      );
      const { $, status } = await fetchCheerio(pageUrl);
      assert.equal(status, 200);
      const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
      assert.include(summary, 'Student billing enabled');
      assert.include(summary, 'Students pay for access to this course instance.');
      assert.include(summary, '2 enrollments');
      assert.equal(summary.includes('Students pay for external grading and workspaces.'), compute);
      assert.notInclude(summary, 'Enrollment allowance');
      assert.notInclude(summary, 'remaining');
      assert.notInclude(summary, 'Contact support');
      assert.notInclude(summary, 'Student payment not required');
    },
  );

  test('keeps the enrollment allowance when students pay only for compute', async () => {
    await enrollRandomUsers('1', 2);
    await setLimits({ instanceLimit: 20 });
    await updateRequiredPlansForCourseInstance('1', ['compute'], '1');
    const { $, status } = await fetchCheerio(pageUrl);
    assert.equal(status, 200);
    const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
    assert.include(summary, 'Student billing for compute features');
    assert.include(summary, 'Students pay for external grading and workspaces.');
    assert.include(summary, '2 of 20 enrollments used');
    assert.include(summary, '18 remaining');
    assert.notInclude(summary, 'Student payment not required');
  });

  test.each(['institution', 'course instance'])(
    'does not advertise student payment for compute covered by the %s',
    async (source) => {
      await setLimits({ instanceLimit: 20 });
      await updateRequiredPlansForCourseInstance('1', ['compute'], '1');
      const reconcile =
        source === 'institution'
          ? reconcilePlanGrantsForInstitution
          : reconcilePlanGrantsForCourseInstance;
      await reconcile('1', [{ plan: 'everything', grantType: 'invoice' }], '1');
      const { $, status } = await fetchCheerio(pageUrl);
      assert.equal(status, 200);
      const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
      assert.include(summary, 'Student payment not required');
      assert.include(summary, '0 of 20 enrollments used');
      assert.notInclude(summary, 'Students pay for external grading and workspaces.');
    },
  );

  test.each(['course', 'institution'])(
    'shows a support warning when a shared %s limit blocks a large-cap instance',
    async (source) => {
      await enrollRandomUsers('1', 2);
      await setLimits(
        source === 'course' ? { courseYearlyLimit: 2 } : { institutionYearlyLimit: 2 },
      );
      const { $, status } = await fetchCheerio(pageUrl);
      assert.equal(status, 200);
      const summary = $('[aria-labelledby="enrollment-and-billing-heading"]').text();
      assert.include(
        summary,
        'An enrollment limit has been reached. Contact support to enable additional enrollments.',
      );
      assert.notInclude(summary, 'Enrollment allowance');
      assert.notInclude(summary, '10,000');
      assert.notInclude(summary, 'remaining');
    },
  );
});
