var assert = require('assert');
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var helperServer = require('./helperServer');

var baseUrl = 'http://localhost:' + config.serverPort;

describe('GET /', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var page, $;

    it('should load successfully', function(callback) {
        request(baseUrl, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != 200) {
                return callback(new Error('bad status: ' + response.statusCode, {response, body}));
            }
            page = body;
            callback(null);
        });
    });
    it('should parse', function() {
        $ = cheerio.load(page);
    });
    it('should contain XC 101', function() {
        assert.ok($('td a:contains("XC 101")').length);
    });
});
