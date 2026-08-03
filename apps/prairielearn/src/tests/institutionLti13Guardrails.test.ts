import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';

import { selectLti13Instance } from '../ee/models/lti13Instance.js';
import { config } from '../lib/config.js';
import { LTI13_ROSTER_SYNC_CONFIRMATION_FIELDS } from '../lib/institution-identity.js';

import { type CheerioResponse, fetchCheerio, getCSRFToken } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { configureInstitutionSamlForLtiUin } from './lti13TestHelpers.js';

const siteUrl = 'http://localhost:' + config.serverPort;

async function expectBadRequest(
  url: string,
  body: Record<string, string> | URLSearchParams,
): Promise<void> {
  await withoutLogging(async () => {
    const response = await fetchCheerio(url, {
      method: 'POST',
      body: body instanceof URLSearchParams ? body : new URLSearchParams(body),
    });
    assert.equal(response.status, 400);
  });
}

function getSamlSaveBody(page: CheerioResponse): URLSearchParams {
  const form = page.$('button[value=save]').closest('form');
  const body = new URLSearchParams({ __action: 'save' });

  for (const name of [
    '__csrf_token',
    'sso_login_url',
    'issuer',
    'certificate',
    'uid_attribute',
    'uin_attribute',
    'name_attribute',
    'given_name_attribute',
    'family_name_attribute',
    'email_attribute',
  ]) {
    const input = form.find(`[name=${name}]`);
    if (input.is('[disabled]')) continue;
    const value = input.val();
    assert.isString(value);
    body.set(name, value as string);
  }

  for (const name of [
    'validate_audience',
    'want_assertions_signed',
    'want_authn_response_signed',
  ]) {
    if (form.find(`[name=${name}]`).is(':checked')) body.set(name, '1');
  }

  return body;
}

function getPlatformBody(page: CheerioResponse, clientId: string): URLSearchParams {
  const form = page.$('input[name=__action][value=update_platform]').closest('form');
  return new URLSearchParams({
    __csrf_token: getCSRFToken(form),
    __action: 'update_platform',
    platform: form.find('[name=platform]').val() as string,
    issuer_params: form.find('[name=issuer_params]').val() as string,
    client_id: clientId,
    custom_fields: form.find('[name=custom_fields]').val() as string,
  });
}

