import { assert, describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { parseRequest, parseRequestBody, parseRequestParams, parseRequestQuery } from './index.js';

describe('request validation', () => {
  it('parses request data by source', () => {
    const result = parseRequest(
      {
        params: { course_id: '123' },
        query: { page: '2' },
        body: { enabled: 'true' },
      },
      {
        params: z.object({ course_id: z.coerce.number().int() }),
        query: z.object({ page: z.coerce.number().int() }),
        body: z.object({
          enabled: z.enum(['true', 'false']).transform((value) => value === 'true'),
        }),
      },
    );

    expectTypeOf(result).toEqualTypeOf<{
      params: { course_id: number };
      query: { page: number };
      body: { enabled: boolean };
    }>();
    assert.deepEqual(result, {
      params: { course_id: 123 },
      query: { page: 2 },
      body: { enabled: true },
    });
  });

  it('preserves source-specific errors when parsing request data', () => {
    const error = assert.throws(() =>
      parseRequest(
        { params: {}, query: {}, body: { name: 1 } },
        { body: z.object({ name: z.string() }) },
      ),
    );

    assert.instanceOf(error, HttpStatusError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Invalid request body');
    assert.instanceOf(error.cause, z.ZodError);
  });

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

  it('parses and transforms path parameters', () => {
    const result = parseRequestParams(
      { params: { course_id: '123' } },
      z.object({ course_id: z.coerce.number().int() }),
    );

    assert.deepEqual(result, { course_id: 123 });
  });

  it('throws a 400 error for invalid path parameters', () => {
    const error = assert.throws(() =>
      parseRequestParams(
        { params: { course_id: 'invalid' } },
        z.object({ course_id: z.coerce.number() }),
      ),
    );

    assert.instanceOf(error, HttpStatusError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Invalid path parameters');
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

  it('throws an action-specific error for an unrecognized __action', () => {
    const error = assert.throws(() =>
      parseRequestBody(
        { body: { __action: 'archive' } },
        z.discriminatedUnion('__action', [
          z.object({ __action: z.literal('create') }),
          z.object({ __action: z.literal('update') }),
        ]),
      ),
    );

    assert.instanceOf(error, HttpStatusError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'unknown __action: archive');
    assert.instanceOf(error.cause, z.ZodError);
  });
});
