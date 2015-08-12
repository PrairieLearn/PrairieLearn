
var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var async = require("async");
var hmacSha256 = require("crypto-js/hmac-sha256");

var config = {};

config.secretKey = "THIS_IS_THE_SECRET_KEY"; // override in config.json

if (fs.existsSync('config.json')) {
    try {
        fileConfig = JSON.parse(fs.readFileSync('config.json', {encoding: 'utf8'}));
        _.defaults(fileConfig, config);
        config = fileConfig;
    } catch (e) {
        console.log("Error reading config.json:", e);
        process.exit(1);
    }
} else {
    console.log("config.json not found, using default configuration...");
}

var computeSignature = function(uid, name, date, config) {
    var checkData = uid + "/" + name + "/" + date;
    var signature = hmacSha256(checkData, config.secretKey);
    signature = signature.toString();
    return signature;
};

if (process.argv.length != 4) {
    console.log("Usage: node print_signature.js <authUID> <authName>");
    console.log("");
    console.log("Example: node print_signature.js netid@illinois.edu 'FirstName LastName'");
    process.exit();
}

uid = process.argv[2];
name = process.argv[3];
date = (new Date()).toISOString();
signature = computeSignature(uid, name, date, config);

console.log('');
console.log('Required authorization headers:');
console.log('');
console.log('X-Auth-UID: ' + uid);
console.log('X-Auth-Name: ' + name);
console.log('X-Auth-date: ' + date);
console.log('X-Auth-Signature: ' + signature);
console.log('');
console.log('Generic curl command to access the server');
console.log('');
console.log('curl -H "X-Auth-UID: ' + uid + '" -H "X-Auth-Name: ' + name + '" -H "X-Auth-Date: ' + date + '" -H "X-Auth-Signature: ' + signature + '" -H "X-User-UID: ' + uid + '" -H "X-User-Name: ' + name + '" -H "X-User-Role: Superuser" -H "X-Mode: Default" <url>');
console.log('');
console.log('Curl command to export and save all user scores:');
console.log('');
console.log('curl -O -H "X-Auth-UID: ' + uid + '" -H "X-Auth-Name: ' + name + '" -H "X-Auth-Date: ' + date + '" -H "X-Auth-Signature: ' + signature + '" -H "X-User-UID: ' + uid + '" -H "X-User-Name: ' + name + '" -H "X-User-Role: Superuser" -H "X-Mode: Default" <url>/export.csv');
console.log('');
