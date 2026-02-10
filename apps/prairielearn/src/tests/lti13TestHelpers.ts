import express from 'express';
import * as jose from 'jose';
import type nodeJose from 'node-jose';
import { assert } from 'vitest';

import { execute, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';

import { fetchCheerio } from './helperClient.js';

export const CLIENT_ID = 'prairielearn_test_lms';

// LTI claim constants - used in JWT tokens and must match across test files
export const LTI_DEPLOYMENT_ID = '7fdce954-4c33-47c9-97b4-e435dbbed9bb';
export const LTI_CONTEXT_ID = 'f6bc7a50-448c-4469-94f7-54d6ea882c2a';

export async function withServer<T>(app: express.Express, port: number, fn: () => Promise<T>) {
  const server = app.listen(port);

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    return await fn();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

export async function makeLoginExecutor({
  user,
  fetchWithCookies,
  oidcProviderPort,
  keystore,
  loginUrl,
  callbackUrl,
  targetLinkUri,
  isInstructor = true,
}: {
  user: {
    name: string;
    email: string;
    uin: string | null;
    sub: string;
  };
  fetchWithCookies: typeof fetch;
  oidcProviderPort: number;
  keystore: nodeJose.JWK.KeyStore;
  loginUrl: string;
  callbackUrl: string;
  targetLinkUri: string;
  isInstructor?: boolean;
}) {
  const siteUrl = new URL(loginUrl).origin;

  const startLoginResponse = await fetchWithCookies(loginUrl, {
    method: 'POST',
    body: new URLSearchParams({
      iss: siteUrl,
      login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
      target_link_uri: targetLinkUri,
    }),
    redirect: 'manual',
  });
  assert.equal(startLoginResponse.status, 302);
  const location = startLoginResponse.headers.get('location');
  assert.ok(location);

  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.hostname, 'localhost');
  assert.equal(redirectUrl.pathname, '/auth');
  assert.equal(redirectUrl.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(redirectUrl.searchParams.get('scope'), 'openid');
  assert.equal(redirectUrl.searchParams.get('response_type'), 'id_token');
  assert.equal(redirectUrl.searchParams.get('response_mode'), 'form_post');
  assert.equal(redirectUrl.searchParams.get('redirect_uri'), callbackUrl);
  assert.equal(redirectUrl.searchParams.get('login_hint'), 'fef15674-ae78-4763-b915-6fe3dbf42c67');

  const redirectUri = redirectUrl.searchParams.get('redirect_uri');
  const nonce = redirectUrl.searchParams.get('nonce');
  const state = redirectUrl.searchParams.get('state');

  assert.ok(redirectUri);
  assert.ok(nonce);
  assert.ok(state);

  const key = keystore.get('test');
  assert.ok(key, 'Test keystore must contain a key with kid="test"');
  const joseKey = await jose.importJWK(key.toJSON(true) as jose.JWK);
  const fakeIdToken = await new jose.SignJWT({
    nonce,
    // The below values are based on data observed by Dave during an actual
    // login with Canvas.
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': LTI_DEPLOYMENT_ID,
    // This MUST match the value in the login request.
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': targetLinkUri,
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
      id: LTI_CONTEXT_ID,
      title: 'Test Course',
    },
    'https://purl.imsglobal.org/spec/lti/claim/roles': isInstructor
      ? [
          'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
          'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
        ]
      : [
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
          'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
        ],
    'https://purl.imsglobal.org/spec/lti/claim/context': {
      id: LTI_CONTEXT_ID,
      type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'],
      label: 'TEST 101',
      title: 'Test Course',
    },
    name: user.name,
    email: user.email,
    ...(user.uin
      ? {
          'https://purl.imsglobal.org/spec/lti/claim/custom': {
            uin: user.uin,
          },
        }
      : {}),
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      scope: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      ],
      errors: {
        errors: {},
      },
      lineitems: `https://localhost:${oidcProviderPort}/api/lti/courses/1/line_items`,
      validation_context: null,
    },
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`http://localhost:${oidcProviderPort}`)
    .setIssuedAt()
    .setExpirationTime('1h')
    .setSubject(user.sub)
    .setAudience(CLIENT_ID)
    .sign(joseKey);

  // Run a server to respond to JWKS requests.
  const app = express();
  app.get('/jwks', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // Pass `false` to `toJSON` to only include public keys.
    res.end(JSON.stringify(keystore.toJSON(false)));
  });

  return {
    login: async () => {
      return await withServer(app, oidcProviderPort, async () => {
        return await fetchWithCookies(redirectUri, {
          method: 'POST',
          body: new URLSearchParams({
            nonce,
            state,
            id_token: fakeIdToken,
          }),
        });
      });
    },
  };
}

