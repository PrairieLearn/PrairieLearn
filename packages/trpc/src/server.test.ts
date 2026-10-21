import { TRPCError } from '@trpc/server';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import { assert, describe, expectTypeOf, it } from 'vitest';

import type { AppError } from './client.js';
import { appErrorFormatter, getTrpcErrorStatus, throwAppError } from './server.js';

interface WholeErrorMap {
  First: { code: 'FIRST_ONLY'; first: string } | { code: 'SHARED'; shared: string };
  Second: { code: 'SECOND_ONLY'; second: string } | { code: 'SHARED'; shared: string };
}

describe('typed application errors', () => {
  it('serializes typed metadata through the error formatter', () => {
    const error = assert.throws(() => {
      throwAppError<WholeErrorMap['First']>(
        {
          code: 'FIRST_ONLY',
          message: 'Expected failure',
          first: 'detail',
        },
        'CONFLICT',
      );
    });
    assert.instanceOf(error, TRPCError);

    const result = appErrorFormatter({
      error,
      shape: {
        message: error.message,
        code: TRPC_ERROR_CODES_BY_KEY.CONFLICT,
        data: { code: 'CONFLICT', httpStatus: 409 },
      },
    });

    assert.deepEqual(result.data.appError, {
      code: 'FIRST_ONLY',
      message: 'Expected failure',
      first: 'detail',
    });
  });

  it('keeps whole-map server errors narrower than whole-map client errors', () => {
    type WholeMapThrowInput = Parameters<typeof throwAppError<WholeErrorMap>>[0];

    expectTypeOf<WholeMapThrowInput['code']>().toEqualTypeOf<'SHARED'>();
    expectTypeOf<AppError<WholeErrorMap>['code']>().toEqualTypeOf<
      'FIRST_ONLY' | 'SECOND_ONLY' | 'SHARED' | 'UNKNOWN'
    >();
  });
});

describe('HTTP errors wrapped by tRPC', () => {
  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [422, 'UNPROCESSABLE_CONTENT'],
    [429, 'TOO_MANY_REQUESTS'],
    [503, 'SERVICE_UNAVAILABLE'],
    [418, 'INTERNAL_SERVER_ERROR'],
  ] as const)('preserves HTTP status %s and maps its code', (status, code) => {
    const error = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      cause: Object.assign(new Error('Request failed'), { status }),
    });
    const result = appErrorFormatter({
      error,
      shape: {
        message: error.message,
        code: TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR,
        data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500, path: 'example.update' },
      },
    });
    assert.equal(getTrpcErrorStatus(error), status);
    assert.equal(result.code, TRPC_ERROR_CODES_BY_KEY[code]);
    assert.equal(result.data.code, code);
    assert.equal(result.data.httpStatus, status);
    assert.equal(result.data.path, 'example.update');
    assert.equal(result.message, 'Request failed');
  });

  it('preserves explicit tRPC codes even when their cause carries a different status', () => {
    const error = new TRPCError({
      code: 'FORBIDDEN',
      cause: Object.assign(new Error('Request failed'), { status: 404 }),
    });
    const shape = {
      message: error.message,
      code: TRPC_ERROR_CODES_BY_KEY.FORBIDDEN,
      data: { code: 'FORBIDDEN' as const, httpStatus: 403 },
    };
    assert.equal(getTrpcErrorStatus(error), 403);
    assert.deepEqual(appErrorFormatter({ error, shape }), shape);
  });

  it('leaves unexpected errors classified as server failures', () => {
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: new Error('Unexpected') });
    assert.equal(getTrpcErrorStatus(error), 500);
  });
});
