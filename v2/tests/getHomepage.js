var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('assert');
var request = require('request');
var cheerio = require('cheerio');

var testHelperServer = require('./testHelperServer');

var baseUrl = 'http://localhost:3000/pl';

describe('GET /', function() {

    before("set up testing server", testHelperServer.before);
    after("shut down testing server", testHelperServer.after);

    var page, $;
    
    it('should load successfully', function(callback) {
        request(baseUrl, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != 200) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            page = body;
            callback(null);
        })
    });
    it('should parse', function() {
        $ = cheerio.load(page);
    });
    it('should contain TPL 101', function() {
        assert.ok($('td a:contains("TPL 101")').length)
    });
});
