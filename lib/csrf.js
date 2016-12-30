var _ = require('lodash');
var hmacSha256 = require('crypto-js/hmac-sha256');

module.exports = {
    generateToken: function(data, secretKey) {
        var dataJSON = JSON.stringify(data);
        var dataString = (Buffer.from(dataJSON, 'utf8')).toString('base64');
        var dateString = (new Date()).toISOString();
        var checkString = dateString + '_' + dataString;
        var signature = hmacSha256(checkString, secretKey).toString();
        var token = signature + '_' + checkString;
        return token;
    },

    getCheckedData: function(token, secretKey, options) {
        if (!_.isString(token)) return null;
        options = options || {};

        // break token apart into the three components
        var match = token.match(/^([^_]+)_([^_]+)_([^_]+)$/);
        if (match == null) return null;
        var tokenSignature = match[1];
        var tokenDateString = match[2];
        var tokenDataString = match[3];

        // check the signature
        var checkString = tokenDateString + '_' + tokenDataString;
        var checkSignature = hmacSha256(checkString, secretKey).toString();
        if (checkSignature !== tokenSignature) return null;

        // check the age if we have the maxAge parameter
        if (options.maxAge != null) {
            var tokenDate;
            try {
                tokenDate = new Date(tokenDateString);
            } catch (e) {
                return null;
            }
            var elapsedTime = Date.now() - tokenDate.getTime();
            if (elapsedTime > options.maxAge) return null;
        }

        // get the data
        var tokenData;
        try {
            var tokenDataJSON = (Buffer.from(tokenDataString, 'base64')).toString('utf8');
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
