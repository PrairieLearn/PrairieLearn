const { config } = require('../lib/config');
const request = require('request');
const helperServer = require('./helperServer');
const cheerio = require('cheerio');
const assert = require('chai').assert;

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceUrl + '/assessments';

const storedConfig = {};

var newAssessmentsUrl;

describe('Test student auto-enrollment', function () {
  this.timeout(20000);

  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    config.authUid = 'student@illinois.edu';
    config.authName = 'Student User';
    config.authUin = '00000001';
    callback(null);
  });
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  describe('A student user with access to course instance', function () {
    it('should have access to the assessments page', function (callback) {
      request(assessmentsUrl, function (error, response) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      });
    });
    it('should be enrolled in course instance', function (callback) {
      request(baseUrl, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        var $ = cheerio.load(body);
        var linkList = $('a[href="/pl/course_instance/1"]');
        assert.lengthOf(linkList, 1);
        callback(null);
      });
    });
  });

  describe('A student user with no access to course instance', function () {
    before('add course instance with no access rule', async function () {
      const result = (await sqldb.queryAsync(sql.insert_course_instance, {})).rows[0];
      newAssessmentsUrl = baseUrl + `/course_instance/${result.id}/assessments`;
    });

    it('should not have access to the assessments page', function (callback) {
      request(newAssessmentsUrl, function (error, response) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 403) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      });
    });
  });
});
