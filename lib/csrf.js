const _ = require('lodash');
const hmacSha256 = require('crypto-js/hmac-sha256');
const base64url = require('base64url');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sep = '.';

module.exports = {
    generateToken: function(data, secretKey) {
        debug(`generateToken(): data = ${JSON.stringify(data)}`);
        debug(`generateToken(): secretKey = ${secretKey}`);
        var dataJSON = JSON.stringify(data);
        var dataString = base64url.encode(dataJSON);
        var dateString = (new Date).getTime().toString(36);
        var checkString = dateString + sep + dataString;
        var signature = base64url.encode(hmacSha256(checkString, secretKey).toString());
        debug(`generateToken(): ${JSON.stringify({dataString, dateString, checkString, signature})}`);
        var token = signature + sep + checkString;
        debug(`generateToken(): token = ${token}`);
        return token;
    },

    getCheckedData: function(token, secretKey, options) {
        debug(`getCheckedData(): token = ${token}`);
        debug(`getCheckedData(): secretKey = ${secretKey}`);
        debug(`getCheckedData(): options = ${JSON.stringify(options)}`);
        if (!_.isString(token)) {
            debug(`getCheckedData(): FAIL - token is not string`);
            return null;
        }
        options = options || {};

        // break token apart into the three components
        var match = token.split(sep);
        if (match == null) {
            debug(`getCheckedData(): FAIL - could not split token`);
            return null;
        }
        var tokenSignature = match[0];
        var tokenDateString = match[1];
        var tokenDataString = match[2];

        // check the signature
        var checkString = tokenDateString + sep + tokenDataString;
        var checkSignature = base64url.encode(hmacSha256(checkString, secretKey).toString());
        if (checkSignature !== tokenSignature) {
            debug(`getCheckedData(): FAIL - signature mismatch: checkSig=${checkSignature} != tokenSig=${tokenSignature}`);
            return null;
        }

        // check the age if we have the maxAge parameter
        if (options.maxAge != null) {
            var tokenDate;
            try {
                tokenDate = new Date(parseInt(tokenDateString, 36));
            } catch (e) {
                debug(`getCheckedData(): FAIL - could not parse date: ${tokenDateString}`);
                return null;
            }
            var currentTime = options.req_date ? Date.parse(options.req_date) : Date.now();
            var elapsedTime = currentTime - tokenDate.getTime();
            if (elapsedTime > options.maxAge) {
                debug(`getCheckedData(): FAIL - too old: elapsedTime=${elapsedTime} > maxAge=${maxAge}`);
                return null;
            }
        }

        // get the data
        var tokenDataJSON, tokenData;
        try {
            tokenDataJSON = base64url.decode(tokenDataString);
        } catch (e) {
            debug(`getCheckedData(): FAIL - could not base64 decode: ${tokenDateString}`);
            return null;
        }
        try {
            tokenData = JSON.parse(tokenDataJSON);
        } catch (e) {
            debug(`getCheckedData(): FAIL - could not parse JSON: ${tokenDataJSON}`);
            return null;
        }
        debug(`getCheckedData(): tokenData = ${tokenData}`);
        return tokenData;
    },

    checkToken: function(token, data, secretKey, options) {
        debug(`checkToken(): token = ${token}`);
        debug(`checkToken(): data = ${JSON.stringify(data)}`);
        debug(`checkToken(): secretKey = ${secretKey}`);
        debug(`checkToken(): options = ${JSON.stringify(options)}`);
        debug(`checkToken(): data = ${JSON.stringify(data)}`);
        var tokenData = this.getCheckedData(token, secretKey, options);
        debug(`checkToken(): tokenData = ${JSON.stringify(tokenData)}`);
        if (tokenData == null) return false;
        if (!_.isEqual(data, tokenData)) return false;
        return true;
    },
};
