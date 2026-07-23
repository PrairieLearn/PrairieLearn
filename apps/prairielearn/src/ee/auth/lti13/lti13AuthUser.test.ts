import { describe, expect, test } from 'vitest';

import {
  clearPendingLti13Auth,
  consumePendingLti13Auth,
  createPendingLti13Auth,
} from './lti13AuthUser.js';

const NOW = new Date('2026-07-22T12:00:00.000Z');

function createState({
  uin = 'uin',
  expiresInSeconds = 60,
}: { uin?: string | null; expiresInSeconds?: number } = {}) {
  return createPendingLti13Auth({
    lti13_instance_id: '1',
    sub: 'sub',
    uin,
    launchExpiresAtSeconds: NOW.getTime() / 1000 + expiresInSeconds,
    now: NOW,
  });
}

describe('pending LTI secondary authentication state', () => {
  test('expires with the original LTI launch', () => {
    expect(createState({ expiresInSeconds: 60 * 60 }).expires_at).toBe('2026-07-22T13:00:00.000Z');
  });

  test('rejects an already-expired launch', () => {
    expect(() => createState({ uin: null, expiresInSeconds: 0 })).toThrow(/expired/);
  });

  test('is consumed once from a loaded session', () => {
    const session = { pending_lti13_auth: createState() };

    expect(consumePendingLti13Auth(session, NOW)).toMatchObject({
      lti13_instance_id: '1',
      sub: 'sub',
      uin: 'uin',
    });
    expect(session).not.toHaveProperty('pending_lti13_auth');
    expect(() => consumePendingLti13Auth(session, NOW)).toThrow(/invalid or expired/);
  });

  test.each([
    {
      expires_at: '2026-07-22T11:59:59.000Z',
      lti13_instance_id: '1',
      sub: 'sub',
      uin: 'uin',
    },
    {
      expires_at: '2026-07-22T12:01:00.000Z',
      lti13_instance_id: '1',
      sub: 'sub',
      uin: '$Canvas.user.sisIntegrationId',
    },
    {
      expires_at: 'not-a-date',
      lti13_instance_id: '1',
      sub: 'sub',
      uin: 'uin',
    },
  ])('removes invalid or expired state before failing: %j', (pending_lti13_auth) => {
    const session = { pending_lti13_auth };

    expect(() => consumePendingLti13Auth(session, NOW)).toThrow(/invalid or expired/);
    expect(session).not.toHaveProperty('pending_lti13_auth');
  });

  test('rejects and clears legacy state that has no expiration', () => {
    const session = {
      lti13_pending_uin: 'uin',
      lti13_pending_sub: 'sub',
      lti13_pending_instance_id: '1',
    };

    expect(() => consumePendingLti13Auth(session, NOW)).toThrow(/invalid or expired/);
    expect(session).toEqual({});
  });

  test('clears superseded pending and legacy state', () => {
    const session = {
      pending_lti13_auth: { marker: 'current' },
      lti13_pending_uin: 'legacy-uin',
      lti13_pending_sub: 'legacy-sub',
      lti13_pending_instance_id: '1',
      unrelated: 'preserved',
    };

    clearPendingLti13Auth(session);

    expect(session).toEqual({ unrelated: 'preserved' });
  });
});
