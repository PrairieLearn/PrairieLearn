var _ = require('lodash');
var hmacSha256 = require('crypto-js/hmac-sha256');

var config = require('./config');

module.exports = {
    generateToken: function(data) {
        var dataJSON = JSON.stringify(data);
        var dateString = (new Date()).toISOString();
        var checkString = dateString + '_' + dataJSON;
        var signature = hmacSha256(checkString, config.secretKey).toString();
        var token = signature + '_' + checkString;
        return token;
    },

    checkToken: function(token, data, maxAge) {
        var match = token.match(/^([^_]+)_([^_]+)_(.+)$/);
        if (match == null) return false;
        var tokenSignature = match[1];
        var tokenDateString = match[2];
        var tokenDataJSON = match[3];
        var checkString = tokenDateString + '_' + tokenDataJSON;
        var checkSignature = hmacSha256(checkString, config.secretKey).toString();
        if (checkSignature !== tokenSignature) return false;
        var tokenData;
        try {
            tokenData = JSON.parse(tokenDataJSON);
        } catch (e) {
            return false;
        }
        if (!_.isEqual(data, tokenData)) return false;
        if (maxAge) {
            var tokenDate;
            try {
                tokenDate = new Date(tokenDateString);
            } catch (e) {
                return false;
            }
            var elapsedTime = Date.now() - tokenDate.getTime();
            if (elapsedTime > maxAge) return false;
        }
        return true;
    },
};
