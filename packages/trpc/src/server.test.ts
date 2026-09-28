import { TRPCError } from '@trpc/server';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import { assert, describe, expectTypeOf, it } from 'vitest';

import type { AppError } from './client.js';
import { appErrorFormatter, throwAppError } from './server.js';

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
