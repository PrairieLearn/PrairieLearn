import { describe, expect, test } from 'vitest';

import {
  type ContextMembership,
  Lti13MembershipIndex,
  type Lti13MembershipLookupUser,
  STUDENT_ROLE,
  parseContextMemberships,
  analyzeRosterMemberUin,
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

function makeUinMessage(uin: unknown) {
  return { 'https://purl.imsglobal.org/spec/lti/claim/custom': { uin } };
}

function makeMember({
  sub,
  email,
  uin,
  status,
  roles = [STUDENT_ROLE],
}: {
  sub: string;
  email?: string;
  uin?: unknown;
  status?: 'Active' | 'Inactive' | 'Deleted';
  roles?: string[];
}): ContextMembership {
  return {
    user_id: sub,
    roles,
    ...(email === undefined ? {} : { email }),
    ...(uin === undefined ? {} : { message: [makeUinMessage(uin)] }),
    ...(status === undefined ? {} : { status }),
  };
}

function makeIndex(
  members: ContextMembership[],
  uinAttribute: string | null = CUSTOM_UIN_ATTRIBUTE,
) {
  return new Lti13MembershipIndex(members, {
    institution_id: 'institution',
    uin_attribute: uinAttribute,
  });
}

function makePage(members?: ContextMembership[], contextId = 'expected-context') {
  return {
    id: 'roster',
    context: { id: contextId },
    ...(members === undefined ? {} : { members }),
  };
}

describe('Lti13MembershipIndex', () => {
  test('uses a stored sub when sub, UIN, and email converge', () => {
    const user = makeUser('sub', { lti13_sub: 'canonical-sub', uin: 'matching-uin' });
    const index = makeIndex([
      makeMember({
        sub: 'canonical-sub',
        uin: user.uin ?? undefined,
        email: user.email ?? undefined,
      }),
    ]);

    expect(index.lookup(user)).toMatchObject({ user_id: 'canonical-sub' });
  });

  test('rejects a stored sub when it disagrees with the configured UIN', () => {
    const user = makeUser('sub-conflict', {
      lti13_sub: 'stored-sub',
      uin: 'matching-uin',
    });
    const index = makeIndex([
      makeMember({ sub: 'stored-sub', uin: 'different-uin' }),
      makeMember({ sub: 'matching-uin-sub', uin: user.uin ?? undefined }),
    ]);

    expect(index.lookup(user)).toBeNull();
  });

  test('rejects a stored sub whose roster member has no usable configured UIN', () => {
    const user = makeUser('sub-missing-uin', {
      lti13_sub: 'stored-sub',
      uin: 'matching-uin',
    });
    const index = makeIndex([
      makeMember({
        sub: 'stored-sub',
        email: user.email ?? undefined,
      }),
    ]);

    expect(index.lookup(user)).toBeNull();
  });

  test('uses an institution-scoped UIN when all available keys converge', () => {
    const user = makeUser('uin', { uin: 'matching-uin' });
    const index = makeIndex([
      makeMember({
        sub: 'uin-sub',
        uin: user.uin ?? undefined,
        email: user.email ?? undefined,
      }),
    ]);

    expect(index.lookup(user)).toMatchObject({ user_id: 'uin-sub' });
    expect(index.lookup({ ...user, institution_id: 'other-institution' })).toBeNull();
  });

  test.each([null, ' malformed ', '$Canvas.user.sisIntegrationId'])(
    'rejects an unusable PrairieLearn UIN without falling back to email: %j',
    (uin) => {
      const user = makeUser('invalid-user-uin', { uin });
      const index = makeIndex([
        makeMember({ sub: 'email-sub', uin: 'valid-uin', email: user.email ?? undefined }),
      ]);

      expect(index.lookup(user)).toBeNull();
    },
  );

  test.each([undefined, ' malformed ', '$Canvas.user.sisIntegrationId'])(
    'rejects an unusable roster UIN without falling back to email: %j',
    (uin) => {
      const user = makeUser('invalid-roster-uin', { uin: 'matching-uin' });
      const index = makeIndex([
        makeMember({ sub: 'email-sub', uin, email: user.email ?? undefined }),
      ]);

      expect(index.lookup(user)).toBeNull();
    },
  );

  test('rejects a duplicate UIN across roster pages', () => {
    const user = makeUser('duplicate-uin', { uin: 'matching-uin' });
    const memberships = parseContextMemberships(
      [
        makePage([makeMember({ sub: 'first-sub', uin: user.uin ?? undefined })]),
        makePage([makeMember({ sub: 'second-sub', uin: user.uin ?? undefined })]),
      ],
      'expected-context',
    );

    expect(makeIndex(memberships).lookup(user)).toBeNull();
  });

  test('rejects every UIN candidate shared with a member whose claims conflict', () => {
    const firstUser = makeUser('first-conflicted-uin', { uin: 'first-uin' });
    const secondUser = makeUser('second-conflicted-uin', { uin: 'second-uin' });
    const conflictedMember = {
      ...makeMember({ sub: 'conflicted-sub' }),
      message: [makeUinMessage(firstUser.uin), makeUinMessage(secondUser.uin)],
    };
    const index = makeIndex([
      conflictedMember,
      makeMember({ sub: 'first-valid-sub', uin: firstUser.uin }),
      makeMember({ sub: 'second-valid-sub', uin: secondUser.uin }),
    ]);

    expect(index.lookup(firstUser)).toBeNull();
    expect(index.lookup(secondUser)).toBeNull();
  });

  test('rejects a duplicate sub across roster pages', () => {
    const uinUser = makeUser('duplicate-sub-uin', { uin: 'first-uin' });
    const emailUser = makeUser('duplicate-sub-email');
    const memberships = parseContextMemberships(
      [
        makePage([
          makeMember({
            sub: 'duplicate-sub',
            uin: uinUser.uin ?? undefined,
            email: emailUser.email ?? undefined,
          }),
        ]),
        makePage([makeMember({ sub: 'duplicate-sub', uin: 'second-uin' })]),
      ],
      'expected-context',
    );

    expect(makeIndex(memberships).lookup(uinUser)).toBeNull();
    expect(makeIndex(memberships, null).lookup(emailUser)).toBeNull();
  });

  test.each(['uid', 'email'] as const)(
    'uses the unique %s-to-roster-email fallback without a configured UIN',
    (field) => {
      const user = makeUser(field);
      const index = makeIndex(
        [makeMember({ sub: 'email-sub', email: user[field] ?? undefined })],
        null,
      );

      expect(index.lookup(user)).toMatchObject({ user_id: 'email-sub' });
    },
  );

  test('uses a unique stored sub before email without a configured UIN', () => {
    const user = makeUser('no-uin-sub', { lti13_sub: 'stored-sub' });
    const index = makeIndex(
      [
        makeMember({ sub: 'stored-sub' }),
        makeMember({ sub: 'email-sub', email: user.email ?? undefined }),
      ],
      null,
    );

    expect(index.lookup(user)).toMatchObject({ user_id: 'stored-sub' });
  });

  test('treats an empty UIN attribute as unconfigured', () => {
    const user = makeUser('empty-uin-attribute');
    const index = makeIndex([makeMember({ sub: 'email-sub', email: user.email ?? undefined })], '');

    expect(index.lookup(user)).toMatchObject({ user_id: 'email-sub' });
  });

  test('rejects duplicate email and absent members', () => {
    const user = makeUser('duplicate-email');
    const index = makeIndex(
      [
        makeMember({ sub: 'email-sub-1', email: user.email ?? undefined }),
        makeMember({ sub: 'email-sub-2', email: user.email ?? undefined }),
      ],
      null,
    );

    expect(index.lookup(user)).toBeNull();
    expect(makeIndex([], null).lookup(makeUser('absent'))).toBeNull();
  });

  test.each([
    { status: 'Inactive' as const },
    { status: 'Deleted' as const },
    { roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'] },
    { roles: [STUDENT_ROLE, 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser'] },
  ])('ignores ineligible roster members: %j', (overrides) => {
    const user = makeUser('ineligible', { lti13_sub: 'matching-sub', uin: 'matching-uin' });
    const index = makeIndex([
      makeMember({ sub: 'matching-sub', uin: user.uin ?? undefined, ...overrides }),
    ]);

    expect(index.lookup(user)).toBeNull();
  });
});

describe('analyzeRosterMemberUin', () => {
  test.each([
    '',
    ' ',
    ' matching-uin ',
    '$Canvas.user.sisIntegrationId',
    ['prefix-', '$', '{Canvas.user.sisIntegrationId}'].join(''),
    123,
  ])('rejects an invalid or unexpanded value: %j', (uin) => {
    const member = makeMember({ sub: 'sub', uin });
    expect(analyzeRosterMemberUin(member, CUSTOM_UIN_ATTRIBUTE).uin).toBeNull();
  });

  test('rejects conflicting values across message entries', () => {
    const member = {
      ...makeMember({ sub: 'sub' }),
      message: [makeUinMessage('first-uin'), makeUinMessage('second-uin')],
    };

    expect(analyzeRosterMemberUin(member, CUSTOM_UIN_ATTRIBUTE).uin).toBeNull();
  });
});

describe('parseContextMemberships', () => {
  test('returns members from pages for the expected context', () => {
    const members = [makeMember({ sub: 'first' }), makeMember({ sub: 'second' })];
    const pages = members.map((member) => ({
      id: 'roster',
      context: { id: 'expected-context' },
      members: [member],
    }));

    expect(parseContextMemberships(pages, 'expected-context')).toHaveLength(2);
  });

  test('rejects a page for a different context', () => {
    const pages = [
      {
        id: 'roster',
        context: { id: 'different-context' },
        members: [makeMember({ sub: 'sub' })],
      },
    ];

    expect(() => parseContextMemberships(pages, 'expected-context')).toThrow(
      'does not match expected context',
    );
  });

  test('treats an omitted members field as empty', () => {
    expect(parseContextMemberships([makePage()], 'expected-context')).toEqual([]);
  });
});
