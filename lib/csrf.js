const _ = require('lodash');
const hmacSha256 = require('crypto-js/hmac-sha256');
const base64url = require('base64url');

const sep = '.';

module.exports = {
    generateToken: function(data, secretKey) {
        var dataJSON = JSON.stringify(data);
        var dataString = base64url.encode(dataJSON);
        var dateString = (new Date).getTime().toString(36);
        var checkString = dateString + sep + dataString;
        var signature = base64url.encode(hmacSha256(checkString, secretKey).toString());
        var token = signature + sep + checkString;
        return token;
    },

    getCheckedData: function(token, secretKey, options) {
        if (!_.isString(token)) return null;
        options = options || {};

        // break token apart into the three components
        var match = token.split(sep);
        if (match == null) return null;
        var tokenSignature = match[0];
        var tokenDateString = match[1];
        var tokenDataString = match[2];

        // check the signature
        var checkString = tokenDateString + sep + tokenDataString;
        var checkSignature = base64url.encode(hmacSha256(checkString, secretKey).toString());
        if (checkSignature !== tokenSignature) return null;

        // check the age if we have the maxAge parameter
        if (options.maxAge != null) {
            var tokenDate;
            try {
                tokenDate = new Date(parseInt(tokenDateString, 36));
            } catch (e) {
                return null;
            }
            var currentTime = options.req_date ? Date.parse(options.req_date) : Date.now();
            var elapsedTime = currentTime - tokenDate.getTime();
            if (elapsedTime > options.maxAge) return null;
        }

        // get the data
        var tokenData;
        try {
            var tokenDataJSON = base64url.decode(tokenDataString);
            tokenData = JSON.parse(tokenDataJSON);
        } catch (e) {
            return null;
        }
        return tokenData;
    },

    checkToken: function(token, data, secretKey, options) {
        var tokenData = this.getCheckedData(token, secretKey, options);
        if (tokenData == null) return false;
        if (!_.isEqual(data, tokenData)) return false;
        return true;
    },
};
