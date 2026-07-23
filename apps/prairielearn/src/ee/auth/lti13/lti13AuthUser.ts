import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRow, queryScalar, runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectOrInsertUserId } from '../../../lib/authn-user.js';
import { type LoadUserAuth } from '../../../lib/authn.types.js';
import { type Lti13Instance, UserSchema } from '../../../lib/db-types.js';
import { insertAuditEvent } from '../../../models/audit-event.js';
import { selectAndLockUser, selectOptionalUserByUin } from '../../../models/user.js';
import {
  decideLti13IdentityMatch,
  getUsableLti13Uin,
  resolveLti13IdentityMatch,
} from '../../lib/lti13-identity.js';
import {
  insertLti13User,
  selectAndLockOptionalLti13UserForUser,
  selectOptionalLti13UserForUser,
  selectOptionalUserByLti13Sub,
  updateLti13UserSub,
} from '../../models/lti13-user.js';
import { selectLti13Instance } from '../../models/lti13Instance.js';

const sql = loadSqlEquiv(import.meta.url);

const IDENTITY_UNIQUE_CONSTRAINTS = new Set([
  'users_uid_key',
  'users_uin_institution_id_key',
  'lti13_users_lti13_instance_id_sub_key',
  'lti13_users_user_id_lti13_instance_id_key',
]);

const PendingLti13AuthSchema = z.object({
  expires_at: z.iso.datetime(),
  lti13_instance_id: IdSchema,
  sub: z.string().min(1),
  uin: z
    .string()
    .refine((uin) => getUsableLti13Uin(uin) === uin)
    .nullable(),
});
export type PendingLti13Auth = z.infer<typeof PendingLti13AuthSchema>;

type SessionData = Record<string, unknown>;

interface Lti13LaunchData {
  instance: Lti13Instance;
  sub: string;
  uin: string | null;
  name: string | null;
  email: string | null;
}

export function createPendingLti13Auth({
  lti13_instance_id,
  sub,
  uin,
  launchExpiresAtSeconds,
  now = new Date(),
}: {
  lti13_instance_id: string;
  sub: string;
  uin: string | null;
  launchExpiresAtSeconds: number;
  now?: Date;
}): PendingLti13Auth {
  // The secondary login is part of the original, signed LTI launch, so it must
  // never remain usable after that launch expires.
  const expiresAt = new Date(launchExpiresAtSeconds * 1000);
  if (expiresAt.getTime() <= now.getTime()) {
    throw new HttpStatusError(403, 'LTI authentication session expired, please try again.');
  }

  return PendingLti13AuthSchema.parse({
    expires_at: expiresAt.toISOString(),
    lti13_instance_id,
    sub,
    uin,
  });
}

export function consumePendingLti13Auth(session: SessionData, now = new Date()): PendingLti13Auth {
  const value = session.pending_lti13_auth;

  // Concurrent requests can each have an already-loaded copy of this state.
  // We accept duplicate processing in that rare case: the identity transaction
  // revalidates ownership under row locks, and uniqueness conflicts retry or
  // fail closed. The remaining risk is a failed callback forcing a new launch.
  // Delete before validating so malformed, expired, and valid state are all
  // one-time. The three legacy keys are deliberately rejected and cleared so
  // sessions created by an older server cannot bypass the expiration check.
  clearPendingLti13Auth(session);

  const result = PendingLti13AuthSchema.safeParse(value);
  if (!result.success || new Date(result.data.expires_at).getTime() <= now.getTime()) {
    throw new HttpStatusError(
      403,
      'LTI authentication session invalid or expired, please try again.',
    );
  }

  return result.data;
}

export function clearPendingLti13Auth(session: SessionData) {
  delete session.pending_lti13_auth;
  delete session.lti13_pending_uin;
  delete session.lti13_pending_sub;
  delete session.lti13_pending_instance_id;
}

function isIdentityUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return (
    code === '23505' &&
    typeof constraint === 'string' &&
    IDENTITY_UNIQUE_CONSTRAINTS.has(constraint)
  );
}

async function candidateUidForLaunch({
  email,
  institution_id,
}: {
  email: string | null;
  institution_id: string;
}): Promise<string | null> {
  if (!email) return null;

  const matchesInstitution = await queryScalar(
    sql.candidate_uid_matches_institution,
    { candidate_uid: email, institution_id },
    z.boolean(),
  );
  return matchesInstitution ? email : null;
}

async function createUserAndLti13Binding({
  launch,
  uid,
  uin,
}: {
  launch: Lti13LaunchData;
  uid: string;
  uin: string;
}): Promise<string> {
  return await runInTransactionAsync(async () => {
    const user = await queryRow(
      sql.insert_user,
      {
        uid,
        name: launch.name,
        uin,
        email: launch.email,
        institution_id: launch.instance.institution_id,
      },
      UserSchema,
    );
    await insertLti13User({
      user_id: user.id,
      lti13_instance_id: launch.instance.id,
      sub: launch.sub,
    });
    await insertAuditEvent({
      tableName: 'users',
      action: 'insert',
      rowId: user.id,
      newRow: user,
      agentAuthnUserId: null,
      agentUserId: null,
      institutionId: user.institution_id,
      subjectUserId: user.id,
    });
    return user.id;
  });
}

export async function matchLti13LaunchUser(launch: Lti13LaunchData) {
  return await resolveLti13IdentityMatch({
    decide: async () => {
      const [userFromSub, userFromUin] = await Promise.all([
        selectOptionalUserByLti13Sub({
          lti13_instance_id: launch.instance.id,
          sub: launch.sub,
        }),
        launch.uin === null
          ? null
          : selectOptionalUserByUin({
              institution_id: launch.instance.institution_id,
              uin: launch.uin,
            }),
      ]);
      const userFromUinBinding =
        !userFromSub && userFromUin
          ? await selectOptionalLti13UserForUser({
              user_id: userFromUin.id,
              lti13_instance_id: launch.instance.id,
            })
          : null;
      const candidateUid =
        !userFromSub && launch.uin !== null && userFromUin === null
          ? await candidateUidForLaunch({
              email: launch.email,
              institution_id: launch.instance.institution_id,
            })
          : null;

      return decideLti13IdentityMatch(
        { sub: launch.sub, uin: launch.uin, candidateUid },
        { userFromSub, userFromUin, userFromUinBinding },
      );
    },
    applyMutation: async (decision) => {
      if (decision.type === 'create_binding') {
        await insertLti13User({
          user_id: decision.userId,
          lti13_instance_id: launch.instance.id,
          sub: launch.sub,
        });
        return { type: 'authenticate', userId: decision.userId };
      }

      const userId = await createUserAndLti13Binding({
        launch,
        uid: decision.uid,
        uin: decision.uin,
      });
      return { type: 'authenticate', userId };
    },
    isRetryableConflict: isIdentityUniqueViolation,
  });
}

function throwLti13IdentityConflict(message: string): never {
  throw new HttpStatusError(403, `${message} Please contact your course instructor or IT support.`);
}

