import { describe, expect, it } from 'vitest';

import { idleDeadline } from './lifecycle.js';

describe('idle deadline', () => {
  it('starts a full idle interval each time the agent yields to the user', () => {
    expect(idleDeadline(600, 1000)).toBe(601000);
    expect(idleDeadline(600, 300000)).toBe(900000);
  });
});
