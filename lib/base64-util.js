const base64 = require('base-64');
const utf8 = require('utf8');

module.exports.b64EncodeUnicode = function(str) {
    return base64.encode(utf8.encode(str));
};

module.exports.b64DecodeUnicode = function(str) {
    return utf8.decode(base64.decode(str));
};
