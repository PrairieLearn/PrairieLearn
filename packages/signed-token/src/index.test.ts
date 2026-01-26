import { assert, describe, it } from 'vitest';

import { checkSignedToken, generateSignedToken, getCheckedSignedTokenData } from './index.js';

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
