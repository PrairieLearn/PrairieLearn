import { describe, expect, test } from 'vitest';

import {
  type Lti13IdentitySnapshot,
  decideLti13IdentityMatch,
  getUsableLti13Uin,
  resolveLti13IdentityMatch,
} from './lti13-identity.js';

const EMPTY_SNAPSHOT: Lti13IdentitySnapshot = {
  userFromSub: null,
  userFromUin: null,
  userFromUinBinding: null,
};

type Launch = Parameters<typeof decideLti13IdentityMatch>[0];
type Decision = ReturnType<typeof decideLti13IdentityMatch>;

function launch(overrides: Partial<Launch> = {}): Launch {
  return { sub: 'new-sub', uin: 'matching-uin', candidateUid: null, ...overrides };
}

function snapshot(overrides: Partial<Lti13IdentitySnapshot> = {}): Lti13IdentitySnapshot {
  return { ...EMPTY_SNAPSHOT, ...overrides };
}

function user(id: string, uin: string | null) {
  return { id, uin };
}

function authenticate(userId: string): Decision {
  return { type: 'authenticate', userId };
}

function secondary(reason: Extract<Decision, { type: 'secondary_auth' }>['reason']): Decision {
  return { type: 'secondary_auth', reason };
}

describe('getUsableLti13Uin', () => {
  test.each([
    undefined,
    null,
    '',
    ' ',
    ' padded ',
    '$Canvas.user.sisIntegrationId',
    ['prefix-', '$', '{Canvas.user.sisIntegrationId}'].join(''),
    123,
  ])('rejects missing, malformed, or unexpanded values: %j', (value) => {
    expect(getUsableLti13Uin(value)).toBeNull();
  });

  test('accepts an exact nonempty value', () => {
    expect(getUsableLti13Uin('canonical-uin')).toBe('canonical-uin');
  });
});

describe('decideLti13IdentityMatch', () => {
  const cases: [string, Launch, Lti13IdentitySnapshot, Decision][] = [
    [
      'uses an existing sub without a configured UIN',
      launch({ uin: null }),
      snapshot({ userFromSub: user('1', 'stored-uin') }),
      authenticate('1'),
    ],
    [
      'uses an existing sub corroborated by the launch UIN',
      launch(),
      snapshot({ userFromSub: user('1', 'matching-uin') }),
      authenticate('1'),
    ],
    ...[null, 'different-uin'].map((uin): [string, Launch, Lti13IdentitySnapshot, Decision] => [
      `requires secondary auth when the bound user has UIN ${JSON.stringify(uin)}`,
      launch(),
      snapshot({ userFromSub: user('1', uin) }),
      secondary('sub_uin_mismatch'),
    ]),
    [
      'creates a missing binding for an existing UIN identity',
      launch(),
      snapshot({ userFromUin: user('2', 'matching-uin') }),
      { type: 'create_binding', userId: '2' },
    ],
    [
      'uses a UIN identity whose binding already matches',
      launch({ sub: 'existing-sub' }),
      snapshot({
        userFromUin: user('2', 'matching-uin'),
        userFromUinBinding: { sub: 'existing-sub' },
      }),
      authenticate('2'),
    ],
    [
      'requires secondary auth before replacing a UIN identity binding',
      launch(),
      snapshot({
        userFromUin: user('2', 'matching-uin'),
        userFromUinBinding: { sub: 'old-sub' },
      }),
      secondary('sub_replacement'),
    ],
    [
      'creates a user with both a configured UIN and valid UID',
      launch({ candidateUid: 'new@example.com' }),
      EMPTY_SNAPSHOT,
      { type: 'create_user', uid: 'new@example.com', uin: 'matching-uin' },
    ],
    [
      'does not create a user from a UID alone',
      launch({ uin: null, candidateUid: 'new@example.com' }),
      EMPTY_SNAPSHOT,
      secondary('unmatched'),
    ],
    ['does not create a user from a UIN alone', launch(), EMPTY_SNAPSHOT, secondary('unmatched')],
  ];

  test.each(cases)('%s', (_name, launch, snapshot, expected) => {
    expect(decideLti13IdentityMatch(launch, snapshot)).toEqual(expected);
  });
});

describe('resolveLti13IdentityMatch', () => {
  const launch = { sub: 'sub', uin: 'uin', candidateUid: 'candidate@example.com' };

  async function resolveConflicts(decisions: Decision[]) {
    let decisionCount = 0;
    let mutationCount = 0;
    const result = await resolveLti13IdentityMatch({
      decide: async () => decisions[decisionCount++],
      applyMutation: async () => {
        mutationCount += 1;
        throw new Error('conflict');
      },
      isRetryableConflict: () => true,
    });
    return { result, decisionCount, mutationCount };
  }

  test('reloads fresh identities once after a uniqueness race', async () => {
    const { result, decisionCount, mutationCount } = await resolveConflicts([
      decideLti13IdentityMatch(launch, EMPTY_SNAPSHOT),
      { type: 'authenticate', userId: 'created-concurrently' },
    ]);

    expect(result).toEqual({ type: 'authenticate', userId: 'created-concurrently' });
    expect([decisionCount, mutationCount]).toEqual([2, 1]);
  });

  test('falls back to secondary auth after a second uniqueness race', async () => {
    const decision = decideLti13IdentityMatch(launch, EMPTY_SNAPSHOT);
    const { result, decisionCount, mutationCount } = await resolveConflicts([decision, decision]);

    expect(result).toEqual({ type: 'secondary_auth', reason: 'concurrency_conflict' });
    expect([decisionCount, mutationCount]).toEqual([2, 2]);
  });

  test('does not retry non-uniqueness errors', async () => {
    const error = new Error('database unavailable');
    let mutationCount = 0;

    await expect(
      resolveLti13IdentityMatch({
        decide: async () => decideLti13IdentityMatch(launch, EMPTY_SNAPSHOT),
        applyMutation: async () => {
          mutationCount += 1;
          throw error;
        },
        isRetryableConflict: () => false,
      }),
    ).rejects.toBe(error);
    expect(mutationCount).toBe(1);
  });
});
