import { assert } from 'chai';
import fetchCookie from 'fetch-cookie';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';

import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { fetchCheerio, getCSRFToken } from '../../tests/helperClient.js';
import * as helperServer from '../../tests/helperServer.js';

import { enableEnterpriseEdition } from './ee-helpers.js';

const CLIENT_ID = '123456789';

const siteUrl = 'http://localhost:' + config.serverPort;

describe('LTI 1.3 auth', () => {
  enableEnterpriseEdition();

  before('set up testing server', helperServer.before());
  before('enable lti13', () => features.enable('lti13'));

  after('disable lti13', () => features.disable('lti13'));
  after('shut down testing server', helperServer.after);

  step('set up LTI 1.3 instance', async () => {
    // Fetch the page without any instances.
    const url = `${siteUrl}/pl/administrator/institution/1/lti13`;
    const res = await fetchCheerio(url);
    assert.equal(res.status, 200);

    // Create an instance.
    const csrfToken = getCSRFToken(res.$);
    const createRes = await fetchCheerio(url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'add_instance',
        __csrf_token: csrfToken,
      }),
    });
    assert.equal(createRes.status, 200);

    const instanceUrl = createRes.url;

    // Update platform configuration.
    const platformRes = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_platform',
        __csrf_token: getCSRFToken(createRes.$),
        platform: 'Canvas Production',
        client_id: CLIENT_ID,
        issuer_params: JSON.stringify({
          issuer: 'https://canvas.instructure.com',
          jwks_uri: 'https://sso.canvaslms.com/api/lti/security/jwks',
          token_endpoint: 'https://sso.canvaslms.com/login/oauth2/token',
          authorization_endpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
        }),
        custom_fields: JSON.stringify({
          uin: '$Canvas.user.sisIntegrationId',
        }),
      }),
    });
    assert.equal(platformRes.status, 200);

    // Add a key to the keystore.
    const keyRes = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'add_key',
        __csrf_token: getCSRFToken(platformRes.$),
      }),
    });
    assert.equal(keyRes.status, 200);

    // Update the instance's attribute settings.
    const updateRes = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'save_pl_config',
        __csrf_token: getCSRFToken(keyRes.$),
        uid_attribute: 'email',
        uin_attribute: '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
        name_attribute: 'name',
        email_attribute: 'email',
      }),
    });
    assert.equal(updateRes.status, 200);
  });

  step('check metadata', async () => {
    const url = `${siteUrl}/pl/lti13_instance/1/config`;
    const data = await fetch(url).then((res) => res.json() as any);

    console.log(data);
    assert.equal(data.title, 'PrairieLearn');
    assert.equal(data.oidc_initiation_url, `${siteUrl}/pl/lti13_instance/1/auth/login`);
    assert.equal(data.target_link_uri, `${siteUrl}/pl/lti13_instance/1/auth/callback`);
    assert.equal(data.public_jwk_url, `${siteUrl}/pl/lti13_instance/1/jwks`);
    assert.isObject(data.custom_fields);
    assert.equal(data.custom_fields.uin, '$Canvas.user.sisIntegrationId');
  });

  step('enable LTI 1.3 auth for institution', async () => {
    const url = `${siteUrl}/pl/administrator/institution/1/sso`;
    const res = await fetchCheerio(url);
    assert.equal(res.status, 200);

    const updateRes = await fetchCheerio(url, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: getCSRFToken(res.$),
        // The provider ID is hardcoded in a migration.
        enabled_authn_provider_ids: '6',
      }),
    });
    assert.equal(updateRes.status, 200);
  });

  step('simulate login via LTI', async () => {
    const url = `${siteUrl}/pl/lti13_instance/1/auth/login`;
    const res = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        iss: 'https://canvas.instructure.com',
        client_id: CLIENT_ID,
        login_hint: 'student@example.edu',
        target_link_uri: `${siteUrl}/pl/lti13_instance/1/auth/callback`,
      }),
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.isTrue(location?.startsWith('https://sso.canvaslms.com/api/lti/authorize_redirect'));
  });

  step('simulate callback from LTI', async () => {
    const url = `${siteUrl}/pl/lti13_instance/1/auth/callback`;
    const res = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        state: '...',
        id_token: '...',
      }),
    });
    console.log(res.status);
    console.log(res.headers);
    console.log(await res.text());
  });
});
