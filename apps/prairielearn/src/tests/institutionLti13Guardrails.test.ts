import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import getLti13RosterSyncReadiness from '../admin_queries/lti13_roster_sync_readiness.js';
import { selectLti13Instance } from '../ee/models/lti13Instance.js';
import { config } from '../lib/config.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { type CheerioResponse, fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import {
  configureInstitutionSamlForLtiUin,
  withLti13UinConfirmations,
} from './lti13TestHelpers.js';

const sql = loadSqlEquiv(import.meta.url);
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

function getSamlSaveBody(page: CheerioResponse, uinAttribute: string): URLSearchParams {
  const form = page.$('button[value=save]').closest('form');
  const body = new URLSearchParams({ __action: 'save', uin_attribute: uinAttribute });

  for (const name of [
    '__csrf_token',
    'sso_login_url',
    'issuer',
    'certificate',
    'uid_attribute',
    'name_attribute',
    'given_name_attribute',
    'family_name_attribute',
    'email_attribute',
  ]) {
    const value = form.find(`[name=${name}]`).val();
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

describe('institution LTI 1.3 UIN guardrails', { concurrent: false }, () => {
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

  test('new LTI instances do not configure a UIN by default', async () => {
    const page = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/lti13`);
    const button = page.$('button:contains(Add a new LTI 1.3 instance)');
    const form = button.closest('form');

    const response = await fetchCheerio(page.url, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: form.find('input[name=__csrf_token]').val() as string,
        __action: button.attr('value')!,
      }),
    });
    assert.equal(response.status, 200);

    instanceUrl = response.url;
    instanceId = instanceUrl.split('/').at(-1)!;
    const instance = await selectLti13Instance(instanceId);
    assert.isNull(instance.uin_attribute);
  });

  test('configuring an LTI UIN requires all explicit confirmations', async () => {
    const page = await fetchCheerio(instanceUrl);
    const form = page.$('button:contains(Save PrairieLearn config)').closest('form');
    assert.isTrue(form.find('input[name=uin_attribute]').is('[disabled]'));
    assert.lengthOf(form.find('[data-lti13-uin-confirmations]'), 0);

    const baseBody = {
      __action: 'save_pl_config',
      __csrf_token: form.find('input[name=__csrf_token]').val() as string,
      name_attribute: 'name',
      uid_attribute: 'email',
      uin_attribute: '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
      email_attribute: 'email',
    };
    const confirmedBody = withLti13UinConfirmations(baseBody);

    await expectBadRequest(instanceUrl, confirmedBody);

    await configureInstitutionSamlForLtiUin();

    const availablePage = await fetchCheerio(instanceUrl);
    const availableForm = availablePage
      .$('button:contains(Save PrairieLearn config)')
      .closest('form');
    assert.isFalse(availableForm.find('input[name=uin_attribute]').is('[disabled]'));
    assert.lengthOf(availableForm.find('[data-lti13-uin-confirmations]'), 1);
    assert.equal(
      availableForm.find('label:contains("UID attribute")').attr('for'),
      'uid_attribute',
    );
    assert.equal(
      availableForm.find('label:contains("UIN attribute")').attr('for'),
      'uin_attribute',
    );

    await expectBadRequest(instanceUrl, baseBody);

    const response = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams(confirmedBody),
    });
    assert.equal(response.status, 200);
    assert.equal((await selectLti13Instance(instanceId)).uin_attribute, baseBody.uin_attribute);
  });

  test('SSO, SAML, and LTI platform changes cannot bypass the guardrail', async () => {
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

    const ssoBody = new URLSearchParams({
      __csrf_token: ssoForm.find('input[name=__csrf_token]').val() as string,
      default_authn_provider_id: '',
    });
    ssoBody.append('enabled_authn_provider_ids', samlProviderId);
    ssoBody.append('enabled_authn_provider_ids', googleProviderId);

    await expectBadRequest(ssoPage.url, ssoBody);

    const unnamedProviderId = await queryScalar(sql.insert_unnamed_authn_provider, IdSchema);
    ssoBody.set('enabled_authn_provider_ids', samlProviderId);
    ssoBody.append('enabled_authn_provider_ids', unnamedProviderId);

    await expectBadRequest(ssoPage.url, ssoBody);
    config.hasOauth = false;

    let samlPage = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/saml`);
    assert.lengthOf(
      samlPage.$(
        `#saml-lti-uin-dependencies a[href$="/lti13/${instanceId}"]:contains("#${instanceId}")`,
      ),
      1,
    );

    let response = await fetchCheerio(samlPage.url, {
      method: 'POST',
      body: getSamlSaveBody(samlPage, 'uin'),
    });
    assert.equal(response.status, 200);

    samlPage = await fetchCheerio(samlPage.url);
    const issuerChangeBody = getSamlSaveBody(samlPage, 'uin');
    issuerChangeBody.set('issuer', 'https://replacement.example.com/saml');
    await expectBadRequest(samlPage.url, issuerChangeBody);
    response = await fetchCheerio(samlPage.url, {
      method: 'POST',
      body: new URLSearchParams(withLti13UinConfirmations(Object.fromEntries(issuerChangeBody))),
    });
    assert.equal(response.status, 200);

    await execute(sql.clear_saml_uin_attribute, { institution_id: '1' });
    samlPage = await fetchCheerio(samlPage.url);
    assert.equal(samlPage.$('input[name=uin_attribute]').val(), '');
    const unavailablePlatformPage = await fetchCheerio(instanceUrl);
    const unavailablePlatformForm = unavailablePlatformPage
      .$('input[name=__action][value=update_platform]')
      .closest('form');
    assert.isTrue(
      unavailablePlatformForm.find('button:contains("Save platform options")').is('[disabled]'),
    );

    response = await fetchCheerio(samlPage.url, {
      method: 'POST',
      body: getSamlSaveBody(samlPage, ''),
    });
    assert.equal(response.status, 200);

    samlPage = await fetchCheerio(samlPage.url);
    await expectBadRequest(samlPage.url, getSamlSaveBody(samlPage, 'uin'));

    response = await fetchCheerio(samlPage.url, {
      method: 'POST',
      body: new URLSearchParams(
        withLti13UinConfirmations(Object.fromEntries(getSamlSaveBody(samlPage, 'uin'))),
      ),
    });
    assert.equal(response.status, 200);

    samlPage = await fetchCheerio(samlPage.url);
    const deleteForm = samlPage.$('button[value=delete]').closest('form');
    await expectBadRequest(samlPage.url, {
      __csrf_token: deleteForm.find('input[name=__csrf_token]').val() as string,
      __action: 'delete',
    });

    await expectBadRequest(
      samlPage.url,
      new URLSearchParams(
        withLti13UinConfirmations(Object.fromEntries(getSamlSaveBody(samlPage, ''))),
      ),
    );

    let platformPage = await fetchCheerio(instanceUrl);
    let platformForm = platformPage.$('button:contains(Save platform options)').closest('form');
    const getPlatformBody = () => ({
      __csrf_token: platformForm.find('input[name=__csrf_token]').val() as string,
      __action: 'update_platform',
      platform: platformForm.find('[name=platform]').val() as string,
      issuer_params: platformForm.find('[name=issuer_params]').val() as string,
      client_id: platformForm.find('[name=client_id]').val() as string,
      custom_fields: platformForm.find('[name=custom_fields]').val() as string,
    });

    response = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams(getPlatformBody()),
    });
    assert.equal(response.status, 200);

    platformPage = await fetchCheerio(instanceUrl);
    platformForm = platformPage.$('button:contains(Save platform options)').closest('form');
    const changedPlatformBody = {
      ...getPlatformBody(),
      client_id: 'guardrail-test',
    };
    await expectBadRequest(instanceUrl, changedPlatformBody);
    response = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams(withLti13UinConfirmations(changedPlatformBody)),
    });
    assert.equal(response.status, 200);
    assert.equal(
      (await selectLti13Instance(instanceId)).client_params.client_id,
      changedPlatformBody.client_id,
    );
  });

  test('readiness inventory identifies UIN backfill gaps', async () => {
    await selectOrInsertUserByUid('missing-uin-for-roster-sync@example.com');

    const beforeBackfill = await getLti13RosterSyncReadiness();
    const beforeBackfillRow = beforeBackfill.rows.find(
      (row) => row.lti13_instance_id === instanceId,
    );
    assert.ok(beforeBackfillRow);
    assert.equal(beforeBackfillRow.readiness_status, 'follow-up required');
    assert.include(
      beforeBackfillRow.follow_up_tasks,
      'existing user record(s) need a UIN backfill',
    );

    await execute(sql.backfill_missing_user_uins, { institution_id: '1' });

    const afterBackfill = await getLti13RosterSyncReadiness();
    const afterBackfillRow = afterBackfill.rows.find((row) => row.lti13_instance_id === instanceId);
    assert.ok(afterBackfillRow);
    assert.equal(afterBackfillRow.readiness_status, 'manual review required');
    assert.equal(
      afterBackfillRow.follow_up_tasks,
      [
        'Confirm that the configured SAML and LTI attributes represent the same canonical UIN',
        'Confirm that existing user UIN values are compatible with both providers',
        'Confirm that every in-scope roster member has a usable UIN',
      ].join('\n'),
    );
  });
});
