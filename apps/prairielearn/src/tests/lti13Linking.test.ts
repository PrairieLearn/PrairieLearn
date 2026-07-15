/**
 * Tests for LTI 1.3 course instance linking and admin page.
 */
import * as cheerio from 'cheerio';
import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import nodeJose from 'node-jose';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { Lti13CombinedInstanceSchema, inspectRoster } from '../ee/lib/lti13.js';
import { config } from '../lib/config.js';
import { Lti13CourseInstanceSchema } from '../lib/db-types.js';
import { createServerJob, selectJobsByJobSequenceId } from '../lib/server-jobs.js';
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

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3 course instance linking', { concurrent: false }, () => {
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

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
    test('inspectRoster appends rlid, dumps members, and annotates sub/custom/lis matches', async () => {
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

      // Create a user with a known sub and UIN to exercise both match paths.
      const knownSub = 'roster-inspector-sub-1';
      const knownUin = '555000555';
      await grantCoursePermissions({
        uid: 'roster-inspector@example.com',
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
      assert.include(customOutput, 'Matched by sub');
      assert.include(
        customOutput,
        `Matched by UIN ${knownUin} to PrairieLearn user roster-inspector@example.com`,
      );
      assert.include(customOutput, 'No PrairieLearn user matched');

      // With no rlid (no custom claims), the lis-configured instance still resolves
      // the UIN from the lis sourcedid that NRPS flattens onto the member.
      const lisJobs = await selectJobsByJobSequenceId(lisJob.jobSequenceId);
      assert.lengthOf(lisJobs, 1);
      const lisOutput = lisJobs[0].output ?? '';
      assert.include(
        lisOutput,
        `Matched by UIN ${knownUin} to PrairieLearn user roster-inspector@example.com`,
      );
    });
  });
});
