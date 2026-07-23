import { type Request, type Response } from 'express';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { loadUser } from '../../../lib/authn.js';
import { config } from '../../../lib/config.js';
import { Lti13InstanceSchema, type User } from '../../../lib/db-types.js';
import { selectAuditEventsByInstitutionId } from '../../../models/audit-event.js';
import { selectOptionalUserByUid } from '../../../models/user.js';
import * as helperDb from '../../../tests/helperDb.js';
import { getOrCreateUser } from '../../../tests/utils/auth.js';
import { insertLti13User, selectOptionalLti13UserForUser } from '../../models/lti13-user.js';

import {
  authenticatePendingLti13User,
  createPendingLti13Auth,
  matchLti13LaunchUser,
} from './lti13AuthUser.js';

const sql = loadSqlEquiv(import.meta.url);

async function createFixture() {
  await execute(sql.configure_default_institution);
  return await queryRow(sql.insert_lti13_instance, Lti13InstanceSchema);
}

async function createUser({
  uid,
  uin,
  name,
}: {
  uid: string;
  uin: string;
  name: string;
}): Promise<User> {
  return await getOrCreateUser({ uid, uin, name, email: uid, institutionId: '1' });
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
    const binding = await selectOptionalLti13UserForUser({
      user_id: user.id,
      lti13_instance_id: instance.id,
    });
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

  test('retries a UID uniqueness conflict once before falling back to secondary auth', async () => {
    const instance = await createFixture();
    const existingUser = await createUser({
      uid: 'uid-conflict@example.com',
      uin: 'existing-uin',
      name: 'Existing User',
    });

    const result = await matchLti13LaunchUser({
      instance,
      sub: 'uid-conflict-sub',
      uin: 'different-launch-uin',
      name: 'Conflicting User',
      email: existingUser.uid,
    });

    assert.deepEqual(result, { type: 'secondary_auth', reason: 'concurrency_conflict' });
    const unchangedUser = await selectOptionalUserByUid(existingUser.uid);
    assert.equal(unchangedUser?.uin, 'existing-uin');
    assert.isNull(
      await selectOptionalLti13UserForUser({
        user_id: existingUser.id,
        lti13_instance_id: instance.id,
      }),
    );
  });

  test('adds a binding for an existing UIN identity without changing its profile', async () => {
    const instance = await createFixture();
    const user = await createUser({
      uid: 'existing@example.com',
      uin: 'existing-uin',
      name: 'Authoritative Existing Name',
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
    const binding = await selectOptionalLti13UserForUser({
      user_id: user.id,
      lti13_instance_id: instance.id,
    });
    assert.equal(binding?.sub, 'existing-user-sub');
  });

  test('secondary auth replaces a binding and audits it in the same transaction', async () => {
    const instance = await createFixture();
    const user = await createUser({
      uid: 'replacement@example.com',
      uin: 'replacement-uin',
      name: 'Old Name',
    });
    const oldBinding = await insertLti13User({
      user_id: user.id,
      lti13_instance_id: instance.id,
      sub: 'old-sub',
    });

    const userId = await authenticatePendingLti13User({
      authnParams: {
        uid: user.uid,
        uin: user.uin,
        name: 'Authoritative Name',
        email: 'authoritative@example.com',
        provider: 'dev',
      },
      pendingLti13Auth: createPendingLti13Auth({
        lti13_instance_id: instance.id,
        sub: 'new-sub',
        uin: user.uin,
        launchExpiresAtSeconds: Date.now() / 1000 + 60,
      }),
    });

    assert.equal(userId, user.id);
    const updatedUser = await selectOptionalUserByUid(user.uid);
    assert.equal(updatedUser?.name, 'Authoritative Name');
    assert.equal(updatedUser?.email, 'authoritative@example.com');
    const updatedBinding = await selectOptionalLti13UserForUser({
      user_id: user.id,
      lti13_instance_id: instance.id,
    });
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
    const currentSubOwner = await createUser({
      uid: 'owner@example.com',
      uin: 'owner-uin',
      name: 'Current Owner',
    });
    const authUser = await createUser({
      uid: 'auth-user@example.com',
      uin: 'auth-user-uin',
      name: 'Original Auth Name',
    });
    await insertLti13User({
      user_id: currentSubOwner.id,
      lti13_instance_id: instance.id,
      sub: 'claimed-sub',
    });
    await insertLti13User({
      user_id: authUser.id,
      lti13_instance_id: instance.id,
      sub: 'auth-old-sub',
    });

    await withoutLogging(async () => {
      await expect(
        authenticatePendingLti13User({
          authnParams: {
            uid: authUser.uid,
            uin: authUser.uin,
            name: 'Must Roll Back',
            email: 'changed@example.com',
            provider: 'dev',
          },
          pendingLti13Auth: createPendingLti13Auth({
            lti13_instance_id: instance.id,
            sub: 'claimed-sub',
            uin: authUser.uin,
            launchExpiresAtSeconds: Date.now() / 1000 + 60,
          }),
        }),
      ).rejects.toThrow(/already linked to another user/);
    });

    const unchangedUser = await selectOptionalUserByUid(authUser.uid);
    assert.equal(unchangedUser?.name, 'Original Auth Name');
    assert.equal(unchangedUser?.email, authUser.uid);
    const unchangedBinding = await selectOptionalLti13UserForUser({
      user_id: authUser.id,
      lti13_instance_id: instance.id,
    });
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
          authnParams: {
            uid: 'mismatch@example.com',
            uin: 'auth-uin',
            name: 'Mismatch',
            email: 'mismatch@example.com',
            provider: 'dev',
          },
          pendingLti13Auth: createPendingLti13Auth({
            lti13_instance_id: instance.id,
            sub: 'mismatch-sub',
            uin: 'launch-uin',
            launchExpiresAtSeconds: Date.now() / 1000 + 60,
          }),
        }),
      ).rejects.toThrow(/identities do not match/);
    });

    assert.isNull(await selectOptionalUserByUid('mismatch@example.com'));
  });

  test('fails closed after repeated secondary-auth uniqueness conflicts', async () => {
    const instance = await createFixture();
    const authUser = await createUser({
      uid: 'canonical@example.com',
      uin: 'canonical-uin',
      name: 'Canonical User',
    });
    const uidOwner = await createUser({
      uid: 'already-owned@example.com',
      uin: 'other-uin',
      name: 'UID Owner',
    });

    await withoutLogging(async () => {
      await expect(
        authenticatePendingLti13User({
          authnParams: {
            uid: uidOwner.uid,
            uin: authUser.uin,
            name: 'Must Not Commit',
            email: uidOwner.uid,
            provider: 'dev',
          },
          pendingLti13Auth: createPendingLti13Auth({
            lti13_instance_id: instance.id,
            sub: 'secondary-unique-conflict-sub',
            uin: authUser.uin,
            launchExpiresAtSeconds: Date.now() / 1000 + 60,
          }),
        }),
      ).rejects.toThrow(/Unable to safely link/);
    });

    const unchangedAuthUser = await selectOptionalUserByUid(authUser.uid);
    assert.equal(unchangedAuthUser?.name, 'Canonical User');
    assert.equal(unchangedAuthUser?.email, authUser.uid);
    assert.isNull(
      await selectOptionalLti13UserForUser({
        user_id: authUser.id,
        lti13_instance_id: instance.id,
      }),
    );
  });

  test('consumes expired pending state before any normal authentication mutation', async () => {
    await createFixture();
    const req: Partial<Request> = {
      cookies: {},
      ip: '127.0.0.1',
      session: {
        id: 'expired-lti-session',
        pending_lti13_auth: {
          expires_at: new Date(Date.now() - 1).toISOString(),
          lti13_instance_id: '1',
          sub: 'expired-sub',
          uin: 'expired-uin',
        },
        lti13_claims: { sub: 'expired-sub' },
        authn_lti13_instance_id: '1',
        destroy: async () => {},
        regenerate: async () => {},
        setExpiration: () => {},
        getExpirationDate: () => new Date(Date.now() + 60_000),
      },
    };

    await expect(
      loadUser(req as Request, { locals: {}, clearCookie: () => {} } as unknown as Response, {
        uid: 'expired@example.com',
        uin: 'expired-uin',
        name: 'Expired User',
        email: 'expired@example.com',
        provider: 'dev',
      }),
    ).rejects.toThrow(/invalid or expired/);

    assert.notProperty(req.session!, 'pending_lti13_auth');
    assert.notProperty(req.session!, 'lti13_claims');
    assert.notProperty(req.session!, 'authn_lti13_instance_id');
    assert.isNull(await selectOptionalUserByUid('expired@example.com'));
  });
});
