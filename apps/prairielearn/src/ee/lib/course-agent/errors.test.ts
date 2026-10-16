import { expect, test } from 'vitest';

import { connectionFailure, workerResponseError } from './errors.js';

test.each([401, 403])('explains service authentication failures (%s)', (status) => {
  expect(connectionFailure(workerResponseError(status)).message).toContain(
    'PL_SERVICE_TOKEN and courseAgent.serviceToken',
  );
});

test('does not expose arbitrary transport errors to the browser', () => {
  const result = connectionFailure(new Error('sensitive upstream response'));
  expect(result.message).not.toContain('sensitive upstream response');
  expect(result.message).toContain('Your draft is preserved');
});
