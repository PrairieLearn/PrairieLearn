import fetch from 'node-fetch';
import oauthSignature from 'oauth-signature';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { UserSchema } from '../lib/db-types.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };

locals.baseUrl = locals.siteUrl + '/pl';
locals.ltiUrl = locals.baseUrl + '/lti';

config.ltiRedirectUrl = locals.ltiUrl;

describe('LTI', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  const body: Record<string, string> = {
    lti_message_type: 'basic-lti-launch-request',
    lti_version: 'LTI-1p0',
    resource_link_id: 'somethingsomething',
    oauth_consumer_key: 'oauth_key',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: 'nonceNonce',
    user_id: 'testuser1',
    roles: 'Learner',
    context_id: 'testContext',
    lis_person_name_full: 'Test User',
  };
  const secret = 'sFDpR@RzLdDW';
  const genSignature = oauthSignature.generate('POST', locals.ltiUrl, body, secret, undefined, {
    encodeSignature: false,
  });

  describe('test LTI callback', function () {
    it('should throw 403 with an invalid consumer_key', async () => {
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 403);
    });
    it('should throw 403 with an invalid secret', async () => {
      await execute(sql.invalid_secret);
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 403);
    });
    it('should throw 400 as a Learner with no LTI link defined', async () => {
      body.oauth_signature = genSignature;
      const res = await fetch(locals.ltiUrl, { method: 'POST', body: new URLSearchParams(body) });
      assert.equal(res.status, 403);
    });
    it('should 302 (redirect) as a Learner with an LTI link created', async () => {
      await execute(sql.lti_link);
      const res = await fetch(locals.ltiUrl, {
        method: 'POST',
        body: new URLSearchParams(body),
        redirect: 'manual',
      });
      assert.equal(res.status, 302);

      // There should be a user in the database now.
      const user = await queryRow('SELECT * FROM users WHERE lti_user_id IS NOT NULL', UserSchema);
      assert.equal(user.lti_user_id, 'testuser1');
      assert.equal(user.name, 'Test User');
      assert.equal(user.lti_context_id, 'testContext');
      assert.equal(user.lti_course_instance_id, '1');

      // The user should be enrolled as a student in the course instance.
      const enrollment = await selectOptionalEnrollmentByUserId({
        courseInstance: await selectCourseInstanceById('1'),
        userId: user.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
      });
      assert.isOk(enrollment);
      assert.equal(enrollment.status, 'joined');
    });
  });
});

/* TODO
 * Test nonce reuse
 * Test time out of range
 * Test instructor access without LTI link
 */