export async function createLti13Instance({
  siteUrl,
  issuer_params,
  attributes,
}: {
  siteUrl: string;
  issuer_params: {
    issuer: string;
    authorization_endpoint: string;
    jwks_uri: string;
    token_endpoint: string;
  };
  attributes?: {
    uid_attribute: string;
    uin_attribute: string;
    email_attribute: string;
    name_attribute: string;
  };
}) {
  // Load the LTI admin page.
  const ltiInstancesResponse = await fetchCheerio(
    `${siteUrl}/pl/administrator/institution/1/lti13`,
  );
  assert.equal(ltiInstancesResponse.status, 200);

  const newInstanceButton = ltiInstancesResponse.$('button:contains(Add a new LTI 1.3 instance)');
  const newInstanceForm = newInstanceButton.closest('form');

  const newInstanceButtonValue = newInstanceButton.attr('value');
  assert.ok(newInstanceButtonValue);

  const newInstanceCsrfToken = newInstanceForm.find('input[name=__csrf_token]').val();
  assert.ok(typeof newInstanceCsrfToken === 'string', 'CSRF token not found in new instance form');

  const createInstanceResponse = await fetchCheerio(ltiInstancesResponse.url, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: newInstanceCsrfToken,
      __action: newInstanceButtonValue,
    }),
  });
  assert.equal(createInstanceResponse.status, 200);
  const instanceUrl = createInstanceResponse.url;

  const ltiInstanceResponse = await fetchCheerio(instanceUrl);
  assert.equal(ltiInstanceResponse.status, 200);

  const savePlatformOptionsButton = ltiInstanceResponse.$('button:contains(Save platform options)');
  const platformOptionsForm = savePlatformOptionsButton.closest('form');

  const platformCsrfToken = platformOptionsForm.find('input[name=__csrf_token]').val();
  const platformAction = platformOptionsForm.find('input[name=__action]').val();
  assert.ok(typeof platformCsrfToken === 'string', 'CSRF token not found in platform options form');
  assert.ok(typeof platformAction === 'string', 'Action not found in platform options form');

  const updatePlatformOptionsResponse = await fetchCheerio(instanceUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: platformCsrfToken,
      __action: platformAction,
      platform: 'Unknown',
      issuer_params: JSON.stringify(issuer_params),
      custom_fields: JSON.stringify({
        uin: '$Canvas.user.sisIntegrationId',
      }),
      client_id: CLIENT_ID,
    }),
  });
  assert.equal(updatePlatformOptionsResponse.status, 200);

  const addKeyButton = updatePlatformOptionsResponse.$('button:contains(Add key to keystore)');
  const keystoreForm = addKeyButton.closest('form');

  // Update the attributes if needed.
  if (attributes) {
    const savePrairieLearnConfigButton = ltiInstanceResponse.$(
      'button:contains(Save PrairieLearn config)',
    );
    const prairieLearnOptionsForm = savePrairieLearnConfigButton.closest('form');

    const plConfigCsrfToken = prairieLearnOptionsForm.find('input[name=__csrf_token]').val();
    assert.ok(
      typeof plConfigCsrfToken === 'string',
      'CSRF token not found in PrairieLearn config form',
    );

    const updateRes = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'save_pl_config',
        __csrf_token: plConfigCsrfToken,
        uid_attribute: attributes.uid_attribute,
        uin_attribute: attributes.uin_attribute,
        email_attribute: attributes.email_attribute,
        name_attribute: attributes.name_attribute,
      }),
    });
    assert.equal(updateRes.status, 200);
  }

  const addKeyButtonValue = addKeyButton.attr('value');
  assert.ok(addKeyButtonValue);

  const keystoreCsrfToken = keystoreForm.find('input[name=__csrf_token]').val();
  assert.ok(typeof keystoreCsrfToken === 'string', 'CSRF token not found in keystore form');

  const createKeyResponse = await fetchCheerio(instanceUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: keystoreCsrfToken,
      __action: addKeyButtonValue,
    }),
  });
  assert.equal(createKeyResponse.status, 200);
}