async function authenticatePendingLti13UserOnce({
  authnParams,
  pendingLti13Auth,
  instance,
}: {
  authnParams: LoadUserAuth;
  pendingLti13Auth: PendingLti13Auth;
  instance: Lti13Instance;
}): Promise<string> {
  return await runInTransactionAsync(async () => {
    // The secondary provider is authoritative for the profile fields, but the
    // LTI instance fixes the institution. users_select_or_insert locks any
    // existing user before updating it; we then reselect and lock that user so
    // the identity checks and binding mutation below share one stable view.
    const userId = await selectOrInsertUserId({
      ...authnParams,
      institution_id: instance.institution_id,
    });
    const user = await selectAndLockUser(userId);

    if (
      user.institution_id !== instance.institution_id ||
      (pendingLti13Auth.uin !== null && user.uin !== pendingLti13Auth.uin)
    ) {
      logger.error('Secondary authentication produced an inconsistent LTI identity', {
        lti13_instance_id: instance.id,
        authn_provider_name: authnParams.provider,
        authn_user_id: user.id,
      });
      throwLti13IdentityConflict('The LTI and login identities do not match.');
    }

    // Lock order is user first, then the user's LTI binding. The sub-owner read
    // is intentionally not locked: if it changes concurrently, the unique
    // constraint converts the race into the bounded retry below.
    const currentSubOwner = await selectOptionalUserByLti13Sub({
      lti13_instance_id: instance.id,
      sub: pendingLti13Auth.sub,
    });
    if (currentSubOwner && currentSubOwner.id !== user.id) {
      logger.error('LTI sub and secondary authentication resolved to different users', {
        lti13_instance_id: instance.id,
        authn_provider_name: authnParams.provider,
        authn_user_id: user.id,
        current_sub_owner_user_id: currentSubOwner.id,
      });
      throwLti13IdentityConflict('The LTI account is already linked to another user.');
    }

    const lti13User = await selectAndLockOptionalLti13UserForUser({
      user_id: user.id,
      lti13_instance_id: instance.id,
    });
    if (!lti13User) {
      await insertLti13User({
        user_id: user.id,
        lti13_instance_id: instance.id,
        sub: pendingLti13Auth.sub,
      });
    } else if (lti13User.sub !== pendingLti13Auth.sub) {
      const updatedLti13User = await updateLti13UserSub({
        lti13_user_id: lti13User.id,
        sub: pendingLti13Auth.sub,
      });
      await insertAuditEvent({
        tableName: 'lti13_users',
        action: 'update',
        actionDetail: 'sub',
        rowId: lti13User.id,
        oldRow: lti13User,
        newRow: updatedLti13User,
        agentAuthnUserId: user.id,
        agentUserId: user.id,
        institutionId: instance.institution_id,
        subjectUserId: user.id,
      });
    }

    return user.id;
  });
}

export async function authenticatePendingLti13User({
  authnParams,
  pendingLti13Auth,
}: {
  authnParams: LoadUserAuth;
  pendingLti13Auth: PendingLti13Auth;
}): Promise<string> {
  const instance = await selectLti13Instance(pendingLti13Auth.lti13_instance_id);
  const authnUin = getUsableLti13Uin(authnParams.uin);
  if (pendingLti13Auth.uin !== null && pendingLti13Auth.uin !== authnUin) {
    logger.error('LTI and secondary authentication provided different UINs', {
      lti13_instance_id: instance.id,
      authn_provider_name: authnParams.provider,
      secondary_auth_has_usable_uin: authnUin !== null,
    });
    throwLti13IdentityConflict('The LTI and login identities do not match.');
  }
  if (!authnParams.uid || authnParams.user_id !== undefined || authnParams.provider === 'LTI 1.3') {
    throwLti13IdentityConflict('A separate login method is required to verify this LTI account.');
  }

  // A recognized uniqueness error rolls the entire transaction back. Retrying
  // reruns user resolution and every consistency check against fresh rows.
  for (const attempt of [0, 1]) {
    try {
      return await authenticatePendingLti13UserOnce({
        authnParams,
        pendingLti13Auth,
        instance,
      });
    } catch (error) {
      if (!isIdentityUniqueViolation(error)) throw error;
      if (attempt === 1) {
        logger.error('LTI secondary authentication lost repeated identity uniqueness races', {
          lti13_instance_id: instance.id,
          authn_provider_name: authnParams.provider,
        });
        throw new AugmentedError(
          'Unable to safely link the LTI account. Please try again or contact your course instructor or IT support.',
          { status: 403, cause: error },
        );
      }
    }
  }

  throw new Error('Unreachable LTI secondary authentication state');
}
