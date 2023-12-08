import { step } from 'mocha-steps';
import { assert } from 'chai';
import fetchCookie = require('fetch-cookie');
import getPort = require('get-port');
import nodeJose = require('node-jose');
import jose = require('jose');

import { config } from '../lib/config';
import * as helperServer from './helperServer';
import { fetchCheerio } from './helperClient';

const CLIENT_ID = 'prairielearn_test_lms';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3', () => {
  before(async () => {
    config.isEnterprise = true;
    config.features.lti13 = true;
    await helperServer.before()();
  });

  after(async () => {
    helperServer.after();
    config.isEnterprise = false;
    config.features = {};
  });

  let oidcProviderPort: number;

  before(async () => {
    // Generate keys for the OIDC provider.
    const keystore = nodeJose.JWK.createKeyStore();
    const key = await keystore.generate('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: 'test',
    });
    console.log('KEY', key.toJSON(true));

    oidcProviderPort = await getPort();
  });

  after(async () => {});

  step('create an LTI instance', async () => {
    // Load the LTI admin page.
    const ltiInstancesResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/lti13`);
    assert.equal(ltiInstancesResponse.status, 200);

    const newInstanceButton = ltiInstancesResponse.$('button:contains(Add a new LTI 1.3 instance)');
    const newInstanceForm = newInstanceButton.closest('form');

    // Create a new LTI instance.
    const createInstanceResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/lti13`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: newInstanceForm.find('input[name=__csrf_token]').val() as string,
        __action: newInstanceButton.attr('value') as string,
      }),
    });
    assert.equal(createInstanceResponse.status, 200);

    // Let's see how far we can get without customizing anything in the instance...
  });

  step('configure an LTI instance', async () => {
    const ltiInstanceResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/lti13/1`);
    assert.equal(ltiInstanceResponse.status, 200);

    const savePlatformOptionsButton = ltiInstanceResponse.$(
      'button:contains(Save platform options)',
    );
    const platformOptionsForm = savePlatformOptionsButton.closest('form');

    // Update the platform options.
    const updatePlatformOptionsResponse = await fetchCheerio(
      `${siteUrl}/pl/institution/1/admin/lti13/1`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: platformOptionsForm.find('input[name=__csrf_token]').val() as string,
          __action: platformOptionsForm.find('input[name=__action]').val() as string,
          platform: 'Unknown',
          issuer_params: JSON.stringify({
            issuer: `http://localhost:${oidcProviderPort}`,
            authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
            jwks_uri: 'TODO START SERVER TO RESPOND WITH KEYSTORE',
          }),
          custom_fields: '{}',
          client_id: CLIENT_ID,
        }),
      },
    );
    assert.equal(updatePlatformOptionsResponse.status, 200);

    const addKeyButton = updatePlatformOptionsResponse.$('button:contains(Add key to keystore)');
    const keystoreForm = addKeyButton.closest('form');

    // Create a key
    const createKeyResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/lti13/1`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: keystoreForm.find('input[name=__csrf_token]').val() as string,
        __action: addKeyButton.attr('value') as string,
      }),
    });
    assert.equal(createKeyResponse.status, 200);
  });

  step('enable LTI 1.3 as an authentication provider', async () => {
    const ssoResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/sso`);
    assert.equal(ssoResponse.status, 200);

    const saveButton = ssoResponse.$('button:contains(Save)');
    const form = saveButton.closest('form');
    const lti13Label = form.find('label:contains(LTI 1.3)');
    const lti13Input = lti13Label.closest('div').find('input');

    const enableLtiResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/sso`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: form.find('input[name=__csrf_token]').val() as string,
        __action: saveButton.attr('value') as string,
        enabled_authn_provider_ids: lti13Input.attr('value') as string,
      }),
    });
    assert.equal(enableLtiResponse.status, 200);
  });

  step('perform login', async () => {
    // `openid-client` relies on the session to store state, so we need to use
    // a cookie-aware version of fetch.
    const fetchWithCookies = fetchCookie(fetchCheerio);

    const startLoginResponse = await fetchWithCookies(`${siteUrl}/pl/lti13_instance/1/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({
        iss: 'issuer',
        login_hint: 'custom_login_hint',
        target_link_uri: 'custom_target_link_uri',
      }),
      redirect: 'manual',
    });
    assert.equal(startLoginResponse.status, 302);

    const redirectUrl = new URL(startLoginResponse.headers.get('location') as string);
    assert.equal(redirectUrl.hostname, 'localhost');
    assert.equal(redirectUrl.pathname, '/auth');
    assert.equal(redirectUrl.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(redirectUrl.searchParams.get('scope'), 'openid');
    assert.equal(redirectUrl.searchParams.get('response_type'), 'id_token');
    assert.equal(redirectUrl.searchParams.get('response_mode'), 'form_post');
    assert.equal(
      redirectUrl.searchParams.get('redirect_uri'),
      `${siteUrl}/pl/lti13_instance/1/auth/callback`,
    );
    assert.ok(redirectUrl.searchParams.get('nonce'));
    assert.ok(redirectUrl.searchParams.get('state'));

    const redirectUri = redirectUrl.searchParams.get('redirect_uri') as string;
    const nonce = redirectUrl.searchParams.get('nonce') as string;
    const state = redirectUrl.searchParams.get('state') as string;

    const keystore = nodeJose.JWK.createKeyStore();
    const key = await keystore.generate('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: 'test',
    });

    // Should probably use RS256 here? I don't entirely know what I'm doing.
    const joseKey = await jose.importJWK(key.toJSON(true) as any);
    const fakeIdToken = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`http://localhost:${oidcProviderPort}`)
      .setIssuedAt()
      .setExpirationTime('1h')
      // TODO: probably need better values here
      .setSubject('a555090c-8355-4b58-b315-247612cc22f0')
      .setAudience(CLIENT_ID)
      .sign(joseKey);

    const finishLoginResponse = await fetchWithCookies(redirectUri, {
      method: 'POST',
      body: new URLSearchParams({
        nonce,
        state,
        id_token: fakeIdToken,
      }),
    });
    console.log(await finishLoginResponse.text());
    assert.equal(finishLoginResponse.status, 200);
  });
});
