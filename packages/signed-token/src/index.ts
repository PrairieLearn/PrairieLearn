import crypto from 'node:crypto';

import base64url from 'base64url';
import debugfn from 'debug';
import { isEqual } from 'es-toolkit';

const debug = debugfn('prairielearn:csrf');
const sep = '.';

interface CheckOptions {
  maxAge?: number;
}

export function generateSignedToken(data: any, secretKey: string) {
  debug(`generateSignedToken(): data = ${JSON.stringify(data)}`);
  debug(`generateSignedToken(): secretKey = ${secretKey}`);
  const dataJSON = JSON.stringify(data);
  const dataString = base64url.default.encode(dataJSON);
  const dateString = Date.now().toString(36);
  const checkString = dateString + sep + dataString;
  const signature = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const encodedSignature = base64url.default.encode(signature);
  debug(
    `generateSignedToken(): ${JSON.stringify({
      dataString,
      dateString,
      checkString,
      encodedSignature,
    })}`,
  );
  const token = encodedSignature + sep + checkString;
  debug(`generateSignedToken(): token = ${token}`);
  return token;
}

export function getCheckedSignedTokenData(
  token: string,
  secretKey: string,
  options: CheckOptions = {},
) {
  debug(`getCheckedSignedTokenData(): token = ${token}`);
  debug(`getCheckedSignedTokenData(): secretKey = ${secretKey}`);
  debug(`getCheckedSignedTokenData(): options = ${JSON.stringify(options)}`);
  if (typeof token !== 'string') {
    debug('getCheckedSignedTokenData(): FAIL - token is not string');
    return null;
  }

  // break token apart into the three components
  const match = token.split(sep);
  if (match == null) {
    debug('getCheckedSignedTokenData(): FAIL - could not split token');
    return null;
  }
  const tokenSignature = match[0];
  const tokenDateString = match[1];
  const tokenDataString = match[2];

  // check the signature
  const checkString = tokenDateString + sep + tokenDataString;
  const checkSignature = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const encodedCheckSignature = base64url.default.encode(checkSignature);
  if (encodedCheckSignature !== tokenSignature) {
    debug(
      `getCheckedSignedTokenData(): FAIL - signature mismatch: checkSig=${encodedCheckSignature} != tokenSig=${tokenSignature}`,
    );
    return null;
  }

  // check the age if we have the maxAge parameter
  if (options.maxAge != null) {
    let tokenDate;
    try {
      tokenDate = new Date(Number.parseInt(tokenDateString, 36));
    } catch {
      debug(`getCheckedSignedTokenData(): FAIL - could not parse date: ${tokenDateString}`);
      return null;
    }
    const currentTime = Date.now();
    const elapsedTime = currentTime - tokenDate.getTime();
    if (elapsedTime > options.maxAge) {
      debug(
        `getCheckedSignedTokenData(): FAIL - too old: elapsedTime=${elapsedTime} > maxAge=${options.maxAge}`,
      );
      return null;
    }
  }

  // get the data
  let tokenDataJSON, tokenData;
  try {
    tokenDataJSON = base64url.default.decode(tokenDataString);
  } catch {
    debug(`getCheckedSignedTokenData(): FAIL - could not base64 decode: ${tokenDateString}`);
    return null;
  }
  try {
    tokenData = JSON.parse(tokenDataJSON);
  } catch {
    debug(`getCheckedSignedTokenData(): FAIL - could not parse JSON: ${tokenDataJSON}`);
    return null;
  }
  debug(`getCheckedSignedTokenData(): tokenData = ${tokenData}`);
  return tokenData;
}

export function checkSignedToken(
  token: string,
  data: any,
  secretKey: string,
  options: CheckOptions = {},
) {
  debug(`checkSignedToken(): token = ${token}`);
  debug(`checkSignedToken(): data = ${JSON.stringify(data)}`);
  debug(`checkSignedToken(): secretKey = ${secretKey}`);
  debug(`checkSignedToken(): options = ${JSON.stringify(options)}`);
  debug(`checkSignedToken(): data = ${JSON.stringify(data)}`);
  const tokenData = getCheckedSignedTokenData(token, secretKey, options);
  debug(`checkSignedToken(): tokenData = ${JSON.stringify(tokenData)}`);
  if (tokenData == null) return false;
  if (!isEqual(data, tokenData)) return false;
  return true;
}

/**
 * Generates a CSRF token that is valid for a URL prefix instead of an exact URL.
 * This is useful for tRPC and similar APIs where a single token should be valid
 * for all sub-routes under a prefix (e.g., `/foo/bar/trpc` is valid for
 * `/foo/bar/trpc/getUser` and `/foo/bar/trpc/updateUser`).
 */
export function generatePrefixCsrfToken(
  data: { url: string; authn_user_id: string },
  secretKey: string,
) {
  return generateSignedToken({ ...data, type: 'prefix' }, secretKey);
}

/**
 * Validates a prefix-based CSRF token. The token's URL must be a prefix of the
 * request URL for validation to succeed.
 *
 * @param token - The CSRF token to validate
 * @param requestData - The request URL and authenticated user ID
 * @param requestData.url - The request URL to validate against
 * @param requestData.authn_user_id - The authenticated user ID to validate against
 * @param secretKey - The secret key used for signing
 * @param options - Optional settings like maxAge
 * @returns true if the token is valid, false otherwise
 */
export function checkSignedTokenPrefix(
  token: string,
  requestData: { url: string; authn_user_id: string },
  secretKey: string,
  options: CheckOptions = {},
): boolean {
  debug(`checkSignedTokenPrefix(): token = ${token}`);
  debug(`checkSignedTokenPrefix(): requestData = ${JSON.stringify(requestData)}`);

  const tokenData = getCheckedSignedTokenData(token, secretKey, options);
  if (tokenData == null) return false;

  // Verify this is a prefix token (prevents token type confusion)
  if (tokenData.type !== 'prefix') {
    debug('checkSignedTokenPrefix(): FAIL - token type is not prefix');
    return false;
  }

  // Verify user ID matches exactly
  if (tokenData.authn_user_id !== requestData.authn_user_id) {
    debug('checkSignedTokenPrefix(): FAIL - authn_user_id mismatch');
    return false;
  }

  // Verify the request URL starts with the token's prefix URL.
  // We treat the prefix as implicitly ending with a trailing slash, so
  // `/test` matches `/test`, `/test/`, and `/test/nested`, but NOT `/testy`.
  const prefixUrl = tokenData.url;
  const requestUrl = requestData.url;
  const normalizedPrefix = prefixUrl.endsWith('/') ? prefixUrl : prefixUrl + '/';
  if (requestUrl !== prefixUrl && !requestUrl.startsWith(normalizedPrefix)) {
    debug(
      `checkSignedTokenPrefix(): FAIL - URL prefix mismatch: ${requestUrl} does not start with ${prefixUrl}`,
    );
    return false;
  }

  debug('checkSignedTokenPrefix(): SUCCESS');
  return true;
}
