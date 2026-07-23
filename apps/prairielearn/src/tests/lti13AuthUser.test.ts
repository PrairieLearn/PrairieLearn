import { afterAll, assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import {
  authenticatePendingLti13User,
  createPendingLti13Auth,
  matchLti13LaunchUser,
} from '../ee/auth/lti13/lti13AuthUser.js';
import { insertLti13User, selectOptionalLti13UserForUser } from '../ee/models/lti13-user.js';
import { type LoadUserAuth } from '../lib/authn.types.js';
import { config } from '../lib/config.js';
import { type Lti13Instance, Lti13InstanceSchema, type User } from '../lib/db-types.js';
import { selectAuditEventsByInstitutionId } from '../models/audit-event.js';
import { selectOptionalUserByUid, selectUserByUid } from '../models/user.js';

import * as helperDb from './helperDb.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

async function createFixture() {
  await execute(sql.configure_default_institution);
  return await queryRow(sql.insert_lti13_instance, Lti13InstanceSchema);
}

function authnParams(uid: string, uin: string | null, name = uid, email = uid): LoadUserAuth {
  return { uid, uin, name, email, provider: 'dev' };
}

function pendingLti13Auth(lti13_instance_id: string, sub: string, uin: string | null) {
  return createPendingLti13Auth({
    lti13_instance_id,
    sub,
    uin,
    launchExpiresAtSeconds: Date.now() / 1000 + 60,
  });
}

async function insertBinding(instance: Lti13Instance, user: User, sub: string) {
  return await insertLti13User({ user_id: user.id, lti13_instance_id: instance.id, sub });
}

async function selectBinding(instance: Lti13Instance, user: User) {
  return await selectOptionalLti13UserForUser({
    user_id: user.id,
    lti13_instance_id: instance.id,
  });
}

describe('LTI 1.3 authentication identity transactions', { concurrent: false }, () => {
  beforeAll(async () => {
    config.isEnterprise = true;
    await helperDb.before();
  });
  beforeEach(helperDb.resetDatabase);
  afterAll(async () => {
    await helperDb.after();
    config.isEnterprise = false;
  });

  test('atomically creates a new user and binding from a configured UIN and valid email', async () => {
    const instance = await createFixture();

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'new-sub',
      uin: 'new-uin',
      name: 'New User',
      email: 'new-user@example.com',
    });

    assert.deepEqual(result, { type: 'authenticate', userId: '1' });
    const user = await selectOptionalUserByUid('new-user@example.com');
    assert.ok(user);
    assert.equal(user.uin, 'new-uin');
    const binding = await selectBinding(instance, user);
    assert.equal(binding?.sub, 'new-sub');

    const auditEvents = await selectAuditEventsByInstitutionId({
      institution_id: '1',
      table_names: ['users'],
    });
    assert.lengthOf(auditEvents, 1);
    assert.equal(auditEvents[0].action, 'insert');
    assert.equal(auditEvents[0].subject_user_id, user.id);
  });

  test('falls back without mutating when the launch email is not an institution-valid UID', async () => {
    const instance = await createFixture();

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'invalid-email-sub',
      uin: 'invalid-email-uin',
      name: 'Invalid Email',
      email: 'invalid-email@outside.edu',
    });

    assert.deepEqual(result, { type: 'secondary_auth', reason: 'unmatched' });
    assert.isNull(await selectOptionalUserByUid('invalid-email@outside.edu'));
  });

  test('requires secondary auth before claiming an existing UID-only user', async () => {
    const instance = await createFixture();
    const existingUser = await getOrCreateUser({
      uid: 'invited-staff@example.com',
      uin: null,
      name: null,
      institutionId: '1',
    });

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'invited-staff-sub',
      uin: 'launch-uin',
      name: 'Untrusted LTI Name',
      email: existingUser.uid,
    });

    assert.deepEqual(result, { type: 'secondary_auth', reason: 'uid_match_requires_auth' });
    const unchangedUser = await selectUserByUid(existingUser.uid);
    assert.isNull(unchangedUser.uin);
    assert.isNull(unchangedUser.name);
    assert.isNull(await selectBinding(instance, existingUser));
  });

  test('adds a binding for an existing UIN identity without changing its profile', async () => {
    const instance = await createFixture();
    const user = await getOrCreateUser({
      uid: 'existing@example.com',
      uin: 'existing-uin',
      name: 'Authoritative Existing Name',
      email: 'existing@example.com',
      institutionId: '1',
    });

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'existing-user-sub',
      uin: user.uin,
      name: 'Untrusted LTI Name',
      email: 'untrusted-lti-email@example.com',
    });

    assert.deepEqual(result, { type: 'authenticate', userId: user.id });
    const unchangedUser = await selectOptionalUserByUid(user.uid);
    assert.equal(unchangedUser?.name, 'Authoritative Existing Name');
    assert.equal(unchangedUser?.email, user.uid);
    const binding = await selectBinding(instance, user);
    assert.equal(binding?.sub, 'existing-user-sub');
  });

  test('an existing sub match does not evaluate weaker UID policy', async () => {
    const instance = await createFixture();
    const user = await getOrCreateUser({
      uid: 'existing-sub@example.com',
      uin: 'existing-sub-uin',
      name: 'Existing Sub',
      email: 'existing-sub@example.com',
      institutionId: '1',
    });
    await insertBinding(instance, user, 'existing-sub');
    await execute(sql.configure_invalid_uid_regexp);

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'existing-sub',
      uin: user.uin,
      name: 'Ignored Name',
      email: 'candidate@example.com',
    });

    assert.deepEqual(result, { type: 'authenticate', userId: user.id });
  });

  test('secondary auth replaces a binding and audits it in the same transaction', async () => {
    const instance = await createFixture();
    const user = await getOrCreateUser({
      uid: 'replacement@example.com',
      uin: 'replacement-uin',
      name: 'Old Name',
      email: 'replacement@example.com',
      institutionId: '1',
    });
    const oldBinding = await insertBinding(instance, user, 'old-sub');

    const userId = await authenticatePendingLti13User({
      authnParams: authnParams(
        user.uid,
        user.uin,
        'Authoritative Name',
        'authoritative@example.com',
      ),
      pendingLti13Auth: pendingLti13Auth(instance.id, 'new-sub', user.uin),
    });

    assert.equal(userId, user.id);
    const updatedUser = await selectOptionalUserByUid(user.uid);
    assert.equal(updatedUser?.name, 'Authoritative Name');
    assert.equal(updatedUser?.email, 'authoritative@example.com');
    const updatedBinding = await selectBinding(instance, user);
    assert.equal(updatedBinding?.sub, 'new-sub');

    const auditEvents = await selectAuditEventsByInstitutionId({
      institution_id: '1',
      table_names: ['lti13_users'],
    });
    assert.lengthOf(auditEvents, 1);
    assert.equal(auditEvents[0].action, 'update');
    assert.equal(auditEvents[0].action_detail, 'sub');
    assert.deepEqual(auditEvents[0].old_row, oldBinding);
    assert.deepEqual(auditEvents[0].new_row, updatedBinding);
  });

  test('rolls back authoritative profile changes when the launch sub belongs to another user', async () => {
    const instance = await createFixture();
    const currentSubOwner = await getOrCreateUser({
      uid: 'owner@example.com',
      uin: 'owner-uin',
      name: 'Current Owner',
      email: 'owner@example.com',
      institutionId: '1',
    });
    const authUser = await getOrCreateUser({
      uid: 'auth-user@example.com',
      uin: 'auth-user-uin',
      name: 'Original Auth Name',
      email: 'auth-user@example.com',
      institutionId: '1',
    });
    await insertBinding(instance, currentSubOwner, 'claimed-sub');
    await insertBinding(instance, authUser, 'auth-old-sub');

    await withoutLogging(async () => {
      await expect(
        authenticatePendingLti13User({
          authnParams: authnParams(
            authUser.uid,
            authUser.uin,
            'Must Roll Back',
            'changed@example.com',
          ),
          pendingLti13Auth: pendingLti13Auth(instance.id, 'claimed-sub', authUser.uin),
        }),
      ).rejects.toThrow(/already linked to another user/);
    });

    const unchangedUser = await selectOptionalUserByUid(authUser.uid);
    assert.equal(unchangedUser?.name, 'Original Auth Name');
    assert.equal(unchangedUser?.email, authUser.uid);
    const unchangedBinding = await selectBinding(instance, authUser);
    assert.equal(unchangedBinding?.sub, 'auth-old-sub');
    const auditEvents = await selectAuditEventsByInstitutionId({
      institution_id: '1',
      table_names: ['lti13_users'],
    });
    assert.lengthOf(auditEvents, 0);
  });

  test('does not create or update a user when the LTI and secondary-auth UINs differ', async () => {
    const instance = await createFixture();

    await withoutLogging(async () => {
      await expect(
        authenticatePendingLti13User({
          authnParams: authnParams('mismatch@example.com', 'auth-uin', 'Mismatch'),
          pendingLti13Auth: pendingLti13Auth(instance.id, 'mismatch-sub', 'launch-uin'),
        }),
      ).rejects.toThrow(/identities do not match/);
    });

    assert.isNull(await selectOptionalUserByUid('mismatch@example.com'));
  });

  test('fails closed after repeated secondary-auth uniqueness conflicts', async () => {
    const instance = await createFixture();
    const authUser = await getOrCreateUser({
      uid: 'canonical@example.com',
      uin: 'canonical-uin',
      name: 'Canonical User',
      email: 'canonical@example.com',
      institutionId: '1',
    });
    const uidOwner = await getOrCreateUser({
      uid: 'already-owned@example.com',
      uin: 'other-uin',
      name: 'UID Owner',
      email: 'already-owned@example.com',
      institutionId: '1',
    });

    await withoutLogging(async () => {
      await expect(
        authenticatePendingLti13User({
          authnParams: authnParams(uidOwner.uid, authUser.uin, 'Must Not Commit'),
          pendingLti13Auth: pendingLti13Auth(
            instance.id,
            'secondary-unique-conflict-sub',
            authUser.uin,
          ),
        }),
      ).rejects.toThrow(/Unable to safely link/);
    });

    const unchangedAuthUser = await selectOptionalUserByUid(authUser.uid);
    assert.equal(unchangedAuthUser?.name, 'Canonical User');
    assert.equal(unchangedAuthUser?.email, authUser.uid);
    assert.isNull(await selectBinding(instance, authUser));
  });
});
