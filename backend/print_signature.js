
var outputMode, extraArgs;

if (process.argv.length >= 3 && process.argv[2] == '--headers') {
    outputMode = 'headers';
    extraArgs = process.argv.slice(3);
} else {
    outputMode = 'full';
    extraArgs = process.argv.slice(2);
}

if (extraArgs.length < 2 || extraArgs.length > 3) {
    console.log("Usage: node print_signature.js [--headers] <authUID> <authName> [configFile]");
    console.log("");
    console.log("Example: node print_signature.js netid@illinois.edu 'FirstName LastName'");
    process.exit();
}

var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var async = require("async");
var hmacSha256 = require("crypto-js/hmac-sha256");

var config = {};

config.secretKey = "THIS_IS_THE_SECRET_KEY"; // override in config.json

var configFilename = 'config.json';
var useConfigFile = false;

if (extraArgs.length == 3) {
    useConfigFile = true;
    configFilename = extraArgs[2];
}

if (fs.existsSync(configFilename)) {
    useConfigFile = true;
}

if (useConfigFile) {
    try {
        fileConfig = JSON.parse(fs.readFileSync(configFilename, {encoding: 'utf8'}));
        _.defaults(fileConfig, config);
        config = fileConfig;
    } catch (e) {
        console.log("Error reading " + configFilename, e);
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

uid = extraArgs[0];
name = extraArgs[1];
date = (new Date()).toISOString();
signature = computeSignature(uid, name, date, config);

function headers() {
    return '-H "X-Auth-UID: ' + uid
        + '" -H "X-Auth-Name: ' + name
        + '" -H "X-Auth-Date: ' + date
        + '" -H "X-Auth-Signature: ' + signature
        + '" -H "X-User-UID: ' + uid
        + '" -H "X-User-Name: ' + name
        + '" -H "X-User-Role: Superuser"'
        + ' -H "X-Mode: Default"';
}

if (outputMode == 'full') {
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
    console.log('curl ' + headers() + ' <url>');
    console.log('');
    console.log('Curl command to export and save all user scores:');
    console.log('');
    console.log('curl -O ' + headers() + ' <url>/export.csv');
    console.log('');
} else if (outputMode == 'headers') {
    console.log(headers());
}
