var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var helperServer = require('./helperServer');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';

describe('Administrator pages', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  var page, elemList;

  describe('1. view administrator overview page', function () {
    it('should load successfully', function (callback) {
      locals.administratorOverviewUrl = locals.baseUrl + '/administrator/overview';
      request(locals.administratorOverviewUrl, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should contain QA 101', function () {
      elemList = locals.$('td:contains("QA 101")');
      assert.lengthOf(elemList, 1);
    });
  });
});
