var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

const { config } = require('../lib/config');
var helperServer = require('./helperServer');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';

describe('Administrator pages', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  var page, elemList;

  describe('1. view administrator admins list page', function () {
    locals.administratorAdminsUrl = locals.baseUrl + '/administrator/admins';
    it('should load successfully', function (callback) {
      request(locals.administratorAdminsUrl, function (error, response, body) {
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
    it('should contain button labeled Add administrator', function () {
      elemList = locals.$('#administratorInsertButton span:contains("Add administrator")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('2. view administrator settings page', function () {
    locals.administratorSettingsUrl = locals.baseUrl + '/administrator/settings';
    it('should load successfully', function (callback) {
      request(locals.administratorSettingsUrl, function (error, response, body) {
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
  });

  describe('3. view administrator courses page', function () {
    locals.administratorCoursesUrl = locals.baseUrl + '/administrator/courses';
    it('should load successfully', function (callback) {
      request(locals.administratorCoursesUrl, function (error, response, body) {
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
    it('should contain default institution', function () {
      elemList = locals.$('#institutions td:first-child:contains("Default")');
      assert.lengthOf(elemList, 1);
    });
    it('should contain course QA 101', function () {
      elemList = locals.$('#courses td:contains("QA 101")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('4. view administrator exam-mode networks page', function () {
    locals.administratorNetworksUrl = locals.baseUrl + '/administrator/networks';
    it('should load successfully', function (callback) {
      request(locals.administratorNetworksUrl, function (error, response, body) {
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
  });
});
