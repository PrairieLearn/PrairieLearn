import { assert, describe, it } from 'vitest';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { parseRequestBody, parseRequestQuery } from './index.js';

describe('request validation', () => {
  it('parses and transforms query parameters', () => {
    const result = parseRequestQuery(
      { query: { page: '2' } },
      z.object({ page: z.coerce.number().int() }),
    );

    assert.deepEqual(result, { page: 2 });
  });

  it('throws a 400 error for invalid query parameters', () => {
    const error = assert.throws(() =>
      parseRequestQuery({ query: { page: 'invalid' } }, z.object({ page: z.coerce.number() })),
    );

    assert.instanceOf(error, HttpStatusError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Invalid query parameters');
    assert.instanceOf(error.cause, z.ZodError);
  });

  it('throws a 400 error for an invalid request body', () => {
    const error = assert.throws(() =>
      parseRequestBody({ body: { name: 1 } }, z.object({ name: z.string() })),
    );

    assert.instanceOf(error, HttpStatusError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Invalid request body');
    assert.instanceOf(error.cause, z.ZodError);
  });
});
