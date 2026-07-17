import { get } from 'es-toolkit/compat';
import { z } from 'zod';

import type { User } from '../../lib/db-types.js';

export const STUDENT_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const TEST_USER_ROLE = 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser';

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
const ContextMembershipSchema = RosterMemberSchema.extend({
  roles: z.string().array(), // https://www.imsglobal.org/spec/lti/v1p3#role-vocabularies
  status: z.enum(['Active', 'Inactive', 'Deleted']).optional(),
  email: z.string().optional(),
});
export type ContextMembership = z.infer<typeof ContextMembershipSchema>;

const ContextMembershipContainerSchema = z.object({
  id: z.string(),
  context: z.object({
    id: z.string(),
  }),
  members: ContextMembershipSchema.array().default([]),
});

/**
 * Parses paginated NRPS responses and verifies that every page belongs to the
 * course context that supplied the memberships URL.
 */
export function parseContextMemberships(
  pages: unknown[],
  expectedContextId: string,
): ContextMembership[] {
  const containers = ContextMembershipContainerSchema.array().parse(pages);

  for (const container of containers) {
    if (container.context.id !== expectedContextId) {
      throw new Error(
        `LTI roster context ${container.context.id} does not match expected context ${expectedContextId}`,
      );
    }
  }

  return containers.flatMap((container) => container.members);
}

export type Lti13MembershipLookupUser = Pick<User, 'uid' | 'email' | 'uin' | 'institution_id'> & {
  lti13_sub: string | null;
};

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

function getUsableUin(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  // LTI leaves unsupported substitution variables unresolved. Canvas also supports
  // embedded `${...}` substitutions, so reject any `$`, not only a leading one.
  return value.length > 0 && value === value.trim() && !value.includes('$') ? value : null;
}

/**
 * Analyzes the UIN for a roster member using the instance's configured
 * `uin_attribute` path. That path is written against the launch id_token, but NRPS
 * represents a member differently: standard claims and the lis sourcedid are
 * flattened onto the member, while per-resource-link claims (e.g. custom) live in
 * `message[]`. We resolve the launch claim path against each possible source and
 * fail closed if the platform returns conflicting values. `uin` is null when the
 * attribute isn't configured or nothing resolves to a valid, expanded value;
 * `usableCandidates` retains valid values from conflicting claims so callers can
 * treat those values as ambiguous across the complete roster.
 */
export function analyzeRosterMemberUin(
  member: RosterMember,
  uin_attribute: string | null,
): { uin: string | null; usableCandidates: string[] } {
  if (!uin_attribute) return { uin: null, usableCandidates: [] };

  // `message[]` is only present with `?rlid=`. Each entry is already shaped like
  // launch claims, while NRPS flattens the lis sourcedid onto the member.
  const claimSources = [
    {
      ...member,
      'https://purl.imsglobal.org/spec/lti/claim/lis':
        member.lis_person_sourcedid != null
          ? { person_sourcedid: member.lis_person_sourcedid }
          : undefined,
    },
    ...(member.message ?? []),
  ];
  const values = claimSources
    .map((claims) => get(claims, uin_attribute))
    .filter((value) => value !== undefined);
  const value = values[0];
  const usableCandidates = [
    ...new Set(values.map(getUsableUin).filter((uin): uin is string => uin !== null)),
  ];

  return {
    uin: values.some((candidate) => candidate !== value) ? null : getUsableUin(value),
    usableCandidates,
  };
}

/**
 * Indexes active learners from a complete live NRPS roster. Integrations with a
 * configured UIN require a unique institution-scoped UIN and any stored sub to
 * resolve to one member; roster email is ignored. Integrations without a UIN
 * retain the best-effort stored-sub-then-email lookup. Duplicate subs, UINs, and
 * matched emails fail closed. This index preserves per-student passback isolation;
 * roster sync must instead reject the entire snapshot when an in-scope member
 * lacks a usable UIN, has conflicting UIN values, or shares a sub or UIN.
 */
export class Lti13MembershipIndex {
  // null marks an identity key shared by multiple roster entries.
  #membershipsByEmail = new Map<string, ContextMembership | null>();
  #membershipsBySub = new Map<string, ContextMembership | null>();
  #membershipsByUin = new Map<string, ContextMembership | null>();
  #institutionId: string;
  #uinAttribute: string | null;

  constructor(
    memberships: ContextMembership[],
    { institution_id, uin_attribute }: { institution_id: string; uin_attribute: string | null },
  ) {
    this.#institutionId = institution_id;
    // Cleared optional admin fields may be stored as empty strings; LTI auth
    // treats an empty UIN attribute as unconfigured too.
    this.#uinAttribute = uin_attribute || null;

    for (const member of memberships) {
      // NRPS defines a missing status as Active.
      if (
        member.status === 'Inactive' ||
        member.status === 'Deleted' ||
        !member.roles.includes(STUDENT_ROLE) ||
        member.roles.includes(TEST_USER_ROLE)
      ) {
        continue;
      }

      if (this.#membershipsBySub.has(member.user_id)) {
        this.#membershipsBySub.set(member.user_id, null);
      } else {
        this.#membershipsBySub.set(member.user_id, member);
      }

      const { uin, usableCandidates } = analyzeRosterMemberUin(member, this.#uinAttribute);
      for (const candidate of usableCandidates) {
        if (candidate === uin && !this.#membershipsByUin.has(candidate)) {
          this.#membershipsByUin.set(candidate, member);
        } else {
          // A conflicted member still poisons each usable candidate so a later
          // otherwise-valid member cannot make that UIN appear unique.
          this.#membershipsByUin.set(candidate, null);
        }
      }

      if (member.email !== undefined) {
        this.#membershipsByEmail.set(
          member.email,
          this.#membershipsByEmail.has(member.email) ? null : member,
        );
      }
    }
  }

  lookup(user: Lti13MembershipLookupUser): ContextMembership | null {
    if (this.#uinAttribute !== null) {
      return this.#lookupWithUin(user);
    }

    if (user.lti13_sub !== null) {
      const member = this.#membershipsBySub.get(user.lti13_sub);
      return member ?? null;
    }

    for (const match of ['uid', 'email'] as const) {
      const key = user[match];
      if (key == null) continue;

      const member = this.#membershipsByEmail.get(key);
      if (member === undefined) continue;
      if (member === null) return null;
      if (this.#membershipsBySub.get(member.user_id) !== member) return null;
      return member;
    }

    return null;
  }

  #lookupWithUin(user: Lti13MembershipLookupUser): ContextMembership | null {
    if (user.institution_id !== this.#institutionId) return null;

    const uin = getUsableUin(user.uin);
    if (uin === null) return null;

    const member = this.#membershipsByUin.get(uin);
    if (member == null || this.#membershipsBySub.get(member.user_id) !== member) return null;

    if (user.lti13_sub !== null && this.#membershipsBySub.get(user.lti13_sub) !== member) {
      return null;
    }

    return member;
  }
}
