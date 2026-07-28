interface Lti13IdentityUser {
  id: string;
  uin: string | null;
}

export interface Lti13IdentitySnapshot {
  userFromSub: Lti13IdentityUser | null;
  userFromUin: Lti13IdentityUser | null;
  userFromUid: Lti13IdentityUser | null;
  userFromUinBinding: { sub: string } | null;
}

export type Lti13IdentityDecision =
  | { type: 'authenticate'; userId: string }
  | { type: 'create_binding'; userId: string }
  | { type: 'create_user'; uid: string; uin: string }
  | {
      type: 'secondary_auth';
      reason:
        | 'concurrency_conflict'
        | 'sub_replacement'
        | 'sub_uin_mismatch'
        | 'uid_match_requires_auth'
        | 'unmatched';
    };

interface Lti13IdentityLaunch {
  sub: string;
  uin: string | null;
  candidateUid: string | null;
}

export function getUsableLti13Uin(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  // LTI leaves unsupported substitution variables unresolved. Canvas also supports
  // embedded `${...}` substitutions, so reject any `$`, not only a leading one.
  return value.length > 0 && value === value.trim() && !value.includes('$') ? value : null;
}

export function decideLti13IdentityMatch(
  launch: Lti13IdentityLaunch,
  snapshot: Lti13IdentitySnapshot,
): Lti13IdentityDecision {
  // An existing sub is the strongest LTI identity. When the instance has a
  // configured UIN it must corroborate that binding; without a configured UIN,
  // preserving sub-only behavior is the backwards-compatible path.
  if (snapshot.userFromSub) {
    if (launch.uin !== null && launch.uin !== snapshot.userFromSub.uin) {
      return { type: 'secondary_auth', reason: 'sub_uin_mismatch' };
    }

    return { type: 'authenticate', userId: snapshot.userFromSub.id };
  }

  if (snapshot.userFromUin) {
    // A UIN can add a missing binding automatically, but changing an existing
    // binding requires proof from a separate authentication provider.
    if (snapshot.userFromUinBinding && snapshot.userFromUinBinding.sub !== launch.sub) {
      return { type: 'secondary_auth', reason: 'sub_replacement' };
    }

    if (!snapshot.userFromUinBinding) {
      return { type: 'create_binding', userId: snapshot.userFromUin.id };
    }

    return { type: 'authenticate', userId: snapshot.userFromUin.id };
  }

  if (launch.uin !== null && launch.candidateUid !== null) {
    // A UID-only user may already have privileges from being added to a course.
    // LTI email is not sufficient proof to claim that account or fill its UIN.
    if (snapshot.userFromUid) {
      return { type: 'secondary_auth', reason: 'uid_match_requires_auth' };
    }

    // New users require both institution-valid UID and UIN. Neither identifier
    // is synthesized or copied from an unvalidated LTI claim.
    return { type: 'create_user', uid: launch.candidateUid, uin: launch.uin };
  }

  return { type: 'secondary_auth', reason: 'unmatched' };
}

type MutableLti13IdentityDecision = Extract<
  Lti13IdentityDecision,
  { type: 'create_binding' | 'create_user' }
>;

export async function resolveLti13IdentityMatch({
  decide,
  applyMutation,
  isRetryableConflict,
}: {
  decide: () => Promise<Lti13IdentityDecision>;
  applyMutation: (
    decision: MutableLti13IdentityDecision,
  ) => Promise<Extract<Lti13IdentityDecision, { type: 'authenticate' }>>;
  isRetryableConflict: (error: unknown) => boolean;
}): Promise<Extract<Lti13IdentityDecision, { type: 'authenticate' | 'secondary_auth' }>> {
  for (const attempt of [0, 1]) {
    const decision = await decide();
    if (decision.type === 'authenticate' || decision.type === 'secondary_auth') {
      return decision;
    }

    try {
      return await applyMutation(decision);
    } catch (error) {
      if (!isRetryableConflict(error)) throw error;
      if (attempt === 1) {
        return { type: 'secondary_auth', reason: 'concurrency_conflict' };
      }
      // Another request may have created either identity while this request was
      // inserting. Rerun the complete decision tree against fresh data once.
    }
  }

  throw new Error('Unreachable LTI identity matching state');
}
