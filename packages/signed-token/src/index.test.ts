import { assert, describe, it } from 'vitest';

import {
  checkSignedToken,
  checkSignedTokenPrefix,
  generatePrefixCsrfToken,
  generateSignedToken,
  getCheckedSignedTokenData,
} from './index.js';

const SECRET_KEY = 'test-secret-key';
const TEST_DATA = { url: '/test', authn_user_id: '123' };

describe('generateSignedToken', () => {
  it('generates a token that can be validated', () => {
    const token = generateSignedToken(TEST_DATA, SECRET_KEY);

    assert.isString(token);
    assert.isTrue(checkSignedToken(token, TEST_DATA, SECRET_KEY));
  });

  it('fails validation with wrong data', () => {
    const token = generateSignedToken(TEST_DATA, SECRET_KEY);

    assert.isFalse(checkSignedToken(token, { url: '/other', authn_user_id: '123' }, SECRET_KEY));
  });

  it('fails validation with wrong secret key', () => {
    const token = generateSignedToken(TEST_DATA, SECRET_KEY);

    assert.isFalse(checkSignedToken(token, TEST_DATA, 'wrong-secret'));
  });
});

describe('getCheckedSignedTokenData', () => {
  it('returns null for invalid tokens', () => {
    assert.isNull(getCheckedSignedTokenData('invalid', SECRET_KEY));
    assert.isNull(getCheckedSignedTokenData('', SECRET_KEY));
    assert.isNull(getCheckedSignedTokenData(123 as any, SECRET_KEY));
  });

  it('returns token data for valid tokens', () => {
    const token = generateSignedToken(TEST_DATA, SECRET_KEY);

    const result = getCheckedSignedTokenData(token, SECRET_KEY);
    assert.deepEqual(result, TEST_DATA);
  });
});

describe('generatePrefixCsrfToken', () => {
  it('generates a token with type prefix', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    const tokenData = getCheckedSignedTokenData(token, SECRET_KEY);
    assert.equal(tokenData.type, 'prefix');
    assert.equal(tokenData.url, TEST_DATA.url);
    assert.equal(tokenData.authn_user_id, TEST_DATA.authn_user_id);
  });
});

describe('checkSignedTokenPrefix', () => {
  it('validates token when request URL matches prefix exactly', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    assert.isTrue(checkSignedTokenPrefix(token, TEST_DATA, SECRET_KEY));
  });

  it('validates token when request URL starts with prefix', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    // We allow the route itself, both with and without a trailing slash.
    assert.isTrue(checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/test' }, SECRET_KEY));
    assert.isTrue(checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/test/' }, SECRET_KEY));

    // We allow deeply nested routes as well.
    assert.isTrue(checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/test/nested' }, SECRET_KEY));
    assert.isTrue(
      checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/test/nested/method' }, SECRET_KEY),
    );
  });

  it('rejects token when request URL does not start with prefix', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    assert.isFalse(checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/other/path' }, SECRET_KEY));

    // We'll forbid paths that match the prefix only partially. In other words,
    // we'll treat the prefix as if it implicitly ends with a trailing slash.
    assert.isFalse(checkSignedTokenPrefix(token, { ...TEST_DATA, url: '/testy' }, SECRET_KEY));
  });

  it('rejects token when user ID does not match', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    assert.isFalse(
      checkSignedTokenPrefix(token, { ...TEST_DATA, authn_user_id: '456' }, SECRET_KEY),
    );
  });

  it('rejects non-prefix tokens', () => {
    // Generate a regular token (not a prefix token)
    const regularToken = generateSignedToken(TEST_DATA, SECRET_KEY);

    // Should fail because it doesn't have type: 'prefix'
    assert.isFalse(checkSignedTokenPrefix(regularToken, TEST_DATA, SECRET_KEY));
  });

  it('rejects tampered tokens', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    // Tamper with the token
    const tamperedToken = token.slice(0, -5) + 'XXXXX';
    assert.isFalse(checkSignedTokenPrefix(tamperedToken, TEST_DATA, SECRET_KEY));
  });

  it('rejects tokens with wrong secret key', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    assert.isFalse(checkSignedTokenPrefix(token, TEST_DATA, 'wrong-secret'));
  });

  it('rejects invalid token formats', () => {
    assert.isFalse(checkSignedTokenPrefix('invalid', TEST_DATA, SECRET_KEY));
    assert.isFalse(checkSignedTokenPrefix('', TEST_DATA, SECRET_KEY));
  });
});
