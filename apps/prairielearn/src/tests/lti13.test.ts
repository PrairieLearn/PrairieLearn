import { step } from 'mocha-steps';
import { assert } from 'chai';

import { config } from '../lib/config';
import * as helperServer from './helperServer';
import { fetchCheerio } from './helperClient';

const CLIENT_ID = 'prairielearn_test_lms';
const ISSUER = 'https://lti.example.com';

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

    // Update the client ID.
    const updatePlatformOptionsResponse = await fetchCheerio(
      `${siteUrl}/pl/institution/1/admin/lti13/1`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: platformOptionsForm.find('input[name=__csrf_token]').val() as string,
          __action: platformOptionsForm.find('input[name=__action]').val() as string,
          platform: 'Unknown',
          issuer_params: JSON.stringify({
            issuer: ISSUER,
          }),
          custom_fields: '{}',
          client_id: CLIENT_ID,
        }),
      },
    );
    assert.equal(updatePlatformOptionsResponse.status, 200);

    const addKeyButton = updatePlatformOptionsResponse.$('button:contains(Add key to keystore)');
    const keystoreForm = addKeyButton.closest('form');
    console.log();

    // Create a key
    const createKeyResponse = await fetchCheerio(`${siteUrl}/pl/institution/1/admin/lti13/1`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: keystoreForm.find('input[name=__csrf_token]').val() as string,
        __action: addKeyButton.attr('value') as string,
      }),
    });
    console.log(await createKeyResponse.text());
    console.log(createKeyResponse.status);
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
    const startLoginResponse = await fetchCheerio(`${siteUrl}/pl/lti13_instance/1/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({
        iss: 'issuer',
        login_hint: 'login_hint',
        target_link_uri: 'target_link_uri',
      }),
      redirect: 'manual',
    });
    console.log(await startLoginResponse.text());
    assert.equal(startLoginResponse.status, 302);
  });
});
