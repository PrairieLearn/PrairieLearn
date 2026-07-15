import { describe, expect, test } from 'vitest';

import {
  ContextMembershipSchema,
  Lti13MembershipIndex,
  type Lti13MembershipLookupUser,
  RosterMemberSchema,
  STUDENT_ROLE,
  resolveRosterMemberUin,
} from './lti13-memberships.js';

const CUSTOM_UIN_ATTRIBUTE = '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]';

function makeUser(
  id: string,
  overrides: Partial<Lti13MembershipLookupUser> = {},
): Lti13MembershipLookupUser {
  return {
    uid: `${id}-uid@example.com`,
    email: `${id}-email@example.com`,
    uin: null,
    institution_id: 'institution',
    lti13_sub: null,
    ...overrides,
  };
}

function makeMember({ sub, email, uin }: { sub: string; email?: string; uin?: unknown }) {
  return {
    user_id: sub,
    roles: [STUDENT_ROLE],
    ...(email === undefined ? {} : { email }),
    ...(uin === undefined
      ? {}
      : {
          message: [{ 'https://purl.imsglobal.org/spec/lti/claim/custom': { uin } }],
        }),
  };
}

function makeIndex(members: ReturnType<typeof makeMember>[]) {
  return new Lti13MembershipIndex(ContextMembershipSchema.array().parse(members), {
    institution_id: 'institution',
    uin_attribute: CUSTOM_UIN_ATTRIBUTE,
  });
}

describe('Lti13MembershipIndex', () => {
  test('uses a stored sub without rematching or replacing it', () => {
    const user = makeUser('sub', { lti13_sub: 'canonical-sub', uin: 'matching-uin' });
    const members = [
      makeMember({ sub: 'canonical-sub' }),
      makeMember({ sub: 'different-uin-sub', uin: user.uin ?? undefined }),
      makeMember({ sub: 'different-email-sub', email: user.email ?? undefined }),
    ];

    expect(makeIndex(members).lookup(user)).toMatchObject({
      matchedBy: 'sub',
      member: { user_id: 'canonical-sub' },
    });
    expect(makeIndex(members.slice(1)).lookup(user)).toBeNull();
  });

  test('uses an institution-scoped UIN before email', () => {
    const user = makeUser('uin', { uin: 'matching-uin' });
    const index = makeIndex([
      makeMember({ sub: 'uin-sub', uin: user.uin ?? undefined }),
      makeMember({ sub: 'different-email-sub', email: user.email ?? undefined }),
    ]);

    expect(index.lookup(user)).toMatchObject({
      matchedBy: 'uin',
      member: { user_id: 'uin-sub' },
    });
    expect(index.lookup({ ...user, institution_id: 'other-institution' })).toMatchObject({
      matchedBy: 'email',
      member: { user_id: 'different-email-sub' },
    });
  });

  test('rejects an ambiguous UIN instead of falling back to email', () => {
    const user = makeUser('duplicate-uin', { uin: 'duplicate-uin' });
    const index = makeIndex([
      makeMember({ sub: 'uin-sub-1', uin: user.uin ?? undefined }),
      makeMember({ sub: 'uin-sub-2', uin: user.uin ?? undefined }),
      makeMember({ sub: 'email-sub', email: user.email ?? undefined }),
    ]);

    expect(index.lookup(user)).toBeNull();
  });

  test.each(['uid', 'email'] as const)(
    'retains the unique %s-to-roster-email fallback',
    (field) => {
      const user = makeUser(field, { uin: 'not-in-roster' });
      const index = makeIndex([makeMember({ sub: 'email-sub', email: user[field] ?? undefined })]);

      expect(index.lookup(user)).toMatchObject({
        matchedBy: 'email',
        member: { user_id: 'email-sub' },
      });
    },
  );

  test('rejects duplicate email and absent members', () => {
    const user = makeUser('duplicate-email');
    const index = makeIndex([
      makeMember({ sub: 'email-sub-1', email: user.email ?? undefined }),
      makeMember({ sub: 'email-sub-2', email: user.email ?? undefined }),
    ]);

    expect(index.lookup(user)).toBeNull();
    expect(index.lookup(makeUser('absent'))).toBeNull();
  });
});

describe('resolveRosterMemberUin', () => {
  test.each(['', ' ', ' matching-uin ', '$Canvas.user.sisIntegrationId', 'prefix$value', 123])(
    'rejects an invalid or unexpanded value: %j',
    (uin) => {
      const member = RosterMemberSchema.parse(makeMember({ sub: 'sub', uin }));
      expect(resolveRosterMemberUin(member, CUSTOM_UIN_ATTRIBUTE)).toBeNull();
    },
  );
});
