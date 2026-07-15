import { get } from 'es-toolkit/compat';
import { z } from 'zod';

import type { User } from '../../lib/db-types.js';

export const STUDENT_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';

// Loose schema for NRPS roster members. The inspector dumps members verbatim,
// while grade passback extends this with the fields it needs for routing.
export const RosterMemberSchema = z
  .object({
    user_id: z.string(),
    // NRPS flattens the lis sourcedid onto the member rather than nesting it under
    // the lis claim the way a launch id_token does.
    lis_person_sourcedid: z.string().optional(),
    // Present only when the roster is fetched with a resource link id (`?rlid=`).
    message: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();
type RosterMember = z.infer<typeof RosterMemberSchema>;

// https://www.imsglobal.org/spec/lti-nrps/v2p0/#sharing-of-personal-data
export const ContextMembershipSchema = RosterMemberSchema.extend({
  roles: z.string().array(), // https://www.imsglobal.org/spec/lti/v1p3#role-vocabularies
  status: z.enum(['Active', 'Inactive', 'Deleted']).optional(),
  email: z.string().optional(),
});
type ContextMembership = z.infer<typeof ContextMembershipSchema>;

export const ContextMembershipContainerSchema = z.object({
  id: z.string(),
  context: z.object({
    id: z.string(),
  }),
  members: ContextMembershipSchema.array(),
});

export type Lti13MembershipLookupUser = Pick<User, 'uid' | 'email' | 'uin' | 'institution_id'> & {
  lti13_sub: string | null;
};

interface Lti13MembershipMatch {
  member: ContextMembership;
  matchedBy: 'sub' | 'uin' | 'email';
}

/**
 * Appends a resource link id to a NRPS `context_memberships_url` so that the
 * platform resolves per-member `message[]` claims (including custom claims) for
 * that resource link. Returns the URL unchanged when no rlid is provided.
 *
 * https://www.imsglobal.org/spec/lti-nrps/v2p0/#resource-link-membership-service
 */
export function appendRlidToMembershipsUrl(
  context_memberships_url: string,
  rlid: string | null,
): string {
  if (!rlid) return context_memberships_url;
  const url = new URL(context_memberships_url);
  url.searchParams.set('rlid', rlid);
  return url.toString();
}

/**
 * Resolves the UIN for a roster member using the instance's configured
 * `uin_attribute` path. That path is written against the launch id_token, but NRPS
 * represents a member differently: standard claims and the lis sourcedid are
 * flattened onto the member, while per-resource-link claims (e.g. custom) live in
 * `message[]`. We rebuild a launch-claim-shaped object so the same path resolves
 * for the configurations seen in practice — both `…/claim/custom` and
 * `…/claim/lis`. Returns null when the attribute isn't configured or nothing
 * resolves to a valid, expanded value.
 */
export function resolveRosterMemberUin(
  member: RosterMember,
  uin_attribute: string | null,
): string | null {
  if (!uin_attribute) return null;

  // `message[]` is typed as an array (each entry tagged with a message_type) and is
  // only present with `?rlid=`. Canvas only ever emits a single LtiResourceLinkRequest
  // entry, but merge any entries so a custom claim resolves regardless of position.
  // The lis sourcedid is the one claim NRPS flattens onto the member, so nest it back
  // under its claim. es-toolkit's `get` expands a path like 'a[0].b.c'.
  const claims = {
    ...member,
    ...Object.assign({}, ...(member.message ?? [])),
    'https://purl.imsglobal.org/spec/lti/claim/lis':
      member.lis_person_sourcedid != null
        ? { person_sourcedid: member.lis_person_sourcedid }
        : undefined,
  };

  const value = get(claims, uin_attribute);
  if (typeof value !== 'string') return null;

  // LTI leaves unsupported substitution variables unresolved. Canvas also supports
  // embedded `${...}` substitutions, so reject any `$`, not only a leading one.
  return value.length > 0 && value === value.trim() && !value.includes('$') ? value : null;
}

/**
 * Indexes a live NRPS roster and applies the grade-routing identity order during
 * lookup: canonical stored `sub`, then institution-scoped UIN, then unique roster
 * email. A stored `sub` that is absent and an ambiguous UIN or email fail closed.
 * `matchedBy` is a trust signal; only UIN matches may establish a new stored `sub`.
 */
export class Lti13MembershipIndex {
  #membershipsByEmail = new Map<string, ContextMembership[]>();
  #membershipsBySub = new Map<string, ContextMembership>();
  // null marks a UIN shared by distinct roster members.
  #membershipsByUin = new Map<string, ContextMembership | null>();
  #institutionId: string;

  constructor(
    memberships: ContextMembership[],
    { institution_id, uin_attribute }: { institution_id: string; uin_attribute: string | null },
  ) {
    this.#institutionId = institution_id;

    for (const member of memberships) {
      this.#membershipsBySub.set(member.user_id, member);

      const uin = resolveRosterMemberUin(member, uin_attribute);
      if (uin !== null) {
        if (!this.#membershipsByUin.has(uin)) {
          this.#membershipsByUin.set(uin, member);
        } else if (this.#membershipsByUin.get(uin)?.user_id !== member.user_id) {
          this.#membershipsByUin.set(uin, null);
        }
      }

      if (member.email === undefined) continue;
      const emailMemberships = this.#membershipsByEmail.get(member.email) ?? [];
      emailMemberships.push(member);
      this.#membershipsByEmail.set(member.email, emailMemberships);
    }
  }

  lookup(user: Lti13MembershipLookupUser): Lti13MembershipMatch | null {
    if (user.lti13_sub !== null) {
      const member = this.#membershipsBySub.get(user.lti13_sub);
      return member === undefined ? null : { member, matchedBy: 'sub' };
    }

    if (user.institution_id === this.#institutionId && user.uin !== null) {
      const member = this.#membershipsByUin.get(user.uin);
      if (member === null) return null;
      if (member !== undefined) return { member, matchedBy: 'uin' };
    }

    for (const match of ['uid', 'email'] as const) {
      const key = user[match];
      if (key == null) continue;

      const memberResults = this.#membershipsByEmail.get(key);
      if (!memberResults) continue;
      if (memberResults.length > 1) return null;

      return { member: memberResults[0], matchedBy: 'email' };
    }

    return null;
  }
}
