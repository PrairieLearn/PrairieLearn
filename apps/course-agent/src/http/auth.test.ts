import { describe, expect, it } from 'vitest';

import { isAuthorized } from './auth.js';

describe('isAuthorized', () => {
  it('accepts the exact bearer token', () => {
    expect(isAuthorized('Bearer secret-token', 'secret-token')).toBe(true);
  });

  it('rejects a wrong, missing, or unconfigured token', () => {
    expect(isAuthorized('Bearer wrong-token!', 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer secret', 'secret-token')).toBe(false);
    expect(isAuthorized(null, 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer ', undefined)).toBe(false);
  });
});
