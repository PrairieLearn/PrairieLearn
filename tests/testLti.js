const request = require('request');
const oauthSignature = require('oauth-signature');
const ERR = require('async-stacktrace');

var config = require('../lib/config');
var helperServer = require('./helperServer');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const locals = {};

var sql = sqlLoader.loadSqlEquiv(__filename);

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.ltiUrl = locals.baseUrl + '/lti';

config.ltiRedirectUrl = locals.ltiUrl;

describe('LTI', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  var body = {
    lti_message_type: 'basic-lti-launch-request',
    lti_version: 'LTI-1p0',
    resource_link_id: 'somethingsomething',
    oauth_consumer_key: 'oauth_key',
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_nonce: 'nonceNonce',
    user_id: 'testuser1',
    roles: 'Learner',
    context_id: 'testContext',
  };
  var secret = 'sFDpR@RzLdDW';
  var genSignature = oauthSignature.generate('POST', locals.ltiUrl, body, secret, null, {
    encodeSignature: false,
  });

  describe('test LTI callback', function () {
    it('should throw 500 with an invalid consumer_key', function (callback) {
      request.post(locals.ltiUrl, { form: body }, function (error, response) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 500) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      });
    });
    it('should throw 500 with an invalid secret', function (callback) {
      sqldb.query(sql.invalid_secret, {}, function (err) {
        if (ERR(err, callback)) return;
        request.post(locals.ltiUrl, { form: body }, function (error, response) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 500) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          callback(null);
        });
      });
    });
    it('should throw 400 as a Learner with no LTI link defined', function (callback) {
      body.oauth_signature = genSignature;
      request.post(locals.ltiUrl, { form: body }, function (error, response) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 400) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      });
    });
    it('should throw 302 (redirect) as a Learner with an LTI link created', function (callback) {
      sqldb.query(sql.lti_link, {}, function (err) {
        if (ERR(err, callback)) return;

        request.post(locals.ltiUrl, { form: body }, function (error, response) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 302) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          callback(null);
        });
      });
    });
  });
});

/* TODO
 * Test nonce reuse
 * Test time out of range
 * Test instructor access without LTI link
 */
