import { TRPCClientError } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import { assert, describe, it } from 'vitest';

import { getAppError, renderAppError } from './client.js';
import { appErrorFormatter, throwAppError } from './server.js';

interface ExpectedError {
  code: 'EXPECTED';
  detail: string;
}

describe('getAppError', () => {
  it('extracts typed metadata from a tRPC client error', () => {
    const serverError = assert.throws(() => {
      throwAppError<ExpectedError>({
        message: 'Expected failure',
        code: 'EXPECTED',
        detail: 'more context',
      });
    });
    assert.instanceOf(serverError, TRPCError);

    const errorShape = appErrorFormatter({
      error: serverError,
      shape: {
        message: serverError.message,
        code: TRPC_ERROR_CODES_BY_KEY.BAD_REQUEST,
        data: {
          code: 'BAD_REQUEST',
          httpStatus: 400,
        },
      },
    });
    const error = new TRPCClientError(errorShape.message, {
      result: { error: errorShape },
    });

    assert.deepEqual(getAppError<ExpectedError>(error), {
      code: 'EXPECTED',
      message: 'Expected failure',
      detail: 'more context',
    });
  });

  it('uses UNKNOWN for ordinary errors', () => {
    assert.deepEqual(getAppError<ExpectedError>(new Error('Unexpected failure')), {
      code: 'UNKNOWN',
      message: 'Unexpected failure',
    });
  });
});

describe('renderAppError', () => {
  it('uses an exhaustive renderer for a known code', () => {
    const error = { code: 'EXPECTED' as const, message: 'Expected failure', detail: 'context' };

    assert.equal(
      renderAppError(error, {
        EXPECTED: ({ message, detail }) => `${message}: ${detail}`,
      }),
      'Expected failure: context',
    );
  });

  it('falls back to the message when a stale client receives an unknown runtime code', () => {
    interface KnownError {
      code: 'EXPECTED';
      message: string;
    }
    const staleClientError = {
      code: 'ADDED_AFTER_DEPLOY',
      message: 'The server still explains the failure',
    } as unknown as KnownError;

    assert.equal(
      renderAppError(staleClientError, {
        EXPECTED: ({ message }) => message,
      }),
      'The server still explains the failure',
    );
  });
});
