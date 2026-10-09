import { assert, describe, it } from 'vitest';

import { redactSensitiveRequestBody } from './request-redaction.js';

describe('request redaction', () => {
  it('redacts workspace bootstrap JWTs without mutating the request body', () => {
    const body = { jwt: 'secret-jwt', source: 'workspace' };
    assert.deepEqual(redactSensitiveRequestBody('/bootstrap', body), {
      jwt: 'REDACTED',
      source: 'workspace',
    });
    assert.deepEqual(body, { jwt: 'secret-jwt', source: 'workspace' });
    assert.deepEqual(redactSensitiveRequestBody('/other', body), body);
  });
});
