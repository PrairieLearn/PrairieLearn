
console.log('Starting monitor...');

var request = require('request');
var fs = require('fs');
var moment = require("moment-timezone");
var _ = require('underscore');

var requestOptions = {
    url: 'https://prairielearn.engr.illinois.edu:/backend/tam212/heartbeat',
    timeout: 10000
};

var testInterval = 60 * 1000; // ms
var nFailuresBeforeSend = 2;
var errorRateLimit = 10 * 60 * 1000; // ms
var heartbeatHourOfDay = 8;
var heartbeatRateLimit = 2 * 60 * 60 * 1000; // ms

var nCurrentFails = 0;
var errorLastTime = 0;
var heartbeatLastTime = 0;

var config = {};

// Twilio Credentials 
config.accountSid = 'FILL_IN_THIS_ACCOUNT_SID'; // override in config.json
config.authToken = 'FILL_IN_THIS_AUTH_TOKEN';
config.toNumber = "+19998887777";
config.fromNumber = "+12223334444";
config.timezone = 'America/Chicago';

var getTimestamp = function() {
    return moment().tz(config.timezone).format();
};

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

//require the Twilio module and create a REST client
var twilioClient = require('twilio')(config.accountSid, config.authToken);

var sendSMS = function(msg, callback) {
    msg = msg + ", " + getTimestamp();
    console.log("Sending SMS:", msg);
    twilioClient.messages.create({
	to: config.toNumber,
	from: config.fromNumber,
	body: msg,
    }, function(err, message) {
        if (err) {
	    console.log("Error sending SMS", err, message);
        } else {
            console.log("Successfully sent SMS");
            if (callback) callback();
        }
    });
};

var doTest = function() {
    request(requestOptions, function(error, response, body) {
        // heartbeat
        if (moment().tz(config.timezone).hour() === heartbeatHourOfDay)
            if (Date.now() - heartbeatLastTime > heartbeatRateLimit)
                sendSMS("heartbeat", function() {
                    heartbeatLastTime = Date.now();
                });

        // monitor
        var msg = null;
        if (!error && response.statusCode === 200) {
            if (!/System is up/.test(body))
                msg = "incorrect body";
        } else {
            msg = (error ? error : ("statusCode = " + response.statusCode));
        }

        // no error
        if (msg === null) {
            console.log(getTimestamp(), "ok");
            nCurrentFails = 0;
            return;
        }

        // error detected
        nCurrentFails++;
        console.log(getTimestamp(), "error", msg, nCurrentFails);
        if (nCurrentFails >= nFailuresBeforeSend) {
            if (Date.now() - errorLastTime > errorRateLimit) {
                sendSMS("error: " + msg, function() {
                    errorLastTime = Date.now();
                });
            } else {
                console.log(getTimestamp(), "SMS rate limit exceeded, no further action");
            }
        } else {
            console.log(getTimestamp(), "number of successive failures " + nCurrentFails + " is less than " + nFailuresBeforeSend + ", no futher action");
        }
    });
};

sendSMS("monitor started");
doTest();
setInterval(doTest, testInterval);
