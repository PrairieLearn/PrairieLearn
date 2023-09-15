const fetch = require('node-fetch');
const oauthSignature = require('oauth-signature');
const { assert } = require('chai');

const { config } = require('../lib/config');
const helperServer = require('./helperServer');
const sqldb = require('@prairielearn/postgres');
const locals = {};

const sql = sqldb.loadSqlEquiv(__filename);

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.ltiUrl = locals.baseUrl + '/lti';

config.ltiRedirectUrl = locals.ltiUrl;

describe('LTI', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  const body = {
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
  const secret = 'sFDpR@RzLdDW';
  const genSignature = oauthSignature.generate('POST', locals.ltiUrl, body, secret, null, {
    encodeSignature: false,
  });

  describe('test LTI callback', function () {
    it('should throw 500 with an invalid consumer_key', async () => {
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 500);
    });
    it('should throw 500 with an invalid secret', async () => {
      await sqldb.queryAsync(sql.invalid_secret, {});
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 500);
    });
    it('should throw 400 as a Learner with no LTI link defined', async () => {
      body.oauth_signature = genSignature;
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 400);
    });
    it('should 302 (redirect) as a Learner with an LTI link created', async () => {
      await sqldb.queryAsync(sql.lti_link, {});
      const res = await fetch(locals.ltiUrl, {
        method: 'POST',
        body: new URLSearchParams(body),
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
    });
  });
});

/* TODO
 * Test nonce reuse
 * Test time out of range
 * Test instructor access without LTI link
 */
