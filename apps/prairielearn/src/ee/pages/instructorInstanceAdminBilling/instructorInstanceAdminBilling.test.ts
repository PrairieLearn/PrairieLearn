import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { queryAsync } from '@prairielearn/postgres';

import { enableEnterpriseEdition, withoutEnterpriseEdition } from '../../tests/ee-helpers';
import * as helperServer from '../../../tests/helperServer';
import {
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { config } from '../../../lib/config';
import { features } from '../../../lib/features';
import { enrollRandomUsers } from '../../../tests/utils/enrollments';
import { getCsrfToken } from '../../../tests/utils/csrf';

const siteUrl = 'http://localhost:' + config.serverPort;
const pageUrl = siteUrl + '/pl/course_instance/1/instructor/instance_admin/billing';

async function updateCourseInstanceEnrollmentLimit(limit: number) {
  await queryAsync('UPDATE course_instances SET enrollment_limit = $limit;', { limit });
}

describe('instructorInstanceAdminBilling', () => {
  enableEnterpriseEdition();

  beforeEach(helperServer.before());
  afterEach(helperServer.after);

  it('404s if feature is not enabled', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': false }, async () => {
      const res = await fetch(pageUrl);
      assert.isFalse(res.ok);
      assert.equal(res.status, 404);
    });
  });

  it('404s if not enterprise edition', async () => {
    await withoutEnterpriseEdition(async () => {
      await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
        const res = await fetch(pageUrl);
        assert.isFalse(res.ok);
        assert.equal(res.status, 404);
      });
    });
  });

  it('shows current state', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
      await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

      const res = await fetch(pageUrl);
      assert.isTrue(res.ok);
      const $ = cheerio.load(await res.text());
      assert.equal($('#studentBillingEnabled').attr('checked'), 'checked');
      assert.equal($('#computeEnabled').attr('checked'), 'checked');
    });
  });

  it('forbids disabling student billing if enrollment limit exceeded', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
      await enrollRandomUsers('1', 10);
      await updateCourseInstanceEnrollmentLimit(1);
      await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

      const csrfToken = await getCsrfToken(pageUrl);
      const res = await fetch(pageUrl, {
        method: 'POST',
        body: new URLSearchParams({
          // Omitting `student_billing_enabled` to disable it.
          __csrf_token: csrfToken,
        }),
      });
      assert.isFalse(res.ok);
      assert.equal(res.status, 400);
    });
  });

  it('forbids enabling compute if already granted to the institution', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
      await reconcilePlanGrantsForInstitution(
        '1',
        [{ plan: 'compute', grantType: 'invoice' }],
        '1',
      );

      const csrfToken = await getCsrfToken(pageUrl);
      const res = await fetch(pageUrl, {
        method: 'POST',
        body: new URLSearchParams({
          compute_enabled: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.isFalse(res.ok);
      assert.equal(res.status, 400);
    });
  });

  it('forbids enabling compute if already granted to the course instance', async () => {
    await features.runWithGlobalOverrides({ 'course-instance-billing': true }, async () => {
      await reconcilePlanGrantsForCourseInstance(
        '1',
        [{ plan: 'compute', grantType: 'invoice' }],
        '1',
      );

      const csrfToken = await getCsrfToken(pageUrl);
      const res = await fetch(pageUrl, {
        method: 'POST',
        body: new URLSearchParams({
          compute_enabled: '1',
          __csrf_token: csrfToken,
        }),
      });
      assert.isFalse(res.ok);
      assert.equal(res.status, 400);
    });
  });
});
