import { assert, describe, it } from 'vitest';

import {
  checkSignedToken,
  checkSignedTokenPrefix,
  generatePrefixCsrfToken,
  generateSignedToken,
  getCheckedSignedTokenData,
} from './index.js';

const SECRET_KEY = 'test-secret-key';
const OLD_SECRET_KEY = 'old-test-secret-key';
const TEST_DATA = { url: '/test', authn_user_id: '123' };
const TEST_DATA_WITH_ALTERNATE_CLAIM = { url: '/test', user_id: '123' };

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

  it('uses the first key in a key ring to generate a token', () => {
    const token = generateSignedToken(TEST_DATA, [SECRET_KEY, OLD_SECRET_KEY]);

    assert.isTrue(checkSignedToken(token, TEST_DATA, SECRET_KEY));
    assert.isFalse(checkSignedToken(token, TEST_DATA, OLD_SECRET_KEY));
  });

  it('validates a token with a fallback key', () => {
    const token = generateSignedToken(TEST_DATA, OLD_SECRET_KEY);

    assert.isTrue(checkSignedToken(token, TEST_DATA, [SECRET_KEY, OLD_SECRET_KEY]));
  });

  it('fails validation when no key matches', () => {
    const token = generateSignedToken(TEST_DATA, OLD_SECRET_KEY);

    assert.isFalse(checkSignedToken(token, TEST_DATA, [SECRET_KEY, 'another-secret']));
  });

  it('rejects an empty key ring', () => {
    assert.throws(
      // @ts-expect-error Testing runtime validation for JavaScript callers.
      () => generateSignedToken(TEST_DATA, []),
      'Secret key ring must contain at least one key',
    );
  });
});

describe('getCheckedSignedTokenData', () => {
  it('returns null for invalid tokens', () => {
    assert.isNull(getCheckedSignedTokenData('invalid', SECRET_KEY));
    assert.isNull(getCheckedSignedTokenData('', SECRET_KEY));
    // @ts-expect-error Testing runtime input validation.
    assert.isNull(getCheckedSignedTokenData(123, SECRET_KEY));
  });

  it('returns token data for valid tokens', () => {
    const token = generateSignedToken(TEST_DATA, SECRET_KEY);

    const result = getCheckedSignedTokenData(token, SECRET_KEY);
    assert.deepEqual(result, TEST_DATA);
  });
});

describe('generatePrefixCsrfToken', () => {
  it('generates a token with type prefix', () => {
    const token = generatePrefixCsrfToken(TEST_DATA_WITH_ALTERNATE_CLAIM, SECRET_KEY);

    const tokenData = getCheckedSignedTokenData(token, SECRET_KEY);
    assert.equal(tokenData.type, 'prefix');
    assert.equal(tokenData.url, TEST_DATA_WITH_ALTERNATE_CLAIM.url);
    assert.equal(tokenData.user_id, TEST_DATA_WITH_ALTERNATE_CLAIM.user_id);
  });

  it('rejects data without a claim', () => {
    assert.throws(
      // @ts-expect-error Testing runtime validation for JavaScript callers.
      () => generatePrefixCsrfToken({ url: '/test' }, SECRET_KEY),
      'Prefix CSRF token data must contain at least one claim',
    );
  });

  it('rejects the reserved type claim', () => {
    assert.throws(
      () =>
        generatePrefixCsrfToken(
          {
            ...TEST_DATA_WITH_ALTERNATE_CLAIM,
            // @ts-expect-error Testing runtime validation for JavaScript callers.
            type: 'custom',
          },
          SECRET_KEY,
        ),
      'Prefix CSRF token data cannot contain the reserved "type" claim',
    );
  });
});

describe('checkSignedTokenPrefix', () => {
  it('validates an alternate claim', () => {
    const token = generatePrefixCsrfToken(TEST_DATA_WITH_ALTERNATE_CLAIM, SECRET_KEY);

    assert.isTrue(checkSignedTokenPrefix(token, TEST_DATA_WITH_ALTERNATE_CLAIM, SECRET_KEY));
  });

  it('validates token when request URL matches prefix exactly', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

    assert.isTrue(checkSignedTokenPrefix(token, TEST_DATA, SECRET_KEY));
  });

  it('validates token when request URL starts with prefix', () => {
    const token = generatePrefixCsrfToken(TEST_DATA, SECRET_KEY);

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

  it('rejects token when claims do not match exactly', () => {
    const token = generatePrefixCsrfToken(TEST_DATA_WITH_ALTERNATE_CLAIM, SECRET_KEY);

    assert.isFalse(
      checkSignedTokenPrefix(
        token,
        { ...TEST_DATA_WITH_ALTERNATE_CLAIM, user_id: '456' },
        SECRET_KEY,
      ),
    );
    assert.isFalse(
      checkSignedTokenPrefix(
        token,
        { ...TEST_DATA_WITH_ALTERNATE_CLAIM, role: 'student' },
        SECRET_KEY,
      ),
    );
  });

  it('rejects a prefix token without a claim', () => {
    const token = generateSignedToken({ url: '/test', type: 'prefix' }, SECRET_KEY);

    // @ts-expect-error Testing runtime validation for JavaScript callers.
    assert.isFalse(checkSignedTokenPrefix(token, { url: '/test' }, SECRET_KEY));
  });

  it('rejects the reserved type claim in request data', () => {
    const token = generatePrefixCsrfToken(TEST_DATA_WITH_ALTERNATE_CLAIM, SECRET_KEY);

    assert.isFalse(
      checkSignedTokenPrefix(
        token,
        {
          ...TEST_DATA_WITH_ALTERNATE_CLAIM,
          // @ts-expect-error Testing runtime validation for JavaScript callers.
          type: 'prefix',
        },
        SECRET_KEY,
      ),
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
