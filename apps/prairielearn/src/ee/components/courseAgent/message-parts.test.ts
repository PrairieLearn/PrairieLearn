import { expect, it } from 'vitest';

import { isVisibleMessage } from './message-parts.js';

it('hides native recovery input but preserves ordinary user messages', () => {
  expect(
    isVisibleMessage({
      id: 'tool-call-uuid',
      role: 'user',
      metadata: { source: 'tool-result' },
      parts: [{ type: 'text', text: 'internal result' }],
    }),
  ).toBe(false);
  expect(
    isVisibleMessage({ id: 'user-uuid', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
  ).toBe(true);
});
