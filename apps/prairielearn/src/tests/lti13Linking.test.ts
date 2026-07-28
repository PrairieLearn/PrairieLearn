/**
 * Tests for LTI 1.3 course instance linking and admin page.
 */
import * as cheerio from 'cheerio';
import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import nodeJose from 'node-jose';
import { afterAll, afterEach, assert, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { execute, queryOptionalRow, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  reconcilePlanGrantsForCourseInstanceUser,
  updateRequiredPlansForCourseInstance,
} from '../ee/lib/billing/plans.js';
import { Lti13CombinedInstanceSchema, inspectRoster } from '../ee/lib/lti13.js';
import { config } from '../lib/config.js';
import { CourseInstanceAdmissionContinuationSchema } from '../lib/course-instance-admission-continuation.js';
import { EnrollmentSchema, Lti13CourseInstanceSchema } from '../lib/db-types.js';
import { createServerJob, selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectAuditEventsByEnrollmentId } from '../models/audit-event.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalUserByUid } from '../models/user.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import {
  LTI_CONTEXT_ID,
  LTI_DEPLOYMENT_ID,
  createCrossInstitutionFixture,
  createLti13Instance,
  grantCoursePermissions,
  linkLtiContext,
  makeLoginExecutor,
  withServer,
} from './lti13TestHelpers.js';
import { updateCourseInstanceSettings } from './utils/auth.js';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3 course instance linking', { concurrent: false }, () => {
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

  async function selectLinkedLtiCourseInstance(contextId = LTI_CONTEXT_ID, lti13InstanceId = '1') {
    return await queryRow(
      `SELECT *
       FROM lti13_course_instances
       WHERE lti13_instance_id = $lti13_instance_id
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      {
        deployment_id: LTI_DEPLOYMENT_ID,
        context_id: contextId,
        lti13_instance_id: lti13InstanceId,
      },
      Lti13CourseInstanceSchema,
    );
  }

  async function insertLtiRosterInvitation({
    lti13CourseInstanceId,
    pendingUin,
    sub,
  }: {
    lti13CourseInstanceId: string;
    pendingUin: string;
    sub: string;
  }) {
    return await queryRow(
      `INSERT INTO enrollments (
         course_instance_id,
         pending_lti13_course_instance_id,
         pending_lti13_sub,
         pending_uin,
         status
       )
       VALUES ('1', $lti13_course_instance_id, $sub, $pending_uin, 'invited')
       RETURNING *`,
      {
        lti13_course_instance_id: lti13CourseInstanceId,
        pending_uin: pendingUin,
        sub,
      },
      EnrollmentSchema,
    );
  }

  async function selectLatestSessionData(userId: string) {
    return await queryScalar(
      `SELECT data
       FROM user_sessions
       WHERE user_id = $user_id
       ORDER BY updated_at DESC
       LIMIT 1`,
      { user_id: userId },
      z.record(z.string(), z.unknown()),
    );
  }

  async function assertLtiLaunchConsumed(userId: string) {
    const sessionData = await selectLatestSessionData(userId);
    assert.notProperty(sessionData, 'lti13_claims');
    assert.notProperty(sessionData, 'authn_lti13_instance_id');
  }

  beforeAll(async () => {
    config.isEnterprise = true;
    await helperServer.before()();

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

    // Enable LTI 1.3 as auth provider
    const ssoResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`);
    assert.equal(ssoResponse.status, 200, 'Failed to load SSO settings page');

    const saveButton = ssoResponse.$('button:contains(Save)');
    const form = saveButton.closest('form');
    const lti13Input = form.find('label:contains(LTI 1.3)').closest('div').find('input');
    const lti13InputValue = lti13Input.attr('value');
    assert.ok(lti13InputValue, 'Could not find LTI 1.3 input value in SSO form');

    const enableLtiResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: form.find('input[name=__csrf_token]').val() as string,
        enabled_authn_provider_ids: lti13InputValue,
        default_authn_provider_id: '',
      }),
    });
    assert.equal(enableLtiResponse.status, 200, 'Failed to enable LTI 1.3 as auth provider');
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

    await execute(
      `UPDATE lti13_course_instances
       SET context_title = 'Stale title'
       WHERE lti13_instance_id = '1'
       AND deployment_id = $deployment_id
       AND context_id = $context_id`,
      { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
    );

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

    const linkRecord = await selectLinkedLtiCourseInstance();
    assert.equal(linkRecord.context_title, 'Test Course');
    const user = await selectOptionalUserByUid('linked-instructor@example.com');
    assert.ok(user);
    await assertLtiLaunchConsumed(user.id);
    assert.notProperty(
      await selectLatestSessionData(user.id),
      'course_instance_admission_continuation',
    );
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

  describe('LTI 1.3 roster admission', () => {
    afterEach(async () => {
      await updateRequiredPlansForCourseInstance('1', [], '1');
      await execute(
        `UPDATE course_instances
         SET
           enrollment_limit = NULL,
           self_enrollment_enabled = TRUE,
           self_enrollment_use_enrollment_code = FALSE
         WHERE id = '1'`,
      );
    });

    test('binds a verified launch to its LTI instance', async () => {
      const secondLti13InstanceId = await createLti13Instance({
        siteUrl,
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
      });
      await linkLtiContext({
        lti13InstanceId: secondLti13InstanceId,
        deploymentId: LTI_DEPLOYMENT_ID,
        contextId: LTI_CONTEXT_ID,
        courseInstanceId: '1',
      });
      const secondLti13CourseInstance = await selectLinkedLtiCourseInstance(
        LTI_CONTEXT_ID,
        secondLti13InstanceId,
      );
      const sub = 'cross-instance-launch-sub';
      const uin = 'cross-instance-launch-uin';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: secondLti13CourseInstance.id,
        pendingUin: uin,
        sub,
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/${secondLti13InstanceId}/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Cross-instance Launch Student',
          email: 'cross-instance-launch@example.com',
          uin,
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
      assert.equal(response.status, 403);
      assert.equal(response.url, targetLinkUri);

      const persistedInvitation = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(persistedInvitation).toMatchObject({
        pending_lti13_course_instance_id: secondLti13CourseInstance.id,
        pending_lti13_sub: sub,
        status: 'invited',
        user_id: null,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: invitation.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      const user = await selectOptionalUserByUid('cross-instance-launch@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);
      assert.notProperty(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );
    });

    test('admits an exact link and sub without self-enrollment authority', async () => {
      await execute(
        `UPDATE course_instances
         SET
           self_enrollment_enabled = FALSE,
           self_enrollment_use_enrollment_code = TRUE
         WHERE id = '1'`,
      );
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const sub = 'exact-roster-admission-sub';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: 'exact-roster-admission-unmatched-uin',
        sub,
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Exact Roster Admission',
          email: 'exact-roster-admission@example.com',
          uin: 'exact-roster-admission-user-uin',
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

      const res = await executor.login();
      assert.equal(res.status, 200);
      assert.include(res.url, '/pl/course_instance/1/assessments');

      const user = await selectOptionalUserByUid('exact-roster-admission@example.com');
      assert.ok(user);
      const enrollment = await queryRow(
        `SELECT *
         FROM enrollments
         WHERE course_instance_id = '1'
         AND user_id = $user_id`,
        { user_id: user.id },
        EnrollmentSchema,
      );
      expect(enrollment).toMatchObject({
        id: invitation.id,
        pending_lti13_course_instance_id: null,
        pending_lti13_sub: null,
        pending_uin: null,
        status: 'joined',
        user_id: user.id,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: enrollment.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          action_detail: 'roster_admitted',
          context: expect.objectContaining({ admission_source: 'lti13' }),
        }),
      );
      await assertLtiLaunchConsumed(user.id);
      assert.notProperty(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );
      const consumedLaunchRes = await fetchWithCookies(targetLinkUri, { redirect: 'manual' });
      assert.equal(consumedLaunchRes.status, 403);
    });

    test('preserves exact LTI admission across a required-plan upgrade', async () => {
      await updateRequiredPlansForCourseInstance('1', ['compute'], '1');
      await updateCourseInstanceSettings('1', {
        restrictToInstitution: false,
        selfEnrollmentEnabled: false,
        selfEnrollmentUseEnrollmentCode: true,
      });
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const sub = 'upgrade-exact-roster-sub';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: 'upgrade-exact-roster-unmatched-uin',
        sub,
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Upgrade Exact Roster',
          email: 'upgrade-exact-roster@example.com',
          uin: 'upgrade-exact-roster-user-uin',
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

      const upgradeResponse = await executor.login();
      assert.equal(upgradeResponse.status, 200);
      assert.include(upgradeResponse.url, '/pl/course_instance/1/upgrade');

      const user = await selectOptionalUserByUid('upgrade-exact-roster@example.com');
      assert.ok(user);
      const sessionData = await selectLatestSessionData(user.id);
      assert.notProperty(sessionData, 'lti13_claims');
      assert.notProperty(sessionData, 'authn_lti13_instance_id');
      expect(
        CourseInstanceAdmissionContinuationSchema.parse(
          sessionData.course_instance_admission_continuation,
        ),
      ).toMatchObject({
        course_instance_id: '1',
        lti13_course_instance_id: lti13CourseInstance.id,
        sub,
        type: 'lti13',
        user_id: user.id,
      });

      const csrfToken = generateCsrfToken({
        authnUserId: user.id,
        url: '/pl/course_instance/1/upgrade',
      });
      const upgradePostResponse = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/upgrade`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'upgrade',
            __csrf_token: csrfToken,
            unsafe_plan_names: 'compute',
          }),
        },
      );
      assert.equal(upgradePostResponse.status, 400);
      assert.property(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );

      await reconcilePlanGrantsForCourseInstanceUser(
        { institution_id: '1', course_instance_id: '1', user_id: user.id },
        [{ plan: 'compute', grantType: 'invoice' }],
        '1',
      );
      const assessmentsResponse = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/assessments`,
      );
      assert.equal(assessmentsResponse.status, 200);
      assert.include(assessmentsResponse.url, '/pl/course_instance/1/assessments');

      const enrollment = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(enrollment).toMatchObject({
        pending_lti13_course_instance_id: null,
        pending_lti13_sub: null,
        pending_uin: null,
        status: 'joined',
        user_id: user.id,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: enrollment.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          action_detail: 'roster_admitted',
          context: expect.objectContaining({ admission_source: 'lti13' }),
        }),
      );
      assert.notProperty(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );
    });

    test('does not grant LTI roster authority to a wrong sub', async () => {
      await execute(
        `UPDATE course_instances
         SET
           self_enrollment_enabled = FALSE,
           self_enrollment_use_enrollment_code = TRUE
         WHERE id = '1'`,
      );
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const uin = 'wrong-sub-matching-uin';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: uin,
        sub: 'expected-roster-sub',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Wrong Sub Student',
          email: 'wrong-sub-student@example.com',
          uin,
          sub: 'actual-roster-sub',
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
      assert.equal(res.status, 403);
      assert.include(res.url, '/pl/course_instance/1/assessments');

      const persistedInvitation = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(persistedInvitation).toMatchObject({
        pending_lti13_course_instance_id: lti13CourseInstance.id,
        pending_lti13_sub: 'expected-roster-sub',
        status: 'invited',
        user_id: null,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: invitation.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      const user = await selectOptionalUserByUid('wrong-sub-student@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);
      const sessionData = await selectLatestSessionData(user.id);
      expect(
        CourseInstanceAdmissionContinuationSchema.parse(
          sessionData.course_instance_admission_continuation,
        ),
      ).toMatchObject({
        course_instance_id: '1',
        type: 'ordinary',
        user_id: user.id,
      });
    });

    test('falls back to independently allowed ordinary self-enrollment for a wrong sub', async () => {
      await execute(
        `UPDATE course_instances
         SET
           self_enrollment_enabled = TRUE,
           self_enrollment_use_enrollment_code = FALSE
         WHERE id = '1'`,
      );
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const uin = 'ordinary-fallback-matching-uin';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: uin,
        sub: 'ordinary-fallback-expected-sub',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Ordinary Fallback Student',
          email: 'ordinary-fallback-student@example.com',
          uin,
          sub: 'ordinary-fallback-actual-sub',
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
      assert.include(res.url, '/pl/course_instance/1/assessments');

      const user = await selectOptionalUserByUid('ordinary-fallback-student@example.com');
      assert.ok(user);
      const enrollment = await queryRow(
        `SELECT *
         FROM enrollments
         WHERE course_instance_id = '1'
         AND user_id = $user_id`,
        { user_id: user.id },
        EnrollmentSchema,
      );
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: enrollment.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          action_detail: 'implicit_joined',
          context: expect.objectContaining({ admission_source: 'ordinary' }),
        }),
      );
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      const persistedInvitation = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(persistedInvitation).toMatchObject({
        pending_lti13_course_instance_id: null,
        pending_lti13_sub: null,
        pending_uin: null,
        status: 'joined',
        user_id: user.id,
      });
      assert.equal(persistedInvitation.id, enrollment.id);
      await assertLtiLaunchConsumed(user.id);
      const sessionData = await selectLatestSessionData(user.id);
      assert.notProperty(sessionData, 'course_instance_admission_continuation');
    });

    test('preserves enrollment-code policy after exact LTI denial', async () => {
      await updateCourseInstanceSettings('1', {
        restrictToInstitution: false,
        selfEnrollmentEnabled: true,
        selfEnrollmentUseEnrollmentCode: true,
      });
      const enrollmentCode = (await selectCourseInstanceById('1')).enrollment_code;
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const uin = 'code-fallback-matching-uin';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: uin,
        sub: 'code-fallback-expected-sub',
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Code Fallback Student',
          email: 'code-fallback-student@example.com',
          uin,
          sub: 'code-fallback-actual-sub',
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
        targetLinkUri,
        isInstructor: false,
      });

      const loginResponse = await executor.login();
      assert.equal(loginResponse.status, 200);
      assert.include(loginResponse.url, '/pl/course_instance/1/join');

      const user = await selectOptionalUserByUid('code-fallback-student@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);
      expect(
        CourseInstanceAdmissionContinuationSchema.parse(
          (await selectLatestSessionData(user.id)).course_instance_admission_continuation,
        ),
      ).toMatchObject({ type: 'ordinary', user_id: user.id });

      const joinResponse = await fetchWithCookies(
        `${siteUrl}/pl/course_instance/1/join/${enrollmentCode}`,
      );
      assert.equal(joinResponse.status, 200);
      assert.include(joinResponse.url, '/pl/course_instance/1/assessments');

      const enrollment = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(enrollment).toMatchObject({
        pending_lti13_course_instance_id: null,
        pending_lti13_sub: null,
        pending_uin: null,
        status: 'joined',
        user_id: user.id,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: enrollment.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          action_detail: 'implicit_joined',
          context: expect.objectContaining({ admission_source: 'ordinary' }),
        }),
      );
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      assert.notProperty(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );
    });

    test('does not grant LTI roster authority through another course-instance link', async () => {
      await execute(
        `UPDATE course_instances
         SET
           self_enrollment_enabled = FALSE,
           self_enrollment_use_enrollment_code = TRUE
         WHERE id = '1'`,
      );
      const otherCourseInstanceId = await queryScalar(
        `INSERT INTO course_instances (
           course_id,
           display_timezone,
           enrollment_code,
           long_name,
           publishing_end_date,
           publishing_start_date,
           short_name
         )
         SELECT
           course_id,
           display_timezone,
           'OTHER-LTI-LINK',
           'Other LTI link',
           publishing_end_date,
           publishing_start_date,
           'Other LTI link'
         FROM course_instances
         WHERE id = '1'
         RETURNING id`,
        {},
        IdSchema,
      );
      const otherContextId = `${LTI_CONTEXT_ID}-other`;
      await linkLtiContext({
        lti13InstanceId: '1',
        deploymentId: LTI_DEPLOYMENT_ID,
        contextId: otherContextId,
        courseInstanceId: otherCourseInstanceId,
      });
      const otherLti13CourseInstance = await selectLinkedLtiCourseInstance(otherContextId);
      const sub = 'same-sub-other-link';
      const uin = 'same-sub-other-link-matching-uin';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: otherLti13CourseInstance.id,
        pendingUin: uin,
        sub,
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Same Sub Other Link',
          email: 'same-sub-other-link@example.com',
          uin,
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

      const res = await executor.login();
      assert.equal(res.status, 403);
      assert.include(res.url, '/pl/course_instance/1/assessments');

      const persistedInvitation = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(persistedInvitation).toMatchObject({
        pending_lti13_course_instance_id: otherLti13CourseInstance.id,
        pending_lti13_sub: sub,
        status: 'invited',
        user_id: null,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: invitation.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      const user = await selectOptionalUserByUid('same-sub-other-link@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);
      const sessionData = await selectLatestSessionData(user.id);
      expect(
        CourseInstanceAdmissionContinuationSchema.parse(
          sessionData.course_instance_admission_continuation,
        ),
      ).toMatchObject({
        course_instance_id: '1',
        type: 'ordinary',
        user_id: user.id,
      });
    });

    test('consumes the launch before an exact admission limit redirect', async () => {
      await execute(
        `UPDATE course_instances
         SET
           enrollment_limit = 0,
           self_enrollment_enabled = FALSE,
           self_enrollment_use_enrollment_code = TRUE
         WHERE id = '1'`,
      );
      const lti13CourseInstance = await selectLinkedLtiCourseInstance();
      const sub = 'limited-exact-roster-sub';
      const invitation = await insertLtiRosterInvitation({
        lti13CourseInstanceId: lti13CourseInstance.id,
        pendingUin: 'limited-exact-roster-unmatched-uin',
        sub,
      });
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Limited Exact Roster',
          email: 'limited-exact-roster@example.com',
          uin: 'limited-exact-roster-user-uin',
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

      const res = await executor.login();
      assert.equal(res.status, 200);
      assert.include(res.url, '/pl/enroll/limit_exceeded');

      const persistedInvitation = await queryRow(
        'SELECT * FROM enrollments WHERE id = $enrollment_id',
        { enrollment_id: invitation.id },
        EnrollmentSchema,
      );
      expect(persistedInvitation).toMatchObject({
        pending_lti13_course_instance_id: lti13CourseInstance.id,
        pending_lti13_sub: sub,
        status: 'invited',
        user_id: null,
      });
      const auditEvents = await selectAuditEventsByEnrollmentId({
        enrollment_id: invitation.id,
        table_names: ['enrollments'],
      });
      expect(auditEvents).not.toContainEqual(
        expect.objectContaining({ action_detail: 'roster_admitted' }),
      );
      const user = await selectOptionalUserByUid('limited-exact-roster@example.com');
      assert.ok(user);
      await assertLtiLaunchConsumed(user.id);
      assert.notProperty(
        await selectLatestSessionData(user.id),
        'course_instance_admission_continuation',
      );
      const consumedLaunchRes = await fetchWithCookies(targetLinkUri, { redirect: 'manual' });
      assert.equal(consumedLaunchRes.status, 403);
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
});
