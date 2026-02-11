/**
 * Tests for LTI 1.3 authentication flows: login, UID/UIN handling, token exchange.
 */
import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import nodeJose from 'node-jose';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import { execute, queryOptionalRow } from '@prairielearn/postgres';

import { getAccessToken } from '../ee/lib/lti13.js';
import { config } from '../lib/config.js';
import { Lti13UserSchema } from '../lib/db-types.js';
import { selectOptionalUserByUid } from '../models/user.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import {
  CLIENT_ID,
  createLti13Instance,
  makeLoginExecutor,
  withServer,
} from './lti13TestHelpers.js';

const USER_SUB = 'a555090c-8355-4b58-b315-247612cc22f0';
const USER_WITHOUT_UID_SUB = '03745213-6fe3-4c29-a7c3-d31013202f95';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3 authentication', () => {
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

  beforeAll(async () => {
    config.isEnterprise = true;
    config.features.lti13 = true;
    await helperServer.before()();

    await execute("UPDATE institutions SET uid_regexp = '@example\\.com$'");

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
      siteUrl,
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
    const data: any = await fetch(url).then((res) => res.json());
    assert.isObject(data);
    assert.equal(data.title, 'PrairieLearn');
    assert.equal(data.oidc_initiation_url, `${siteUrl}/pl/lti13_instance/1/auth/login`);
    assert.equal(data.target_link_uri, `${siteUrl}/pl/lti13_instance/1/auth/callback`);
    assert.equal(data.public_jwk_url, `${siteUrl}/pl/lti13_instance/1/jwks`);
    assert.isObject(data.custom_fields);
    assert.equal(data.custom_fields.uin, '$Canvas.user.sisIntegrationId');
  });

  test.sequential('perform login', async () => {
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

    // Logging in again should fail because of nonce reuse.
    await withoutLogging(async () => {
      const repeatLoginRes = await executor.login();
      assert.equal(repeatLoginRes.status, 500);
    });
  });

  test.sequential('validate login', async () => {
    const user = await selectOptionalUserByUid('test-user@example.com');
    assert.ok(user);
    assert.equal(user.uid, 'test-user@example.com');
    assert.equal(user.name, 'Test User');
    assert.equal(user.uin, '123456789');
    assert.equal(user.institution_id, '1');

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

    // Malformed login - missing login_hint
    await withoutLogging(async () => {
      const startBadLoginResponse = await fetchWithCookies(
        `${siteUrl}/pl/lti13_instance/1/auth/login`,
        {
          method: 'POST',
          body: new URLSearchParams({
            iss: siteUrl,
            target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
          }),
          redirect: 'manual',
        },
      );
      assert.equal(startBadLoginResponse.status, 500);
    });

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

    // Missing state parameter should error
    await withoutLogging(async () => {
      const finishBadLoginResponse = await fetchWithCookies(redirectUri, {
        method: 'POST',
        body: new URLSearchParams({
          nonce,
          id_token: 'junkjunkjunk',
        }),
        redirect: 'manual',
      });
      assert.equal(finishBadLoginResponse.status, 500);
    });
  });

  test.sequential('request access token', async () => {
    const ACCESS_TOKEN = '33679293-edd6-4415-af36-03113feb8447';

    const app = express();
    app.use(express.urlencoded({ extended: true }));

    app.post('/token', (req, res) => {
      assert.equal(req.body.grant_type, 'client_credentials');
      assert.equal(req.body.client_id, CLIENT_ID);
      assert.equal(
        req.body.client_assertion_type,
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      );

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
    // Shared cookie jar for tests that need session continuity (login flow spanning multiple tests)
    const sharedFetchWithCookies = fetchCookie(fetch);

    test.sequential('create second LTI 1.3 instance', async () => {
      await createLti13Instance({
        siteUrl,
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
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
        fetchWithCookies: sharedFetchWithCookies,
        oidcProviderPort,
        keystore,
        loginUrl: `${siteUrl}/pl/lti13_instance/2/auth/login`,
        callbackUrl,
        targetLinkUri: `${siteUrl}/pl/lti13_instance/2/course_navigation`,
      });

      const res = await executor.login();
      assert.equal(res.status, 200);
      assert.equal(res.url, `${siteUrl}/pl/lti13_instance/2/auth/auth_required`);

      const user = await selectOptionalUserByUid('test-user-2@example.com');
      assert.isNull(user);
    });

    test.sequential('authenticate with dev mode login', async () => {
      const res = await fetchCheerio(`${siteUrl}/pl/login`);
      assert.equal(res.status, 200);

      const loginRes = await sharedFetchWithCookies(`${siteUrl}/pl/login`, {
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
      assert.equal(loginRes.url, `${siteUrl}/pl/lti13_instance/2/course_navigation`);

      const user = await selectOptionalUserByUid('test-user-2@example.com');
      assert.ok(user);
      assert.equal(user.uid, 'test-user-2@example.com');
      assert.equal(user.name, 'Test User 2');
      assert.equal(user.uin, '987654321');
      assert.equal(user.institution_id, '1');
      assert.equal(user.email, 'test-user-2@example.com');

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
      assert.equal(res.url, targetLinkUri);
    });
  });

  describe('LTI 1.3 instance that does not provide UINs', () => {
    test.sequential('create LTI 1.3 instance with UID but no UIN attribute', async () => {
      await createLti13Instance({
        siteUrl,
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
          uid_attribute: 'email',
          uin_attribute: '',
          email_attribute: 'email',
          name_attribute: 'name',
        },
      });
    });

    test.sequential(
      'should update UID when user is found by LTI sub but has different UID',
      async () => {
        const initialUid = 'old-uid-no-uin@example.com';
        const newUid = 'new-uid-no-uin@example.com';
        const testSub = 'uid-update-test-sub-no-uin-67890';
        const testUin = '1234512345';

        // Fresh cookie jar for initial login
        const fetchWithCookies = fetchCookie(fetch);

        const targetLinkUri = `${siteUrl}/pl/lti13_instance/3/course_navigation`;
        const initialExecutor = await makeLoginExecutor({
          user: {
            name: 'Test User No UIN',
            email: initialUid,
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

        const initialUser = await selectOptionalUserByUid(initialUid);
        assert.ok(initialUser);
        assert.equal(initialUser.uid, initialUid);

        await execute('UPDATE users SET uin = $uin WHERE id = $user_id', {
          user_id: initialUser.id,
          uin: testUin,
        });

        const executor = await makeLoginExecutor({
          user: {
            name: 'UID Update Test User No UIN',
            email: newUid,
            uin: null,
            sub: testSub,
          },
          fetchWithCookies: fetchCookie(fetch),
          oidcProviderPort,
          keystore,
          loginUrl: `${siteUrl}/pl/lti13_instance/3/auth/login`,
          callbackUrl: `${siteUrl}/pl/lti13_instance/3/auth/callback`,
          targetLinkUri,
        });

        const loginResult = await executor.login();
        assert.equal(loginResult.status, 200);
        assert.equal(loginResult.url, targetLinkUri);

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
    const fetchWithCookies = fetchCookie(fetch);

    test.sequential('create fourth LTI 1.3 instance without UID or UIN attributes', async () => {
      await createLti13Instance({
        siteUrl,
        issuer_params: {
          issuer: `http://localhost:${oidcProviderPort}`,
          authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
          jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
          token_endpoint: `http://localhost:${oidcProviderPort}/token`,
        },
        attributes: {
          uid_attribute: '',
          uin_attribute: '',
          email_attribute: 'email',
          name_attribute: 'name',
        },
      });
    });

    test.sequential('login should fail with misconfiguration error', async () => {
      const targetLinkUri = `${siteUrl}/pl/lti13_instance/4/course_navigation`;

      await withoutLogging(async () => {
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
  });
});
