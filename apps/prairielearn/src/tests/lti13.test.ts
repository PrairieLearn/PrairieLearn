import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import * as jose from 'jose';
import nodeJose from 'node-jose';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, queryOptionalRow } from '@prairielearn/postgres';

import { getAccessToken } from '../ee/lib/lti13.js';
import { config } from '../lib/config.js';
import { Lti13CourseInstanceSchema, Lti13UserSchema } from '../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { selectOptionalUserByUid } from '../models/user.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const CLIENT_ID = 'prairielearn_test_lms';
const USER_SUB = 'a555090c-8355-4b58-b315-247612cc22f0';
const USER_WITHOUT_UID_SUB = '03745213-6fe3-4c29-a7c3-d31013202f95';

// Constants from JWT claims - must match what's in makeLoginExecutor
const LTI_DEPLOYMENT_ID = '7fdce954-4c33-47c9-97b4-e435dbbed9bb';
const LTI_CONTEXT_ID = 'f6bc7a50-448c-4469-94f7-54d6ea882c2a';

const siteUrl = 'http://localhost:' + config.serverPort;

async function withServer<T>(app: express.Express, port: number, fn: () => Promise<T>) {
  const server = app.listen(port);

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    return await fn();
  } finally {
    server.close();
  }
}

async function makeLoginExecutor({
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
  const joseKey = await jose.importJWK(key.toJSON(true) as any);
  const fakeIdToken = await new jose.SignJWT({
    nonce,
    // The below values are based on data observed by Dave during an actual
    // login with Canvas.
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
      '7fdce954-4c33-47c9-97b4-e435dbbed9bb',
    // This MUST match the value in the login request.
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': targetLinkUri,
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
      id: 'f6bc7a50-448c-4469-94f7-54d6ea882c2a',
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
      id: 'f6bc7a50-448c-4469-94f7-54d6ea882c2a',
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
  app.get('/jwks', (req, res) => {
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

async function createLti13Instance({
  issuer_params,
  attributes,
}: {
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

  // Create a new LTI instance.
  const createInstanceResponse = await fetchCheerio(ltiInstancesResponse.url, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: newInstanceForm.find('input[name=__csrf_token]').val() as string,
      __action: newInstanceButtonValue,
    }),
  });
  assert.equal(createInstanceResponse.status, 200);
  const instanceUrl = createInstanceResponse.url;

  const ltiInstanceResponse = await fetchCheerio(instanceUrl);
  assert.equal(ltiInstanceResponse.status, 200);

  const savePlatformOptionsButton = ltiInstanceResponse.$('button:contains(Save platform options)');
  const platformOptionsForm = savePlatformOptionsButton.closest('form');

  // Update the platform options.
  const updatePlatformOptionsResponse = await fetchCheerio(instanceUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: platformOptionsForm.find('input[name=__csrf_token]').val() as string,
      __action: platformOptionsForm.find('input[name=__action]').val() as string,
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

    // Update the instance's attribute settings.
    const updateRes = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'save_pl_config',
        __csrf_token: prairieLearnOptionsForm.find('input[name=__csrf_token]').val() as string,
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

  // Create a key
  const createKeyResponse = await fetchCheerio(instanceUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __csrf_token: keystoreForm.find('input[name=__csrf_token]').val() as string,
      __action: addKeyButtonValue,
    }),
  });
  assert.equal(createKeyResponse.status, 200);
}

/**
 * Helper to create an lti13_course_instances record (simulates a linked course).
 */
async function linkLtiContext({
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

async function grantCoursePermissions({
  uid,
  courseId,
  courseRole,
  courseInstanceId,
  courseInstanceRole,
  authnUserId,
}: {
  uid: string;
  courseId: string;
  courseRole: 'Owner' | 'Editor' | 'Viewer' | 'None';
  courseInstanceId?: string;
  courseInstanceRole?: 'Student Data Viewer' | 'Student Data Editor';
  authnUserId: string;
}) {
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
      user_id: user.user_id,
      course_instance_role: courseInstanceRole,
      authn_user_id: authnUserId,
    });
  }
}

describe('LTI 1.3', () => {
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

  beforeAll(async () => {
    config.isEnterprise = true;
    config.features.lti13 = true;
    await helperServer.before()();

    // We need to give the default institution a `uid_regexp`.
    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$'");

    // Allocate an available port for the OIDC provider.
    oidcProviderPort = await getPort();

    keystore = nodeJose.JWK.createKeyStore();
    await keystore.generate('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: 'test',
    });
  });

  afterAll(async () => {
    await helperServer.after();
    config.isEnterprise = false;
    config.features = {};
  });

  test.sequential('create and configure an LTI instance', async () => {
    await createLti13Instance({
      issuer_params: {
        issuer: `http://localhost:${oidcProviderPort}`,
        authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
        jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
        token_endpoint: `http://localhost:${oidcProviderPort}/token`,
      },
    });
  });

  test.sequential('enable LTI 1.3 as an authentication provider', async () => {
    const ssoResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`);
    assert.equal(ssoResponse.status, 200);

    const saveButton = ssoResponse.$('button:contains(Save)');

    const form = saveButton.closest('form');
    const lti13Label = form.find('label:contains(LTI 1.3)');
    const lti13Input = lti13Label.closest('div').find('input');
    const lti13InputValue = lti13Input.attr('value');
    assert.ok(lti13InputValue);

    const enableLtiResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: form.find('input[name=__csrf_token]').val() as string,
        enabled_authn_provider_ids: lti13InputValue,
        default_authn_provider_id: '',
      }),
    });
    assert.equal(enableLtiResponse.status, 200);
  });

  test.sequential('validate metadata', async () => {
    const url = `${siteUrl}/pl/lti13_instance/1/config`;
    const data = await fetch(url).then((res) => res.json() as any);

    assert.equal(data.title, 'PrairieLearn');
    assert.equal(data.oidc_initiation_url, `${siteUrl}/pl/lti13_instance/1/auth/login`);
    assert.equal(data.target_link_uri, `${siteUrl}/pl/lti13_instance/1/auth/callback`);
    assert.equal(data.public_jwk_url, `${siteUrl}/pl/lti13_instance/1/jwks`);
    assert.isObject(data.custom_fields);
    assert.equal(data.custom_fields.uin, '$Canvas.user.sisIntegrationId');
  });

  test.sequential('perform login', async () => {
    // `openid-client` relies on the session to store state, so we need to use
    // a cookie-aware version of fetch.
    const fetchWithCookies = fetchCookie(fetch);

    const executor = await makeLoginExecutor({
      user: {
        name: 'Test User',
        email: 'test-user@example.com',
        uin: '123456789',
        sub: USER_SUB,
      },
      fetchWithCookies,
      oidcProviderPort,
      keystore,
      loginUrl: `${siteUrl}/pl/lti13_instance/1/auth/login`,
      callbackUrl: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      targetLinkUri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
    });

    const res = await executor.login();
    assert.equal(res.status, 200);

    // Inspect more into this response for output that is for Instructors vs for Students
    // Setup link to a course instance (database modification)
    // Confirm the redirect passes through to the course

    // Logging in again should fail because of nonce reuse.
    const repeatLoginRes = await executor.login();
    assert.equal(repeatLoginRes.status, 500);
  });

  test.sequential('validate login', async () => {
    // There should be a new user.
    const user = await selectOptionalUserByUid('test-user@example.com');
    assert.ok(user);
    assert.equal(user.uid, 'test-user@example.com');
    assert.equal(user.name, 'Test User');
    assert.equal(user.uin, '123456789');
    assert.equal(user.institution_id, '1');

    // The new user should have an entry in `lti13_users`.
    const ltiUser = await queryOptionalRow(
      'SELECT * FROM lti13_users WHERE user_id = $user_id',
      { user_id: user.id },
      Lti13UserSchema,
    );
    assert.ok(ltiUser);
    assert.equal(ltiUser.sub, USER_SUB);
    assert.equal(ltiUser.lti13_instance_id, '1');
  });

  test.sequential('malformed requests fail', async () => {
    const fetchWithCookies = fetchCookie(fetchCheerio);

    // Malformed login
    const startBadLoginResponse = await fetchWithCookies(
      `${siteUrl}/pl/lti13_instance/1/auth/login`,
      {
        method: 'POST',
        body: new URLSearchParams({
          iss: siteUrl,
          // Missing required login_hint
          //login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
          target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
        }),
        redirect: 'manual',
      },
    );
    assert.equal(startBadLoginResponse.status, 500);

    // Successful login to test malformed response
    const startLoginResponse = await fetchWithCookies(`${siteUrl}/pl/lti13_instance/1/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({
        iss: siteUrl,
        login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
        target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
      }),
      redirect: 'manual',
    });
    assert.equal(startLoginResponse.status, 302);

    const location = startLoginResponse.headers.get('location');
    assert.ok(location);

    const redirectUrl = new URL(location);

    assert.ok(redirectUrl.searchParams.get('state'));

    const redirectUri = redirectUrl.searchParams.get('redirect_uri');
    const nonce = redirectUrl.searchParams.get('nonce');

    assert.ok(redirectUri);
    assert.ok(nonce);

    // Not a real token, not running a JWKS server, so not a full test
    // Just making sure if state is missing that PL errors
    const finishBadLoginResponse = await fetchWithCookies(redirectUri, {
      method: 'POST',
      body: new URLSearchParams({
        nonce,
        // Missing state parameter
        //state,
        id_token: 'junkjunkjunk',
      }),
      redirect: 'manual',
    });

    assert.equal(finishBadLoginResponse.status, 500);
  });

  test.sequential('request access token', async () => {
    const ACCESS_TOKEN = '33679293-edd6-4415-af36-03113feb8447';

    // Run a server to respond to token requests.
    const app = express();
    app.use(express.urlencoded({ extended: true }));

    app.post('/token', (req, res) => {
      assert.equal(req.body.grant_type, 'client_credentials');
      assert.equal(req.body.client_id, CLIENT_ID);
      assert.equal(
        req.body.client_assertion_type,
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      );

      // Decodes but does not validate
      const jwt = JSON.parse(
        Buffer.from(req.body.client_assertion.split('.')[1], 'base64').toString(),
      );
      assert.equal(jwt.iss, CLIENT_ID);
      assert.property(jwt, 'jti');

      res.send(
        JSON.stringify({
          access_token: ACCESS_TOKEN,
          token_type: 'bearer',
          expires_in: 3600,
          scope: req.body.scope,
        }),
      );
    });

    await withServer(app, oidcProviderPort, async () => {
      const result = await getAccessToken('1');
      assert.equal(result, ACCESS_TOKEN);
    });
  });

  describe('LTI 1.3 instance that does not provide UIDs', () => {
    // We need to share this across all tests here, as we need to maintain the same session.
    const fetchWithCookies = fetchCookie(fetch);

    test.sequential('create second LTI 1.3 instance', async () => {
      await createLti13Instance({
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
          // Intentionally left blank - no UIDs provided.
          uid_attribute: '',
          uin_attribute: '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
          email_attribute: 'email',
          name_attribute: 'name',
        },
      });
    });

    test.sequential('perform LTI 1.3 login without prior auth', async () => {
      const callbackUrl = `${siteUrl}/pl/lti13_instance/2/auth/callback`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Test User 2',
          email: 'test-user-2@example.com',
          uin: '987654321',
          sub: USER_WITHOUT_UID_SUB,
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/2/auth/login`,
        callbackUrl,
        targetLinkUri: `${siteUrl}/pl/lti13_instance/2/course_navigation`,
      });

      const res = await executor.login();
      assert.equal(res.status, 200);

      // Assert that they've landed on the page prompting them to auth another way.
      assert.equal(res.url, `${siteUrl}/pl/lti13_instance/2/auth/auth_required`);

      // The user should not exist until they log in via SAML.
      const user = await selectOptionalUserByUid('test-user-2@example.com');
      assert.isNull(user);
    });

    test.sequential('authenticate with dev mode login', async () => {
      const res = await fetchCheerio(`${siteUrl}/pl/login`);
      assert.equal(res.status, 200);

      const loginRes = await fetchWithCookies(`${siteUrl}/pl/login`, {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: res.$('input[name=__csrf_token]').val() as string,
          __action: 'dev_login',
          uid: 'test-user-2@example.com',
          name: 'Test User 2',
          email: 'test-user-2@example.com',
          uin: '987654321',
        }),
      });
      assert.equal(loginRes.status, 200);

      // The user should have been redirected to the course navigation page,
      // which is what was originally specified in `target_link_uri`.
      assert.equal(loginRes.url, `${siteUrl}/pl/lti13_instance/2/course_navigation`);

      // The user should now exist.
      const user = await selectOptionalUserByUid('test-user-2@example.com');
      assert.ok(user);
      assert.equal(user.uid, 'test-user-2@example.com');
      assert.equal(user.name, 'Test User 2');
      assert.equal(user.uin, '987654321');
      assert.equal(user.institution_id, '1');
      assert.equal(user.email, 'test-user-2@example.com');

      // The new user should have an entry in `lti13_users`.
      const ltiUser = await queryOptionalRow(
        'SELECT * FROM lti13_users WHERE user_id = $user_id',
        { user_id: user.id },
        Lti13UserSchema,
      );
      assert.ok(ltiUser);
      assert.equal(ltiUser.sub, USER_WITHOUT_UID_SUB);
      assert.equal(ltiUser.lti13_instance_id, '2');
    });

    test.sequential('perform LTI 1.3 login after prior auth', async () => {
      // We use a new set of cookies to simulate a new session.
      const fetchWithCookies = fetchCookie(fetch);

      const targetLinkUri = `${siteUrl}/pl/lti13_instance/2/course_navigation`;
      const executor = await makeLoginExecutor({
        user: {
          name: 'Test User 2',
          email: 'test-user-2@example.com',
          uin: '987654321',
          sub: USER_WITHOUT_UID_SUB,
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/2/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/2/auth/callback`,
        targetLinkUri,
      });

      const res = await executor.login();
      assert.equal(res.status, 200);

      // Assert that they've been redirected to the course navigation page.
      // This means that the login succeeded.
      assert.equal(res.url, targetLinkUri);
    });
  });

  describe('LTI 1.3 instance that does not provide UINs', () => {
    // We need to share this across all tests here, as we need to maintain the same session.
    const fetchWithCookies = fetchCookie(fetch);

    test.sequential('create LTI 1.3 instance with UID but no UIN attribute', async () => {
      await createLti13Instance({
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
          uid_attribute: 'email',
          // Intentionally left blank - no UINs provided
          uin_attribute: '',
          email_attribute: 'email',
          name_attribute: 'name',
        },
      });
    });

    test.sequential(
      'should update UID when user is found by LTI sub but has different UID',
      async () => {
        // Create a user with an initial UID using LTI 1.3 login.
        const initialUid = 'old-uid-no-uin@example.com';
        const newUid = 'new-uid-no-uin@example.com';
        const testSub = 'uid-update-test-sub-no-uin-67890';
        const testUin = '1234512345';

        // Perform initial LTI login to create the user.
        const targetLinkUri = `${siteUrl}/pl/lti13_instance/3/course_navigation`;
        const initialExecutor = await makeLoginExecutor({
          user: {
            name: 'Test User No UIN',
            email: initialUid, // Initial UID
            uin: null,
            sub: testSub,
          },
          fetchWithCookies,
          oidcProviderPort,
          keystore,
          loginUrl: `${siteUrl}/pl/lti13_instance/3/auth/login`,
          callbackUrl: `${siteUrl}/pl/lti13_instance/3/auth/callback`,
          targetLinkUri,
        });

        const initialLoginResult = await initialExecutor.login();
        assert.equal(initialLoginResult.status, 200);
        assert.equal(initialLoginResult.url, targetLinkUri);

        // Verify user was created with initial UID.
        const initialUser = await selectOptionalUserByUid(initialUid);
        assert.ok(initialUser);
        assert.equal(initialUser.uid, initialUid);

        // Add a UIN to the user. This doesn't matter for the login process, but
        // we'll use this later to validate that it's persisted after UID update.
        await execute('UPDATE users SET uin = $uin WHERE id = $user_id', {
          user_id: initialUser.id,
          uin: testUin,
        });

        // Now perform LTI login with the same sub but a different UID (email).
        const secondTargetLinkUri = `${siteUrl}/pl/lti13_instance/3/course_navigation`;
        const executor = await makeLoginExecutor({
          user: {
            name: 'UID Update Test User No UIN',
            email: newUid,
            uin: null,
            sub: testSub,
          },
          // Use fresh cookies for new session.
          fetchWithCookies: fetchCookie(fetch),
          oidcProviderPort,
          keystore,
          loginUrl: `${siteUrl}/pl/lti13_instance/3/auth/login`,
          callbackUrl: `${siteUrl}/pl/lti13_instance/3/auth/callback`,
          targetLinkUri: secondTargetLinkUri,
        });

        const loginResult = await executor.login();
        assert.equal(loginResult.status, 200);
        assert.equal(loginResult.url, secondTargetLinkUri);

        // Verify that the user was updated successfully.
        const updatedUser = await selectOptionalUserByUid(newUid);
        const oldUser = await selectOptionalUserByUid(initialUid);

        assert.ok(updatedUser);
        assert.equal(updatedUser.id, initialUser.id);
        assert.equal(updatedUser.uid, newUid);
        assert.equal(updatedUser.uin, testUin);
        assert.isNull(oldUser);
      },
    );
  });

  describe('LTI 1.3 instance without UID or UIN attributes (misconfiguration)', () => {
    // We need to share this across all tests here, as we need to maintain the same session.
    const fetchWithCookies = fetchCookie(fetch);

    test.sequential('create fourth LTI 1.3 instance without UID or UIN attributes', async () => {
      await createLti13Instance({
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
          // Intentionally leave both UID and UIN attributes blank to test misconfiguration error
          uid_attribute: '',
          uin_attribute: '',
          email_attribute: 'email',
          name_attribute: 'name',
        },
      });
    });

    test.sequential('login should fail with misconfiguration error', async () => {
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/4/course_navigation`;

      const executor = await makeLoginExecutor({
        user: {
          name: 'Test User',
          email: 'test-user@example.com',
          uin: '123456789',
          sub: USER_SUB,
        },
        fetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/4/auth/login`,
        callbackUrl: `${siteUrl}/pl/lti13_instance/4/auth/callback`,
        targetLinkUri,
      });

      const res = await executor.login();
      assert.equal(res.status, 500);

      // The error response should contain our misconfiguration error message
      const responseText = await res.text();
      assert.include(
        responseText,
        'LTI 1.3 instance must have at least one of uid_attribute or uin_attribute configured',
      );
    });
  });

  describe('LTI 1.3 course instance linking', () => {
    test.sequential('linkLtiContext helper creates link record', async () => {
      // Ensure clean state.
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

      // Clean up so subsequent tests can test the unlinked state.
      await execute(
        `DELETE FROM lti13_course_instances
         WHERE lti13_instance_id = '1'
         AND deployment_id = $deployment_id
         AND context_id = $context_id`,
        { deployment_id: LTI_DEPLOYMENT_ID, context_id: LTI_CONTEXT_ID },
      );
    });

    test.sequential('instructor sees linking UI for unlinked context', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

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
      assert.include(pageText, 'Link');
    });

    test.sequential('student sees "not ready" page for unlinked context', async () => {
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
      assert.include(pageText, "isn't ready yet");
    });

    test.sequential('instructor can link course instance via POST', async () => {
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
        authnUserId: user.user_id,
      });

      const linkingPageRes = await fetchWithCookies(targetLinkUri);
      assert.equal(linkingPageRes.status, 200);

      const linkingPageText = await linkingPageRes.text();
      const csrfMatch = linkingPageText.match(/name="__csrf_token"\s+value="([^"]+)"/);
      assert.ok(csrfMatch, 'Could not find CSRF token');
      const csrfToken = csrfMatch[1];

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
      assert.include(location, 'done');

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
    });

    test.sequential('already linked context redirects instructor to course instance', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions before login so the redirect succeeds.
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

    test.sequential('already linked context redirects student to course instance', async () => {
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
  });

  describe('LTI 1.3 instructor admin page', () => {
    test.sequential('GET admin page shows linked instance', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions before login so the redirect succeeds.
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
      assert.include(pageText, 'LTI');
    });

    test.sequential('GET admin page redirects when no ID provided', async () => {
      const fetchWithCookies = fetchCookie(fetch);
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/1/course_navigation`;

      // Grant permissions before login so the redirect succeeds.
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
});
