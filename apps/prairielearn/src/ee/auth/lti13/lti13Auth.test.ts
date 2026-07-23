import { afterAll, assert, beforeAll, test } from 'vitest';

import * as assets from '../../../lib/assets.js';

import { Lti13AuthRequired } from './lti13Auth.html.js';

beforeAll(() => assets.init());
afterAll(() => assets.close());

test('renders secondary authentication as a one-time continuation', () => {
  const page = Lti13AuthRequired({
    institution_id: '42',
    resLocals: {
      authn_user: {
        name: 'Previously signed-in user',
      },
      is_administrator: true,
    },
  });

  assert.include(page, 'Sign in once');
  assert.include(page, 'return you to your course.');
  assert.include(page, 'href="/pl/login?institution_id=42"');
  assert.include(page, 'aria-label="Global navigation"');
  assert.notInclude(page, 'Previously signed-in user');
  assert.notInclude(page, 'Global Admin');
  assert.notInclude(page, 'Your institution requires');
});