/**
 * Helper to create an lti13_course_instances record (simulates a linked course).
 */
export async function linkLtiContext({
  lti13InstanceId,
  deploymentId,
  contextId,
  courseInstanceId,
}: {
  lti13InstanceId: string;
  deploymentId: string;
  contextId: string;
  courseInstanceId: string;
}) {
  await execute(
    `INSERT INTO lti13_course_instances
      (lti13_instance_id, deployment_id, context_id, context_label, context_title, course_instance_id)
    VALUES ($lti13_instance_id, $deployment_id, $context_id, 'TEST 101', 'Test Course', $course_instance_id)`,
    {
      lti13_instance_id: lti13InstanceId,
      deployment_id: deploymentId,
      context_id: contextId,
      course_instance_id: courseInstanceId,
    },
  );
}

/**
 * Grants course permissions to a user via insertCoursePermissionsByUserUid
 * (which creates the user if they don't exist).
 *
 * @returns The user object, useful for subsequent permission operations
 */
export async function grantCoursePermissions({
  uid,
  courseId,
  courseRole,
  courseInstanceId,
  courseInstanceRole,
  authnUserId,
}: {
  uid: string;
  courseId: string;
  courseRole: 'Owner' | 'Editor' | 'Viewer' | 'Previewer' | 'None';
  courseInstanceId?: string;
  courseInstanceRole?: 'Student Data Viewer' | 'Student Data Editor';
  authnUserId: string;
}) {
  if ((courseInstanceId && !courseInstanceRole) || (!courseInstanceId && courseInstanceRole)) {
    throw new Error(
      'grantCoursePermissions: courseInstanceId and courseInstanceRole must both be provided or both omitted',
    );
  }

  const user = await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid,
    course_role: courseRole,
    authn_user_id: authnUserId,
  });

  if (courseInstanceId && courseInstanceRole) {
    await insertCourseInstancePermissions({
      course_id: courseId,
      course_instance_id: courseInstanceId,
      user_id: user.id,
      course_instance_role: courseInstanceRole,
      authn_user_id: authnUserId,
    });
  }

  return user;
}

/**
 * Creates a secondary institution with its own course and course instance.
 * Used for testing cross-institution authorization checks.
 */
export async function createCrossInstitutionFixture() {
  const institutionId = await queryRow(
    `INSERT INTO institutions (short_name, long_name, uid_regexp)
     VALUES ('Other', 'Other Institution', '@other\\.edu$')
     RETURNING id`,
    {},
    IdSchema,
  );

  const courseId = await queryRow(
    `INSERT INTO courses (short_name, title, institution_id, path, branch, display_timezone, options)
     VALUES ('OTHER 101', 'Other Course', $institution_id, '/course2', 'main', 'America/Chicago', '{}')
     RETURNING id`,
    { institution_id: institutionId },
    IdSchema,
  );

  const courseInstanceId = await queryRow(
    `INSERT INTO course_instances (course_id, short_name, long_name, display_timezone, enrollment_code)
     VALUES ($course_id, 'Other CI', 'Other Course Instance', 'America/Chicago', 'OTHER101-001')
     RETURNING id`,
    { course_id: courseId },
    IdSchema,
  );

  return { institutionId, courseId, courseInstanceId };
}
