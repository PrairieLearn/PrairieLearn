import { TRPC_ERROR_CODES_BY_KEY, type TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc';
import { assert, describe, it } from 'vitest';

import { formatTrpcErrorResponse, isMultipartRequest, isTrpcRequest } from './express.js';

describe('isTrpcRequest', () => {
  it('requires both the tRPC header and mount path segment', () => {
    assert.isTrue(
      isTrpcRequest({
        header: (name) => (name === 'X-TRPC' ? 'true' : undefined),
        originalUrl: '/pl/course/1/trpc/widgets.list?input=%7B%7D',
      }),
    );
    assert.isFalse(
      isTrpcRequest({
        header: (name) => (name === 'X-TRPC' ? 'true' : undefined),
        originalUrl: '/pl/course/1/not-trpc',
      }),
    );
  });
});

describe('isMultipartRequest', () => {
  it('matches the header name and media type case-insensitively', () => {
    assert.isTrue(
      isMultipartRequest({
        headers: { 'Content-Type': 'Multipart/Form-Data; boundary=example' },
      }),
    );
  });

  it('rejects non-multipart and missing content types', () => {
    assert.isFalse(isMultipartRequest({ headers: { 'content-type': 'application/json' } }));
    assert.isFalse(isMultipartRequest({ headers: {} }));
  });
});

describe('formatTrpcErrorResponse', () => {
  it.each<[number, TRPC_ERROR_CODE_KEY]>([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [402, 'PAYMENT_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_SUPPORTED'],
    [408, 'TIMEOUT'],
    [409, 'CONFLICT'],
    [412, 'PRECONDITION_FAILED'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [422, 'UNPROCESSABLE_CONTENT'],
    [428, 'PRECONDITION_REQUIRED'],
    [429, 'TOO_MANY_REQUESTS'],
    [499, 'CLIENT_CLOSED_REQUEST'],
    [500, 'INTERNAL_SERVER_ERROR'],
    [501, 'NOT_IMPLEMENTED'],
    [502, 'BAD_GATEWAY'],
    [503, 'SERVICE_UNAVAILABLE'],
    [504, 'GATEWAY_TIMEOUT'],
  ])('maps HTTP %i to %s', (status, code) => {
    const response = formatTrpcErrorResponse({ status, message: 'Request failed' });

    assert.equal(response.error.json.code, TRPC_ERROR_CODES_BY_KEY[code]);
    assert.equal(response.error.json.data.code, code);
    assert.equal(response.error.json.data.httpStatus, status);
  });

  it('falls back to INTERNAL_SERVER_ERROR for an unknown status', () => {
    const response = formatTrpcErrorResponse({ status: 418, message: 'Unexpected status' });

    assert.equal(response.error.json.code, TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR);
    assert.equal(response.error.json.data.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(response.error.json.data.httpStatus, 418);
  });

  it('includes a stack only when one is supplied', () => {
    const withStack = formatTrpcErrorResponse({
      status: 500,
      message: 'Failed',
      stack: 'stack trace',
    });
    const withoutStack = formatTrpcErrorResponse({ status: 500, message: 'Failed' });

    assert.equal(withStack.error.json.data.stack, 'stack trace');
    assert.notProperty(withoutStack.error.json.data, 'stack');
  });
});
