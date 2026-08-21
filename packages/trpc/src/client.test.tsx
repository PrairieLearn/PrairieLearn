import { TRPCClientError } from '@trpc/client';
import { assert, describe, it } from 'vitest';

import { getAppError, renderAppError } from './client.js';

interface ExpectedError {
  code: 'EXPECTED';
  detail: string;
}

describe('getAppError', () => {
  it('extracts typed metadata from a tRPC client error', () => {
    const error = new TRPCClientError('Expected failure');
    Object.defineProperty(error, 'data', {
      value: { appError: { code: 'EXPECTED', detail: 'more context' } },
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
