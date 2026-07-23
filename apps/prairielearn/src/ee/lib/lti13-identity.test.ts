import { describe, expect, test, vi } from 'vitest';

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
  test('uses an existing sub binding when no UIN is configured', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'sub', uin: null, candidateUid: 'candidate@example.com' },
        {
          ...EMPTY_SNAPSHOT,
          userFromSub: { id: '1', uin: 'stored-uin' },
        },
      ),
    ).toEqual({ type: 'authenticate', userId: '1' });
  });

  test('uses an existing sub binding when its UIN agrees with the launch', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'sub', uin: 'matching-uin', candidateUid: null },
        {
          ...EMPTY_SNAPSHOT,
          userFromSub: { id: '1', uin: 'matching-uin' },
        },
      ),
    ).toEqual({ type: 'authenticate', userId: '1' });
  });

  test.each([null, 'different-uin'])(
    'requires secondary auth for a sub/UIN mismatch: %j',
    (uin) => {
      expect(
        decideLti13IdentityMatch(
          { sub: 'sub', uin: 'launch-uin', candidateUid: null },
          {
            ...EMPTY_SNAPSHOT,
            userFromSub: { id: '1', uin },
          },
        ),
      ).toEqual({ type: 'secondary_auth', reason: 'sub_uin_mismatch' });
    },
  );

  test('creates a binding for an existing UIN identity without one', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'new-sub', uin: 'matching-uin', candidateUid: null },
        {
          ...EMPTY_SNAPSHOT,
          userFromUin: { id: '2', uin: 'matching-uin' },
        },
      ),
    ).toEqual({ type: 'create_binding', userId: '2' });
  });

  test('uses an existing UIN identity whose binding already matches', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'existing-sub', uin: 'matching-uin', candidateUid: null },
        {
          userFromSub: null,
          userFromUin: { id: '2', uin: 'matching-uin' },
          userFromUinBinding: { sub: 'existing-sub' },
        },
      ),
    ).toEqual({ type: 'authenticate', userId: '2' });
  });

  test('requires secondary auth before replacing a UIN identity binding', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'new-sub', uin: 'matching-uin', candidateUid: null },
        {
          userFromSub: null,
          userFromUin: { id: '2', uin: 'matching-uin' },
          userFromUinBinding: { sub: 'old-sub' },
        },
      ),
    ).toEqual({ type: 'secondary_auth', reason: 'sub_replacement' });
  });

  test('creates a user only with both a configured UIN and candidate UID', () => {
    expect(
      decideLti13IdentityMatch(
        { sub: 'new-sub', uin: 'new-uin', candidateUid: 'new@example.com' },
        EMPTY_SNAPSHOT,
      ),
    ).toEqual({ type: 'create_user', uid: 'new@example.com', uin: 'new-uin' });

    expect(
      decideLti13IdentityMatch(
        { sub: 'new-sub', uin: null, candidateUid: 'new@example.com' },
        EMPTY_SNAPSHOT,
      ),
    ).toEqual({ type: 'secondary_auth', reason: 'unmatched' });
    expect(
      decideLti13IdentityMatch(
        { sub: 'new-sub', uin: 'new-uin', candidateUid: null },
        EMPTY_SNAPSHOT,
      ),
    ).toEqual({ type: 'secondary_auth', reason: 'unmatched' });
  });
});

describe('resolveLti13IdentityMatch', () => {
  const launch = { sub: 'sub', uin: 'uin', candidateUid: 'candidate@example.com' };

  test('reloads fresh identities once after a uniqueness race', async () => {
    const loadSnapshot = vi
      .fn<() => Promise<Lti13IdentitySnapshot>>()
      .mockResolvedValueOnce(EMPTY_SNAPSHOT)
      .mockResolvedValueOnce({
        ...EMPTY_SNAPSHOT,
        userFromSub: { id: 'created-concurrently', uin: 'uin' },
      });
    const applyMutation = vi.fn().mockRejectedValue({ code: '23505' });

    await expect(
      resolveLti13IdentityMatch({
        launch,
        loadSnapshot,
        applyMutation,
        isRetryableConflict: () => true,
      }),
    ).resolves.toEqual({ type: 'authenticate', userId: 'created-concurrently' });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(applyMutation).toHaveBeenCalledTimes(1);
  });

  test('falls back to secondary auth after a second uniqueness race', async () => {
    const loadSnapshot = vi.fn().mockResolvedValue(EMPTY_SNAPSHOT);
    const applyMutation = vi.fn().mockRejectedValue({ code: '23505' });

    await expect(
      resolveLti13IdentityMatch({
        launch,
        loadSnapshot,
        applyMutation,
        isRetryableConflict: () => true,
      }),
    ).resolves.toEqual({ type: 'secondary_auth', reason: 'concurrency_conflict' });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(applyMutation).toHaveBeenCalledTimes(2);
  });

  test('does not retry non-uniqueness errors', async () => {
    const error = new Error('database unavailable');
    const applyMutation = vi.fn().mockRejectedValue(error);

    await expect(
      resolveLti13IdentityMatch({
        launch,
        loadSnapshot: async () => EMPTY_SNAPSHOT,
        applyMutation,
        isRetryableConflict: () => false,
      }),
    ).rejects.toBe(error);
    expect(applyMutation).toHaveBeenCalledTimes(1);
  });
});
