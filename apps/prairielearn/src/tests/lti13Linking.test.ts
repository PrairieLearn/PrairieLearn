/**
 * Tests for LTI 1.3 course instance linking and admin page.
 */
import * as cheerio from 'cheerio';
import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import nodeJose from 'node-jose';
import { afterAll, afterEach, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import {
  execute,
  queryOptionalRow,
  queryRow,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  reconcilePlanGrantsForCourseInstanceUser,
  updateRequiredPlansForCourseInstance,
} from '../ee/lib/billing/plans.js';
import {
  type Lti13CombinedInstance,
  Lti13CombinedInstanceSchema,
  inspectRoster,
  queryAndLinkLineitem,
  updateLti13Scores,
} from '../ee/lib/lti13.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import {
  type CourseInstance,
  Lti13AssessmentSchema,
  Lti13CourseInstanceSchema,
} from '../lib/db-types.js';
import { createServerJob, selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';
import { selectOptionalUserByUid, selectOrInsertUserByUid } from '../models/user.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import {
  LTI_CONTEXT_ID,
  LTI_DEPLOYMENT_ID,
  createCrossInstitutionFixture,
  createLti13Instance,
  enableLti13Authentication,
  grantCoursePermissions,
  linkLtiContext,
  makeLoginExecutor,
  withServer,
} from './lti13TestHelpers.js';
import { updateCourseInstanceSettings } from './utils/auth.js';
import { createEnrollment, selectEnrollments } from './utils/enrollment-identity.js';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3 course instance linking', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

  async function selectLinkedLtiCourseInstance() {
    return await queryRow(
      `SELECT *
       FROM lti13_course_instances
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      Lti13CourseInstanceSchema,
    );
  }

  async function assertLtiLaunchConsumed(userId: string) {
    const sessionData = await queryScalar(
      `SELECT data
       FROM user_sessions
       WHERE user_id = $user_id
       ORDER BY updated_at DESC
       LIMIT 1`,
      { user_id: userId },
      z.record(z.string(), z.unknown()),
    );
    assert.notProperty(sessionData, 'lti13_claims');
    assert.notProperty(sessionData, 'authn_lti13_instance_id');
  }

  beforeAll(async () => {
    config.isEnterprise = true;
    await helperServer.before()();
    courseInstance = await selectCourseInstanceById('1');

    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$'");

    oidcProviderPort = await getPort();

    keystore = nodeJose.JWK.createKeyStore();
    await keystore.generate('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: 'test',
    });

    // Create and configure LTI instance for linking tests
    await createLti13Instance({
      siteUrl,
      issuer_params: {
        issuer: `http://localhost:${oidcProviderPort}`,
        authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
        jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
        token_endpoint: `http://localhost:${oidcProviderPort}/token`,
      },
    });

    await enableLti13Authentication(siteUrl);
  });

  afterAll(async () => {
    await helperServer.after();
    config.isEnterprise = false;
  });

  test('linkLtiContext helper creates link record', async () => {
    await execute(
      `DELETE FROM lti13_course_instances
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
    );

    await linkLtiContext({
      lti13InstanceId: '1',
      deploymentId: LTI_DEPLOYMENT_ID,
      contextId: LTI_CONTEXT_ID,
      courseInstanceId: '1',
    });

    const linkRecord = await queryOptionalRow(
      `SELECT * FROM lti13_course_instances
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      Lti13CourseInstanceSchema,
    );
    assert.ok(linkRecord);
    assert.equal(linkRecord.course_instance_id, '1');

    // Clean up for subsequent tests
    await execute(
      `DELETE FROM lti13_course_instances
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
    );
  });

  test('instructor sees linking UI for unlinked context', async () => {
    const fetchWithCookies = fetchCookie(fetch);
    const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

    // Grant permissions before LTI login. Use dev admin user (ID 1) as authn_user
    // since the target user doesn't exist yet - grantCoursePermissions will create them.
    await grantCoursePermissions({
      uid: 'linking-instructor@example.com',
      uin: '111222333',
      courseId: '1',
      courseRole: 'Editor',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Editor',
      authnUserId: '1',
    });

    const executor = await makeLoginExecutor({
      user: {
        name: 'Linking Test Instructor',
        email: 'linking-instructor@example.com',
        uin: '111222333',
        sub: 'linking-instructor-sub-1',
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri,
      isInstructor: true,
    });

    const res = await executor.login();
    assert.equal(res.status, 200);
    assert.equal(res.url, targetLinkUri);

    const pageText = await res.text();
    const $ = cheerio.load(pageText);
    assert.ok(
      $('select[name="unsafe_course_instance_id"]').length > 0,
      'Expected course instance selector on linking page',
    );
  });

  test('student sees "not ready" page for unlinked context', async () => {
    const fetchWithCookies = fetchCookie(fetch);
    const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

    const executor = await makeLoginExecutor({
      user: {
        name: 'Linking Test Student',
        email: 'linking-student@example.com',
        uin: '444555666',
        sub: 'linking-student-sub-1',
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri,
      isInstructor: false,
    });

    const res = await executor.login();
    assert.equal(res.status, 200);

    const pageText = await res.text();
    const $ = cheerio.load(pageText);
    assert.ok(
      $('h2:contains("isn\'t ready yet")').length > 0,
      'Expected "not ready yet" message for student on unlinked context',
    );
  });

  test('instructor can link course instance via POST', async () => {
    const fetchWithCookies = fetchCookie(fetch);
    const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

    const executor = await makeLoginExecutor({
      user: {
        name: 'Linking Editor',
        email: 'linking-editor@example.com',
        uin: '777888999',
        sub: 'linking-editor-sub-1',
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri,
      isInstructor: true,
    });

    const loginRes = await executor.login();
    assert.equal(loginRes.status, 200);

    const user = await selectOptionalUserByUid('linking-editor@example.com');
    assert.ok(user);

    await grantCoursePermissions({
      uid: 'linking-editor@example.com',
      courseId: '1',
      courseRole: 'Editor',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Editor',
      authnUserId: user.id,
    });

    const linkingPageRes = await fetchWithCookies(targetLinkUri);
    assert.equal(linkingPageRes.status, 200);

    const linkingPageText = await linkingPageRes.text();
    const $ = cheerio.load(linkingPageText);
    const csrfToken = $('input[name="__csrf_token"]').val() as string;
    assert.ok(csrfToken, 'Could not find CSRF token');

    const linkRes = await fetchWithCookies(targetLinkUri, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        unsafe_course_instance_id: '1',
      }),
      redirect: 'manual',
    });

    assert.equal(linkRes.status, 302);
    const location = linkRes.headers.get('location');
    assert.ok(location);
    assert.match(location, /\?done$/, 'Expected redirect location to end with ?done query param');

    const linkRecord = await queryOptionalRow(
      `SELECT * FROM lti13_course_instances
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      Lti13CourseInstanceSchema,
    );
    assert.ok(linkRecord);
    assert.equal(linkRecord.course_instance_id, '1');
    // The course-navigation resource link from the launch claim is persisted.
    assert.equal(linkRecord.resource_link_id, LTI_CONTEXT_ID);
  });

  test('already linked context redirects instructor to course instance', async () => {
    const fetchWithCookies = fetchCookie(fetch);
    const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

    // Grant permissions before LTI login. Use dev admin user (ID 1) as authn_user
    // since the target user doesn't exist yet - grantCoursePermissions will create them.
    await grantCoursePermissions({
      uid: 'linked-instructor@example.com',
      uin: '101010101',
      courseId: '1',
      courseRole: 'Editor',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Editor',
      authnUserId: '1',
    });

    const executor = await makeLoginExecutor({
      user: {
        name: 'Linked Context Instructor',
        email: 'linked-instructor@example.com',
        uin: '101010101',
        sub: 'linked-instructor-sub-1',
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri,
      isInstructor: true,
    });

    const res = await executor.login();
    assert.equal(res.status, 200);
    assert.include(res.url, '/pl/course_instance/1/instructor/');
  });

  test('already linked context redirects student to course instance', async () => {
    const fetchWithCookies = fetchCookie(fetch);
    const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

    const executor = await makeLoginExecutor({
      user: {
        name: 'Linked Context Student',
        email: 'linked-student@example.com',
        uin: '121212121',
        sub: 'linked-student-sub-1',
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri,
      isInstructor: false,
    });

    const res = await executor.login();
    assert.equal(res.status, 200);
    assert.include(res.url, '/pl/course_instance/1/');
    assert.notInclude(res.url, '/instructor/');
  });

  describe('LTI 1.3 invitation admission', () => {
    beforeAll(async () => {
      const linkedCourseInstance = await queryOptionalRow(
        `SELECT *
         FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
        Lti13CourseInstanceSchema,
      );
      if (linkedCourseInstance === null) {
        await linkLtiContext({
          lti13InstanceId: '1',
          deploymentId: LTI_DEPLOYMENT_ID,
          contextId: LTI_CONTEXT_ID,
          courseInstanceId: '1',
        });
      }
    });

    afterEach(async () => {
      await updateRequiredPlansForCourseInstance('1', [], '1');
      await updateCourseInstanceSettings('1', {
        selfEnrollmentEnabled: true,
        selfEnrollmentUseEnrollmentCode: false,
        restrictToInstitution: false,
      });
      await execute("UPDATE course_instances SET enrollment_limit = NULL WHERE id = '1'");
    });

    test('admits only the exact link and sub from the fresh launch', async () => {
      await updateCourseInstanceSettings('1', {
        selfEnrollmentEnabled: false,
        selfEnrollmentUseEnrollmentCode: true,
        restrictToInstitution: false,
      });
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const sub = 'exact-invitation-admission-sub';
      const invitation = await createEnrollment({
        courseInstance,
        pendingLti13CourseInstanceId: lti13CourseInstance.id,
        pendingLti13Sub: sub,
        pendingUin: 'exact-invitation-unmatched-uin',
        status: 'invited',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Exact Invitation Admission',
          email: 'exact-invitation-admission@example.com',
          uin: 'exact-invitation-user-uin',
          sub,
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: false,
      });

      const response = await executor.login();
      assert.include(response.url, '/pl/course_instance/1/assessments');

      const user = await selectOptionalUserByUid('exact-invitation-admission@example.com');
      assert.ok(user);
      const [enrollment] = await selectEnrollments([invitation.id]);
      assert.equal(enrollment.status, 'joined');
      assert.equal(enrollment.user_id, user.id);
      await assertLtiLaunchConsumed(user.id);
    });

    test('rejects a wrong sub and falls back to self-enrollment', async () => {
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const invitation = await createEnrollment({
        courseInstance,
        pendingLti13CourseInstanceId: lti13CourseInstance.id,
        pendingLti13Sub: 'expected-invitation-sub',
        pendingUin: 'wrong-sub-unmatched-uin',
        status: 'invited',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Wrong Sub Student',
          email: 'wrong-sub-student@example.com',
          uin: 'wrong-sub-user-uin',
          sub: 'actual-invitation-sub',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: false,
      });

      const response = await executor.login();
      assert.include(response.url, '/pl/course_instance/1/assessments');

      const user = await selectOptionalUserByUid('wrong-sub-student@example.com');
      assert.ok(user);
      const [persistedInvitation] = await selectEnrollments([invitation.id]);
      assert.equal(persistedInvitation.status, 'invited');
      assert.isNull(persistedInvitation.user_id);
      const selfEnrollment = await selectOptionalEnrollmentByUserId({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isNotNull(selfEnrollment);
      assert.equal(selfEnrollment.status, 'joined');
      await assertLtiLaunchConsumed(user.id);
    });

    test('finishes LTI invitation admission after the required plan is granted', async () => {
      await updateRequiredPlansForCourseInstance('1', ['basic'], '1');
      await updateCourseInstanceSettings('1', {
        selfEnrollmentEnabled: false,
        selfEnrollmentUseEnrollmentCode: true,
        restrictToInstitution: false,
      });
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const sub = 'upgrade-exact-invitation-sub';
      const invitation = await createEnrollment({
        courseInstance,
        pendingLti13CourseInstanceId: lti13CourseInstance.id,
        pendingLti13Sub: sub,
        pendingUin: 'upgrade-exact-invitation-unmatched-uin',
        status: 'invited',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Upgrade Exact Invitation',
          email: 'upgrade-exact-invitation@example.com',
          uin: 'upgrade-exact-invitation-user-uin',
          sub,
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: false,
      });

      const response = await executor.login();
      assert.include(response.url, '/pl/course_instance/1/upgrade?lti13_relaunch=1');
      const $ = cheerio.load(await response.text());
      assert.include($('body').text(), 'Upgrade required');

      const [persistedInvitation] = await selectEnrollments([invitation.id]);
      assert.equal(persistedInvitation.status, 'invited');
      assert.isNull(persistedInvitation.user_id);
      const user = await selectOptionalUserByUid('upgrade-exact-invitation@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);

      await reconcilePlanGrantsForCourseInstanceUser(
        { institution_id: '1', course_instance_id: '1', user_id: user.id },
        [{ plan: 'basic', grantType: 'stripe' }],
        '1',
      );
      const admissionResponse = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/upgrade?lti13_relaunch=1`,
      );
      assert.include(admissionResponse.url, '/pl/course_instance/1/assessments');

      const [admittedEnrollment] = await selectEnrollments([invitation.id]);
      assert.equal(admittedEnrollment.status, 'joined');
      assert.equal(admittedEnrollment.user_id, user.id);
    });
  });

  describe('LTI 1.3 linking authorization', () => {
    test('instructor without course permissions does not see linking form', async () => {
      // First, clean up any existing link to test the unauthorized view
      await execute(
        `DELETE FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      );

      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Login as instructor via LTI (passes LTI role check) but WITHOUT granting
      // any PrairieLearn course permissions
      const executor = await makeLoginExecutor({
        user: {
          name: 'Unauthorized Instructor',
          email: 'unauthorized-instructor@example.com',
          uin: '999000111',
          sub: 'unauthorized-instructor-sub-1',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: true,
      });

      const loginRes = await executor.login();
      assert.equal(loginRes.status, 200);

      // The linking page should NOT show the course instance selector for instructors
      // without course permissions - this is the authorization check at the UI level
      const linkingPageRes = await fetchWithCookies(targetLinkUri);
      assert.equal(linkingPageRes.status, 200);

      const linkingPageText = await linkingPageRes.text();
      const $ = cheerio.load(linkingPageText);

      // Verify the linking form is NOT shown (no course instance selector)
      const courseInstanceSelector = $('select[name="unsafe_course_instance_id"]');
      assert.equal(
        courseInstanceSelector.length,
        0,
        'Instructor without permissions should not see course instance selector',
      );

      // Verify no link was created
      const linkRecord = await queryOptionalRow(
        `SELECT * FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
        Lti13CourseInstanceSchema,
      );
      assert.isNull(linkRecord);
    });

    test('cannot link course instance from different institution', async () => {
      // Create a second institution with its own course and course instance
      const { courseId, courseInstanceId } = await createCrossInstitutionFixture();

      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions for the OTHER institution's course
      // This user has permissions for course in institution 2, but the LTI instance is in institution 1
      await grantCoursePermissions({
        uid: 'cross-inst-instructor@example.com',
        uin: '888000222',
        courseId,
        courseRole: 'Editor',
        courseInstanceId,
        courseInstanceRole: 'Student Data Editor',
        authnUserId: '1',
      });

      const executor = await makeLoginExecutor({
        user: {
          name: 'Cross Institution Instructor',
          email: 'cross-inst-instructor@example.com',
          uin: '888000222',
          sub: 'cross-inst-instructor-sub-1',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: true,
      });

      const loginRes = await executor.login();
      assert.equal(loginRes.status, 200);

      // Fetch the linking page to get a CSRF token
      const linkingPageRes = await fetchWithCookies(targetLinkUri);
      assert.equal(linkingPageRes.status, 200);

      const linkingPageText = await linkingPageRes.text();
      const $ = cheerio.load(linkingPageText);
      const csrfToken = $('input[name="__csrf_token"]').val() as string;
      assert.ok(csrfToken, 'Could not find CSRF token');

      // Attempt to link course instance from institution 2 to LTI instance from institution 1
      // Use redirect: 'manual' to see the actual response status
      const linkRes = await fetchWithCookies(targetLinkUri, {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: csrfToken,
          unsafe_course_instance_id: courseInstanceId,
        }),
        redirect: 'manual',
      });

      // Should get 403 because the course instance belongs to a different institution
      // than the LTI instance
      assert.equal(linkRes.status, 403);

      // Verify no link was created
      const linkRecord = await queryOptionalRow(
        `SELECT * FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND course_instance_id = $course_instance_id`,
        { course_instance_id: courseInstanceId },
        Lti13CourseInstanceSchema,
      );
      assert.isNull(linkRecord);

      // Re-create the link for subsequent tests that depend on it
      await linkLtiContext({
        lti13InstanceId: '1',
        deploymentId: LTI_DEPLOYMENT_ID,
        contextId: LTI_CONTEXT_ID,
        courseInstanceId: '1',
      });
    });
  });

  describe('LTI 1.3 instructor admin page', () => {
    test('GET admin page shows linked instance', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions before LTI login. Use dev admin user (ID 1) as authn_user
      // since the target user doesn't exist yet - grantCoursePermissions will create them.
      await grantCoursePermissions({
        uid: 'admin-test@example.com',
        uin: '131313131',
        courseId: '1',
        courseRole: 'Editor',
        courseInstanceId: '1',
        courseInstanceRole: 'Student Data Editor',
        authnUserId: '1',
      });

      const executor = await makeLoginExecutor({
        user: {
          name: 'Admin Page Test Instructor',
          email: 'admin-test@example.com',
          uin: '131313131',
          sub: 'admin-test-sub-1',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: true,
      });

      const loginRes = await executor.login();
      assert.equal(loginRes.status, 200);

      const linkRecord = await queryOptionalRow(
        `SELECT * FROM lti13_course_instances
         WHERE course_instance_id = '1'
         AND lti13_instance_id = '1'`,
        {},
        Lti13CourseInstanceSchema,
      );
      assert.ok(linkRecord);

      const adminPageRes = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/lti13_instance/${linkRecord.id}`,
      );
      assert.equal(adminPageRes.status, 200);

      const pageText = await adminPageRes.text();
      const $ = cheerio.load(pageText);
      assert.ok(
        $('h1:contains("LTI 1.3 configuration")').length > 0,
        'Expected LTI 1.3 configuration page',
      );
    });

    test('GET admin page redirects when no ID provided', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions before LTI login. Use dev admin user (ID 1) as authn_user
      // since the target user doesn't exist yet - grantCoursePermissions will create them.
      await grantCoursePermissions({
        uid: 'admin-redirect@example.com',
        uin: '141414141',
        courseId: '1',
        courseRole: 'Editor',
        courseInstanceId: '1',
        courseInstanceRole: 'Student Data Editor',
        authnUserId: '1',
      });

      const executor = await makeLoginExecutor({
        user: {
          name: 'Admin Redirect Test',
          email: 'admin-redirect@example.com',
          uin: '141414141',
          sub: 'admin-redirect-sub-1',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: true,
      });

      const loginRes = await executor.login();
      assert.equal(loginRes.status, 200);

      const adminPageRes = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/lti13_instance`,
        { redirect: 'manual' },
      );

      assert.equal(adminPageRes.status, 302);
      const location = adminPageRes.headers.get('location');
      assert.ok(location);
      assert.include(location, 'lti13_instance/');
    });
  });

  describe('LTI 1.3 NRPS roster inspector', () => {
    test('inspectRoster appends rlid, dumps members, and annotates sub/custom/lis identity candidates', async () => {
      // Ensure course instance 1 is linked to LTI instance 1.
      await execute(
        `DELETE FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      );
      await linkLtiContext({
        lti13InstanceId: '1',
        deploymentId: LTI_DEPLOYMENT_ID,
        contextId: LTI_CONTEXT_ID,
        courseInstanceId: '1',
      });

      // Create a user with a known sub and UIN to exercise both identity annotations.
      const knownSub = 'roster-inspector-sub-1';
      const knownUin = '555000555';
      await grantCoursePermissions({
        uid: 'roster-inspector@example.com',
        uin: knownUin,
        courseId: '1',
        courseRole: 'Editor',
        courseInstanceId: '1',
        courseInstanceRole: 'Student Data Editor',
        authnUserId: '1',
      });
      const executor = await makeLoginExecutor({
        user: {
          name: 'Roster Inspector User',
          email: 'roster-inspector@example.com',
          uin: knownUin,
          sub: knownSub,
        },
        fetchWithCookies: fetchCookie(fetch),
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
        isInstructor: true,
      });
      const loginRes = await executor.login();
      assert.equal(loginRes.status, 200);

      // Point the linked course instance's NRPS endpoint at our mock platform.
      // This must happen after login, since the instructor launch overwrites
      // context_memberships_url from the (membership-less) launch claim.
      const membershipsUrl = `http://localhost:${oidcProviderPort}/memberships`;
      await execute(
        `UPDATE lti13_course_instances
         SET context_memberships_url = $url, resource_link_id = 'rl-course-nav'
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { url: membershipsUrl, deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      );

      const instance = await queryRow(
        `SELECT to_jsonb(lci) AS lti13_course_instance, to_jsonb(li) AS lti13_instance
         FROM lti13_course_instances AS lci
         JOIN lti13_instances AS li ON li.id = lci.lti13_instance_id
         WHERE lci.lti13_instance_id = '1'
         AND lci.deployment_id = $deployment_id
         AND lci.context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
        Lti13CombinedInstanceSchema,
      );

      const capturedRlids: (string | undefined)[] = [];
      const capturedAuthorizationHeaders: (string | undefined)[] = [];
      const capturedAcceptHeaders: (string | undefined)[] = [];
      const app = express();
      app.use(express.urlencoded({ extended: true }));
      app.post('/token', (_req, res) => {
        res.json({
          access_token: 'roster-inspector-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
        });
      });
      app.get('/memberships', (req, res) => {
        capturedRlids.push(typeof req.query.rlid === 'string' ? req.query.rlid : undefined);
        capturedAuthorizationHeaders.push(req.get('authorization'));
        capturedAcceptHeaders.push(req.get('accept'));
        res.setHeader('Content-Type', 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json');
        res.json({
          id: membershipsUrl,
          context: { id: LTI_CONTEXT_ID },
          members: [
            {
              status: 'Active',
              user_id: knownSub,
              roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
              email: 'roster-inspector@example.com',
              message: [
                {
                  'https://purl.imsglobal.org/spec/lti/claim/message_type':
                    'LtiResourceLinkRequest',
                  'https://purl.imsglobal.org/spec/lti/claim/custom': { uin: knownUin },
                },
              ],
            },
            {
              status: 'Active',
              user_id: 'nrps-unknown-sub-with-uin',
              roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
              email: 'nrps-uin@example.com',
              message: [
                {
                  'https://purl.imsglobal.org/spec/lti/claim/message_type':
                    'LtiResourceLinkRequest',
                  'https://purl.imsglobal.org/spec/lti/claim/custom': { uin: knownUin },
                },
              ],
            },
            {
              status: 'Active',
              user_id: 'nrps-unknown-sub-no-match',
              roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
              email: 'nrps-none@example.com',
              // NRPS flattens the lis sourcedid onto the member (no `message`),
              // which exercises lis-based uin_attribute resolution below.
              lis_person_sourcedid: knownUin,
            },
          ],
        });
      });

      // Instance 1 resolves UIN from a custom claim; clone it to also cover an
      // instance configured to read UIN from the lis person_sourcedid claim.
      const lisInstance = {
        ...instance,
        lti13_instance: {
          ...instance.lti13_instance,
          uin_attribute: '["https://purl.imsglobal.org/spec/lti/claim/lis"]["person_sourcedid"]',
        },
      };

      const customJob = await createServerJob({
        type: 'lti13',
        description: 'Inspect LTI 1.3 NRPS roster (test, custom)',
        userId: null,
        authnUserId: null,
      });
      const lisJob = await createServerJob({
        type: 'lti13',
        description: 'Inspect LTI 1.3 NRPS roster (test, lis)',
        userId: null,
        authnUserId: null,
      });

      await withServer(app, oidcProviderPort, async () => {
        await customJob.executeUnsafe(async (job) => {
          await inspectRoster({ instance, rlid: 'rl-course-nav', job });
        });
        await lisJob.executeUnsafe(async (job) => {
          await inspectRoster({ instance: lisInstance, rlid: null, job });
        });
      });

      // The custom run appended the chosen rlid; the lis run requested a plain roster.
      assert.deepEqual(capturedRlids, ['rl-course-nav', undefined]);
      assert.deepEqual(capturedAuthorizationHeaders, [
        'Bearer roster-inspector-token',
        'Bearer roster-inspector-token',
      ]);
      assert.deepEqual(capturedAcceptHeaders, [
        'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
        'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
      ]);

      const customJobs = await selectJobsByJobSequenceId(customJob.jobSequenceId);
      assert.lengthOf(customJobs, 1);
      const customOutput = customJobs[0].output ?? '';
      assert.include(customOutput, 'Found 3 members.');
      assert.include(customOutput, 'roster-inspector@example.com');
      assert.include(customOutput, 'Stored sub binding: PrairieLearn user');
      assert.include(
        customOutput,
        `Roster UIN ${knownUin}: PrairieLearn user roster-inspector@example.com`,
      );
      assert.include(customOutput, 'Stored sub binding: none');
      assert.include(customOutput, 'Configured-UIN grade routing would fail');

      // With no rlid (no custom claims), the lis-configured instance still resolves
      // the UIN from the lis sourcedid that NRPS flattens onto the member.
      const lisJobs = await selectJobsByJobSequenceId(lisJob.jobSequenceId);
      assert.lengthOf(lisJobs, 1);
      const lisOutput = lisJobs[0].output ?? '';
      assert.include(
        lisOutput,
        `Roster UIN ${knownUin}: PrairieLearn user roster-inspector@example.com`,
      );
    });
  });

  describe('LTI 1.3 assessment linking with multiple linked LMS courses', () => {
    const SECOND_CONTEXT_ID = '5a0b3f2c-8e1d-4a6b-9c7f-2d3e4f5a6b7c';
    const STUDENT_UID = 'multi-lms-student@example.com';
    const STUDENT_UIN = '246802468';

    let lmsCourses: { instance: Lti13CombinedInstance; lineitemUrl: string }[];
    let assessmentId: string;
    let app: express.Express;
    let scoredLineitems: string[];
    let failingMembershipRlid: string | null = null;

    beforeAll(async () => {
      // Two LMS courses in the same LTI instance, both linked to course instance 1.
      await execute("DELETE FROM lti13_course_instances WHERE lti13_instance_id = '1'");
      for (const contextId of [LTI_CONTEXT_ID, SECOND_CONTEXT_ID]) {
        await linkLtiContext({
          lti13InstanceId: '1',
          deploymentId: LTI_DEPLOYMENT_ID,
          contextId,
          courseInstanceId: '1',
        });
      }
      await execute(
        `UPDATE lti13_course_instances
         SET context_memberships_url = $memberships_url,
             lineitems_url = $lineitems_url,
             resource_link_id = context_id
         WHERE lti13_instance_id = '1'`,
        {
          memberships_url: `http://localhost:${oidcProviderPort}/memberships`,
          lineitems_url: `http://localhost:${oidcProviderPort}/line_items`,
        },
      );

      const instances = await queryRows(
        `SELECT to_jsonb(lci) AS lti13_course_instance, to_jsonb(li) AS lti13_instance
         FROM lti13_course_instances AS lci
         JOIN lti13_instances AS li ON li.id = lci.lti13_instance_id
         WHERE lci.lti13_instance_id = '1'
         ORDER BY lci.id`,
        {},
        Lti13CombinedInstanceSchema,
      );
      assert.lengthOf(instances, 2);
      lmsCourses = instances.map((instance, index) => ({
        instance,
        lineitemUrl: `http://localhost:${oidcProviderPort}/line_items/${index}`,
      }));

      assessmentId = await queryScalar(
        `SELECT id FROM assessments
         WHERE course_instance_id = '1' AND team_work IS NOT TRUE AND deleted_at IS NULL
         ORDER BY id LIMIT 1`,
        {},
        IdSchema,
      );

      const student = await selectOrInsertUserByUid(STUDENT_UID);
      await execute('UPDATE users SET uin = $uin WHERE id = $user_id', {
        uin: STUDENT_UIN,
        user_id: student.id,
      });
      await execute(
        `INSERT INTO assessment_instances (assessment_id, user_id, number, score_perc, date, open)
         VALUES ($assessment_id, $user_id, 1, 80, NOW(), FALSE)`,
        { assessment_id: assessmentId, user_id: student.id },
      );

      app = express();
      app.use(express.urlencoded({ extended: true }));
      app.post('/token', (_req, res) => {
        res.json({ access_token: 'multi-lms-token', token_type: 'bearer', expires_in: 3600 });
      });
      app.get('/line_items/:index', (req, res) => {
        res.json({
          id: `http://localhost:${oidcProviderPort}/line_items/${req.params.index}`,
          label: `Assignment in LMS course ${req.params.index}`,
          scoreMaximum: 100,
        });
      });
      app.post('/line_items/:index/scores', (req, res) => {
        scoredLineitems.push(req.params.index);
        res.json({});
      });
      // Each LMS course must see its own context, which the rlid identifies here.
      app.get('/memberships', (req, res) => {
        if (req.query.rlid === failingMembershipRlid) {
          res.json({});
          return;
        }

        res.setHeader('Content-Type', 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json');
        res.json({
          id: `http://localhost:${oidcProviderPort}/memberships`,
          context: { id: req.query.rlid },
          members: [
            {
              status: 'Active',
              user_id: 'multi-lms-student-sub',
              roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
              email: STUDENT_UID,
              message: [
                {
                  'https://purl.imsglobal.org/spec/lti/claim/message_type':
                    'LtiResourceLinkRequest',
                  'https://purl.imsglobal.org/spec/lti/claim/custom': { uin: STUDENT_UIN },
                },
              ],
            },
          ],
        });
      });

      await withServer(app, oidcProviderPort, async () => {
        for (const { instance, lineitemUrl } of lmsCourses) {
          await queryAndLinkLineitem(instance, lineitemUrl, assessmentId);
        }
      });
    });

    test('links one assessment to an assignment in each LMS course', async () => {
      const links = await queryRows(
        `SELECT * FROM lti13_assessments
         WHERE assessment_id = $assessment_id
         ORDER BY lti13_course_instance_id`,
        { assessment_id: assessmentId },
        Lti13AssessmentSchema,
      );

      assert.deepEqual(
        links.map((link) => [link.lti13_course_instance_id, link.lineitem_id_url]),
        lmsCourses.map(({ instance, lineitemUrl }) => [
          instance.lti13_course_instance.id,
          lineitemUrl,
        ]),
      );
    });

    test('rejects a second assignment link for the same assessment in one LMS course', async () => {
      await withServer(app, oidcProviderPort, async () => {
        await expect(
          queryAndLinkLineitem(
            lmsCourses[0].instance,
            `http://localhost:${oidcProviderPort}/line_items/9`,
            assessmentId,
          ),
        ).rejects.toThrow(/lti13_assessments_assessment_id_lti13_course_instance_id_key/);
      });
    });

    test('sends grades to the assignment in the LMS course they were sent from', async () => {
      scoredLineitems = [];
      const courseInstance = await selectCourseInstanceById('1');

      await withServer(app, oidcProviderPort, async () => {
        for (const { instance } of lmsCourses) {
          const serverJob = await createServerJob({
            type: 'lti13',
            description: 'LTI 1.3 send assessment grades to LMS (test)',
            userId: null,
            authnUserId: null,
          });
          await serverJob.executeUnsafe(async (job) => {
            await updateLti13Scores({
              courseInstance,
              unsafe_assessment_id: assessmentId,
              instance,
              job,
            });
          });
        }
      });

      assert.deepEqual(scoredLineitems, ['0', '1']);
    });

    test('sends grades to every linked LMS course from one action', async () => {
      scoredLineitems = [];
      const pageUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/lti13_instance/${lmsCourses[0].instance.lti13_course_instance.id}`;

      const pageRes = await fetchCheerio(pageUrl);
      assert.equal(pageRes.status, 200);
      assert.lengthOf(pageRes.$('button[value="send_grades_all_lms_courses"]'), 1);

      await withServer(app, oidcProviderPort, async () => {
        const postRes = await fetchCheerio(pageUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __csrf_token: pageRes.$('input[name="__csrf_token"]').first().val() as string,
            __action: 'send_grades_all_lms_courses',
            unsafe_assessment_id: assessmentId,
          }),
          redirect: 'manual',
        });
        assert.equal(postRes.status, 302);

        const jobSequenceId = postRes.headers.get('location')?.split('/jobSequence/')[1];
        assert.ok(jobSequenceId);
        await helperServer.waitForJobSequenceSuccess(jobSequenceId);
      });

      assert.deepEqual(scoredLineitems, ['0', '1']);
    });

    test('continues sending grades after one LMS course fails', async () => {
      scoredLineitems = [];
      failingMembershipRlid = lmsCourses[0].instance.lti13_course_instance.resource_link_id;
      assert.ok(failingMembershipRlid);

      const pageUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/lti13_instance/${lmsCourses[0].instance.lti13_course_instance.id}`;
      const pageRes = await fetchCheerio(pageUrl);
      assert.equal(pageRes.status, 200);

      let jobSequenceId: string | null = null;
      try {
        await withServer(app, oidcProviderPort, async () => {
          const postRes = await fetchCheerio(pageUrl, {
            method: 'POST',
            body: new URLSearchParams({
              __csrf_token: pageRes.$('input[name="__csrf_token"]').first().val() as string,
              __action: 'send_grades_all_lms_courses',
              unsafe_assessment_id: assessmentId,
            }),
            redirect: 'manual',
          });
          assert.equal(postRes.status, 302);

          jobSequenceId = postRes.headers.get('location')?.split('/jobSequence/')[1] ?? null;
          assert.ok(jobSequenceId);
          await helperServer.waitForJobSequenceStatus(jobSequenceId, 'Error');
        });
      } finally {
        failingMembershipRlid = null;
      }

      assert.deepEqual(scoredLineitems, ['1']);

      assert.ok(jobSequenceId);
      const jobs = await selectJobsByJobSequenceId(jobSequenceId);
      assert.lengthOf(jobs, 1);
      assert.include(jobs[0].output, 'Error sending grades to');
      assert.include(jobs[0].output, 'Failed to send grades to 1 LMS course');
    });
  });
});
