import { assert } from 'chai';
import fetch from 'node-fetch';

import { config } from '../../../lib/config';
import * as helperServer from '../../../tests/helperServer';
import { enableEnterpriseEdition } from '../../tests/ee-helpers';
import {
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForCourseInstanceUser,
  updateRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import {
  withUser,
  type AuthUser,
  getConfiguredUser,
  getOrCreateUser,
} from '../../../tests/utils/auth';
import { ensureEnrollment } from '../../../models/enrollment';

const siteUrl = `http://localhost:${config.serverPort}`;
const assessmentsUrl = `${siteUrl}/pl/course_instance/1/assessments`;
const upgradeUrl = `${siteUrl}/pl/course_instance/1/upgrade`;
const studentUser: AuthUser = {
  uid: 'student@example.com',
  name: 'Example Student',
  uin: 'student',
};

describe('studentCourseInstanceUpgrade', () => {
  enableEnterpriseEdition();

  beforeEach(helperServer.before());
  afterEach(helperServer.after);

  it('is not displayed if there are no required features', async () => {
    await withUser(studentUser, async () => {
      const res = await fetch(assessmentsUrl);
      assert.isOk(res.ok);
      assert.equal(res.url, assessmentsUrl);
    });
  });

  it('is not displayed if there are no unsatisfied required plans', async () => {
    await withUser(studentUser, async () => {
      await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

      // Grant `compute` to course instance.
      await reconcilePlanGrantsForCourseInstance(
        '1',
        [{ plan: 'compute', grantType: 'invoice' }],
        '1',
      );

      // Grant `basic` to student in course instance.
      const user = await getConfiguredUser();
      await reconcilePlanGrantsForCourseInstanceUser(
        { institution_id: '1', course_instance_id: '1', user_id: user.user_id },
        [{ plan: 'basic', grantType: 'stripe' }],
        '1',
      );

      const res = await fetch(assessmentsUrl);
      assert.isOk(res.ok);
      assert.equal(res.url, assessmentsUrl);
    });
  });

  it('is displayed if there are unsatisfied required plans', async () => {
    await withUser(studentUser, async () => {
      await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

      const res = await fetch(assessmentsUrl);
      assert.isOk(res.ok);
      assert.equal(res.url, upgradeUrl);
    });
  });

  it('respects user overrides without access overrides', async () => {
    await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

    const user = await getOrCreateUser(studentUser);
    await ensureEnrollment({ user_id: user.user_id, course_instance_id: '1' });

    const res = await fetch(assessmentsUrl, {
      headers: {
        cookie: `pl_requested_uid=student@example.com; pl_requested_course_role=None; pl_requested_course_instance_role=None`,
      },
    });
    assert.isOk(res.ok);
    assert.equal(res.url, upgradeUrl);
  });

  it('respects user overrides with access overrides', async () => {
    await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

    const user = await getOrCreateUser(studentUser);
    await ensureEnrollment({ user_id: user.user_id, course_instance_id: '1' });

    const res = await fetch(assessmentsUrl, {
      headers: {
        cookie: `pl_requested_uid=student@example.com; pl_requested_course_role=Owner; pl_requested_course_instance_role=Student Data Editor`,
      },
    });
    assert.isOk(res.ok);
    assert.equal(res.url, assessmentsUrl);
  });
});
