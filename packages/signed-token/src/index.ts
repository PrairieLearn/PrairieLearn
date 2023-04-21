import base64url from 'base64url';
import debugModule from 'debug';
import _ from 'lodash';
import crypto from 'node:crypto';

const debug = debugModule('prairielearn:csrf');
const sep = '.';

interface CheckOptions {
  maxAge?: number;
}

export function generateSignedToken(data: any, secretKey: string) {
  debug(`generateSignedToken(): data = ${JSON.stringify(data)}`);
  debug(`generateSignedToken(): secretKey = ${secretKey}`);
  const dataJSON = JSON.stringify(data);
  const dataString = base64url.encode(dataJSON);
  const dateString = new Date().getTime().toString(36);
  const checkString = dateString + sep + dataString;
  const signature = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const encodedSignature = base64url.encode(signature);
  debug(
    `generateSignedToken(): ${JSON.stringify({
      dataString,
      dateString,
      checkString,
      encodedSignature,
    })}`
  );
  const token = encodedSignature + sep + checkString;
  debug(`generateSignedToken(): token = ${token}`);
  return token;
}

export function getCheckedSignedTokenData(
  token: string,
  secretKey: string,
  options: CheckOptions = {}
) {
  debug(`getCheckedSignedTokenData(): token = ${token}`);
  debug(`getCheckedSignedTokenData(): secretKey = ${secretKey}`);
  debug(`getCheckedSignedTokenData(): options = ${JSON.stringify(options)}`);
  if (!_.isString(token)) {
    debug(`getCheckedSignedTokenData(): FAIL - token is not string`);
    return null;
  }

  // break token apart into the three components
  const match = token.split(sep);
  if (match == null) {
    debug(`getCheckedSignedTokenData(): FAIL - could not split token`);
    return null;
  }
  const tokenSignature = match[0];
  const tokenDateString = match[1];
  const tokenDataString = match[2];

  // check the signature
  const checkString = tokenDateString + sep + tokenDataString;
  const checkSignature = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const encodedCheckSignature = base64url.encode(checkSignature);
  if (encodedCheckSignature !== tokenSignature) {
    debug(
      `getCheckedSignedTokenData(): FAIL - signature mismatch: checkSig=${encodedCheckSignature} != tokenSig=${tokenSignature}`
    );
    return null;
  }

  // check the age if we have the maxAge parameter
  if (options.maxAge != null) {
    let tokenDate;
    try {
      tokenDate = new Date(parseInt(tokenDateString, 36));
    } catch (e) {
      debug(`getCheckedSignedTokenData(): FAIL - could not parse date: ${tokenDateString}`);
      return null;
    }
    const currentTime = Date.now();
    const elapsedTime = currentTime - tokenDate.getTime();
    if (elapsedTime > options.maxAge) {
      debug(
        `getCheckedSignedTokenData(): FAIL - too old: elapsedTime=${elapsedTime} > maxAge=${options.maxAge}`
      );
      return null;
    }
  }

  // get the data
  let tokenDataJSON, tokenData;
  try {
    tokenDataJSON = base64url.decode(tokenDataString);
  } catch (e) {
    debug(`getCheckedSignedTokenData(): FAIL - could not base64 decode: ${tokenDateString}`);
    return null;
  }
  try {
    tokenData = JSON.parse(tokenDataJSON);
  } catch (e) {
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
  options: CheckOptions = {}
) {
  debug(`checkSignedToken(): token = ${token}`);
  debug(`checkSignedToken(): data = ${JSON.stringify(data)}`);
  debug(`checkSignedToken(): secretKey = ${secretKey}`);
  debug(`checkSignedToken(): options = ${JSON.stringify(options)}`);
  debug(`checkSignedToken(): data = ${JSON.stringify(data)}`);
  const tokenData = getCheckedSignedTokenData(token, secretKey, options);
  debug(`checkSignedToken(): tokenData = ${JSON.stringify(tokenData)}`);
  if (tokenData == null) return false;
  if (!_.isEqual(data, tokenData)) return false;
  return true;
}
