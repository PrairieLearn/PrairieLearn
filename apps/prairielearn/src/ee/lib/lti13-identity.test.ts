import { describe, expect, test } from 'vitest';

import {
  type Lti13IdentitySnapshot,
  decideLti13IdentityMatch,
  getUsableLti13Uin,
  resolveLti13IdentityMatch,
} from './lti13-identity.js';

type Launch = Parameters<typeof decideLti13IdentityMatch>[0];
type Decision = ReturnType<typeof decideLti13IdentityMatch>;

const DEFAULT_LAUNCH: Launch = {
  sub: 'new-sub',
  uin: 'matching-uin',
  candidateUid: null,
};

const EMPTY_SNAPSHOT: Lti13IdentitySnapshot = {
  userFromSub: null,
  userFromUin: null,
  userFromUinBinding: null,
};

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
  const cases: {
    name: string;
    launch?: Partial<Launch>;
    snapshot?: Partial<Lti13IdentitySnapshot>;
    expected: Decision;
  }[] = [
    {
      name: 'uses an existing sub without a configured UIN',
      launch: { uin: null },
      snapshot: { userFromSub: { id: '1', uin: 'stored-uin' } },
      expected: { type: 'authenticate', userId: '1' },
    },
    {
      name: 'uses an existing sub corroborated by the launch UIN',
      snapshot: { userFromSub: { id: '1', uin: 'matching-uin' } },
      expected: { type: 'authenticate', userId: '1' },
    },
    {
      name: 'requires secondary auth when the bound user has no UIN',
      snapshot: { userFromSub: { id: '1', uin: null } },
      expected: { type: 'secondary_auth', reason: 'sub_uin_mismatch' },
    },
    {
      name: 'requires secondary auth when the bound user has a different UIN',
      snapshot: { userFromSub: { id: '1', uin: 'different-uin' } },
      expected: { type: 'secondary_auth', reason: 'sub_uin_mismatch' },
    },
    {
      name: 'creates a missing binding for an existing UIN identity',
      snapshot: { userFromUin: { id: '2', uin: 'matching-uin' } },
      expected: { type: 'create_binding', userId: '2' },
    },
    {
      name: 'uses a UIN identity whose binding already matches',
      launch: { sub: 'existing-sub' },
      snapshot: {
        userFromUin: { id: '2', uin: 'matching-uin' },
        userFromUinBinding: { sub: 'existing-sub' },
      },
      expected: { type: 'authenticate', userId: '2' },
    },
    {
      name: 'requires secondary auth before replacing a UIN identity binding',
      snapshot: {
        userFromUin: { id: '2', uin: 'matching-uin' },
        userFromUinBinding: { sub: 'old-sub' },
      },
      expected: { type: 'secondary_auth', reason: 'sub_replacement' },
    },
    {
      name: 'creates a user with both a configured UIN and valid UID',
      launch: { candidateUid: 'new@example.com' },
      expected: { type: 'create_user', uid: 'new@example.com', uin: 'matching-uin' },
    },
    {
      name: 'does not create a user from a UID alone',
      launch: { uin: null, candidateUid: 'new@example.com' },
      expected: { type: 'secondary_auth', reason: 'unmatched' },
    },
    {
      name: 'does not create a user from a UIN alone',
      expected: { type: 'secondary_auth', reason: 'unmatched' },
    },
  ];

  test.each(cases)('$name', ({ launch, snapshot, expected }) => {
    expect(
      decideLti13IdentityMatch(
        { ...DEFAULT_LAUNCH, ...launch },
        { ...EMPTY_SNAPSHOT, ...snapshot },
      ),
    ).toEqual(expected);
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

  test('does not retry non-retryable errors', async () => {
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
