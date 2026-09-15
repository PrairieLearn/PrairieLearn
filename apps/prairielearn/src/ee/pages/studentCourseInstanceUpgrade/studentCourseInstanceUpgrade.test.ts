import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../../../lib/authz-data-lib.js';
import { config } from '../../../lib/config.js';
import { selectCourseInstanceById } from '../../../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../../../models/enrollment.js';
import * as helperServer from '../../../tests/helperServer.js';
import {
  type AuthUser,
  getConfiguredUser,
  getOrCreateUser,
  updateCourseInstanceSettings,
  withUser,
} from '../../../tests/utils/auth.js';
import {
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForCourseInstanceUser,
  updateRequiredPlansForCourseInstance,
} from '../../lib/billing/plans.js';
import {
  insertStripeCheckoutSessionForUserInCourseInstance,
  markStripeCheckoutSessionCompleted,
} from '../../models/stripe-checkout-sessions.js';
import { enableEnterpriseEdition } from '../../tests/ee-helpers.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const assessmentsUrl = `${siteUrl}/pl/course_instance/1/assessments`;
const upgradeUrl = `${siteUrl}/pl/course_instance/1/upgrade`;
const studentUser: AuthUser = {
  uid: 'student@example.com',
  name: 'Example Student',
  uin: 'student',
  email: 'student@example.com',
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
        { institution_id: '1', course_instance_id: '1', user_id: user.id },
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

  it('does not let an LTI relaunch hint bypass self-enrollment policy', async () => {
    await updateRequiredPlansForCourseInstance('1', ['basic'], '1');
    await updateCourseInstanceSettings('1', {
      selfEnrollmentEnabled: false,
      selfEnrollmentUseEnrollmentCode: false,
      restrictToInstitution: false,
    });

    await withUser(studentUser, async () => {
      const res = await fetch(`${upgradeUrl}?lti13_relaunch=1`);
      assert.equal(res.status, 403);
      assert.include(await res.text(), 'Self-enrollment not available');
    });
  });

  it('does not ask a joined student to relaunch after a completed LTI upgrade', async () => {
    await withUser(studentUser, async () => {
      const user = await getConfiguredUser();
      const courseInstance = await selectCourseInstanceById('1');
      await ensureUncheckedEnrollment({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });

      const stripeSessionId = 'completed-lti-upgrade';
      await insertStripeCheckoutSessionForUserInCourseInstance({
        agent_user_id: user.id,
        stripe_object_id: stripeSessionId,
        course_instance_id: courseInstance.id,
        subject_user_id: user.id,
        data: {},
        plan_names: ['basic'],
      });
      await markStripeCheckoutSessionCompleted(stripeSessionId);

      const res = await fetch(
        `${upgradeUrl}/success?session_id=${stripeSessionId}&lti13_relaunch=1`,
      );
      assert.isOk(res.ok);
      assert.include(await res.text(), 'You may now access the course.');
    });
  });

  it('ignores instructor access overrides', async () => {
    await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

    const user = await getOrCreateUser(studentUser);
    const courseInstance = await selectCourseInstanceById('1');
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    // Simulates the dev user (an instructor) using "Student view" for themselves.
    const res = await fetch(assessmentsUrl, {
      headers: {
        cookie: 'pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
      },
    });
    assert.isOk(res.ok);
    assert.equal(res.url, assessmentsUrl);
  });

  it('ignores instructor user overrides', async () => {
    await updateRequiredPlansForCourseInstance('1', ['basic', 'compute'], '1');

    const user = await getOrCreateUser(studentUser);
    const courseInstance = await selectCourseInstanceById('1');
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    // Simulates the dev user (an instructor) using "Student view" for an
    // actual enrolled student user.
    const res = await fetch(assessmentsUrl, {
      headers: {
        cookie: 'pl2_requested_user=student@example.com',
      },
    });
    assert.isOk(res.ok);
    assert.equal(res.url, assessmentsUrl);
  });
});