describe('institution LTI 1.3 roster syncing guardrails', { concurrent: false }, () => {
  let instanceId: string;
  let instanceUrl: string;

  beforeAll(async () => {
    config.isEnterprise = true;
    await helperServer.before()();
  });

  afterAll(async () => {
    await helperServer.after();
    config.isEnterprise = false;
    config.hasOauth = false;
  });

  test('LTI configuration remains editable until roster syncing is allowed', async () => {
    const page = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/lti13`);
    const button = page.$('button:contains(Add a new LTI 1.3 instance)');
    const response = await fetchCheerio(page.url, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: getCSRFToken(button.closest('form')),
        __action: button.attr('value')!,
      }),
    });
    assert.equal(response.status, 200);

    instanceUrl = response.url;
    instanceId = instanceUrl.split('/').at(-1)!;
    let instance = await selectLti13Instance(instanceId);
    assert.equal(
      instance.uin_attribute,
      '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
    );
    assert.isFalse(instance.roster_sync_allowed);

    const instancePage = await fetchCheerio(instanceUrl);
    const plForm = instancePage.$('button:contains(Save PrairieLearn config)').closest('form');
    assert.isFalse(plForm.find('input[name=uin_attribute]').is('[disabled]'));

    const uinAttribute = '["https://purl.imsglobal.org/spec/lti/claim/custom"]["sis_user_id"]';
    const plResponse = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: getCSRFToken(plForm),
        __action: 'save_pl_config',
        name_attribute: 'name',
        uid_attribute: 'email',
        uin_attribute: uinAttribute,
        email_attribute: 'email',
      }),
    });
    assert.equal(plResponse.status, 200);

    const platformResponse = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: getPlatformBody(plResponse, 'before-allowing'),
    });
    assert.equal(platformResponse.status, 200);

    instance = await selectLti13Instance(instanceId);
    assert.equal(instance.uin_attribute, uinAttribute);
    assert.equal(instance.client_params.client_id, 'before-allowing');
  });

  test('allowing roster syncing requires prerequisites and both confirmations', async () => {
    let page = await fetchCheerio(instanceUrl);
    const csrfToken = getCSRFToken(
      page.$('button:contains(Save PrairieLearn config)').closest('form'),
    );
    const confirmedBody = {
      __csrf_token: csrfToken,
      __action: 'allow_roster_sync',
      [LTI13_ROSTER_SYNC_CONFIRMATION_FIELDS.sameCanonicalUin]: '1',
      [LTI13_ROSTER_SYNC_CONFIRMATION_FIELDS.usersBackfilled]: '1',
    };

    await expectBadRequest(instanceUrl, confirmedBody);
    await configureInstitutionSamlForLtiUin();

    page = await fetchCheerio(instanceUrl);
    const allowForm = page.$('button:contains(Allow roster syncing)').closest('form');
    assert.lengthOf(allowForm.find('input[type=checkbox][required]'), 2);

    await expectBadRequest(instanceUrl, {
      __csrf_token: getCSRFToken(allowForm),
      __action: 'allow_roster_sync',
    });

    const response = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        ...confirmedBody,
        __csrf_token: getCSRFToken(allowForm),
      }),
    });
    assert.equal(response.status, 200);
    assert.isTrue((await selectLti13Instance(instanceId)).roster_sync_allowed);
  });

  test('identity-critical settings are locked while roster syncing is allowed', async () => {
    const instancePage = await fetchCheerio(instanceUrl);
    const platformForm = instancePage
      .$('input[name=__action][value=update_platform]')
      .closest('form');
    const plForm = instancePage.$('button:contains(Save PrairieLearn config)').closest('form');
    assert.isTrue(platformForm.find('button[type=submit]').is('[disabled]'));
    assert.isTrue(plForm.find('input[name=uin_attribute]').is('[disabled]'));

    const uinAttribute = plForm.find('input[name=uin_attribute]').val();
    assert.isString(uinAttribute);
    const safePlResponse = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: getCSRFToken(plForm),
        __action: 'save_pl_config',
        name_attribute: 'name',
        uid_attribute: 'email',
        email_attribute: 'updated-email',
      }),
    });
    assert.equal(safePlResponse.status, 200);
    assert.equal((await selectLti13Instance(instanceId)).uin_attribute, uinAttribute);

    await expectBadRequest(instanceUrl, getPlatformBody(instancePage, 'while-allowed'));
    await expectBadRequest(instanceUrl, {
      __csrf_token: getCSRFToken(plForm),
      __action: 'save_pl_config',
      name_attribute: 'name',
      uid_attribute: 'email',
      uin_attribute: 'different-uin',
      email_attribute: 'email',
    });

    const samlPage = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/saml`);
    assert.isTrue(samlPage.$('input[name=issuer]').is('[disabled]'));
    assert.isTrue(samlPage.$('input[name=uin_attribute]').is('[disabled]'));
    assert.lengthOf(
      samlPage.$(
        `#saml-lti-roster-sync-dependencies a[href$="/lti13/${instanceId}"]:contains("#${instanceId}")`,
      ),
      1,
    );

    const safeSamlChange = getSamlSaveBody(samlPage);
    safeSamlChange.set('certificate', 'replacement certificate');
    assert.equal(
      (await fetchCheerio(samlPage.url, { method: 'POST', body: safeSamlChange })).status,
      200,
    );

    const changedIssuer = getSamlSaveBody(await fetchCheerio(samlPage.url));
    changedIssuer.set('issuer', 'https://replacement.example.com/saml');
    await expectBadRequest(samlPage.url, changedIssuer);

    const deleteForm = samlPage.$('button[value=delete]').closest('form');
    await expectBadRequest(samlPage.url, {
      __csrf_token: getCSRFToken(deleteForm),
      __action: 'delete',
    });

    config.hasOauth = true;
    const ssoPage = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`);
    const ssoForm = ssoPage.$('button:contains(Save)').closest('form');
    const samlProviderId = ssoForm
      .find('label:contains(SAML)')
      .closest('div')
      .find('input[type=checkbox]')
      .attr('value');
    const googleProviderId = ssoForm
      .find('label:contains(Google)')
      .closest('div')
      .find('input[type=checkbox]')
      .attr('value');
    assert.ok(samlProviderId);
    assert.ok(googleProviderId);
    assert.isTrue(ssoForm.find(`input[value=${googleProviderId}]`).is('[disabled]'));

    const ssoBody = new URLSearchParams({
      __csrf_token: getCSRFToken(ssoForm),
      default_authn_provider_id: '',
    });
    ssoBody.append('enabled_authn_provider_ids', samlProviderId);
    ssoBody.append('enabled_authn_provider_ids', googleProviderId);
    await expectBadRequest(ssoPage.url, ssoBody);
  });

  test('disallowing roster syncing unlocks configuration', async () => {
    const page = await fetchCheerio(instanceUrl);
    const disallowForm = page.$('button:contains(Disallow roster syncing)').closest('form');
    const response = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: getCSRFToken(disallowForm),
        __action: 'disallow_roster_sync',
      }),
    });
    assert.equal(response.status, 200);
    assert.isFalse((await selectLti13Instance(instanceId)).roster_sync_allowed);

    const unlockedPage = await fetchCheerio(instanceUrl);
    assert.isFalse(
      unlockedPage
        .$('input[name=__action][value=update_platform]')
        .closest('form')
        .find('button[type=submit]')
        .is('[disabled]'),
    );
    assert.isFalse(
      unlockedPage
        .$('button:contains(Save PrairieLearn config)')
        .closest('form')
        .find('input[name=uin_attribute]')
        .is('[disabled]'),
    );
    assert.equal(
      (
        await fetchCheerio(instanceUrl, {
          method: 'POST',
          body: getPlatformBody(unlockedPage, 'after-disallowing'),
        })
      ).status,
      200,
    );
  });
});
