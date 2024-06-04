import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

import * as sqldb from '@prairielearn/postgres';

import { config, type Config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceUrl + '/assessments';

const storedConfig: Partial<Config> = {};

describe('Test student auto-enrollment', function () {
  this.timeout(20000);

  before('set authenticated user', () => {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    config.authUid = 'student@example.com';
    config.authName = 'Student User';
    config.authUin = '00000001';
  });
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', () => {
    Object.assign(config, storedConfig);
  });

  describe('A student user with access to course instance', function () {
    it('should have access to the assessments page', async () => {
      const response = await fetch(assessmentsUrl);
      assert.equal(response.status, 200);
    });
    it('should be enrolled in course instance', async () => {
      const response = await fetch(baseUrl);
      assert.equal(response.status, 200);
      const $ = cheerio.load(await response.text());
      const linkList = $('a[href="/pl/course_instance/1"]');
      assert.lengthOf(linkList, 1);
    });
  });

  describe('A student user with no access to course instance', function () {
    it('should not have access to assessments page with no access rule', async () => {
      const result = (await sqldb.queryAsync(sql.insert_course_instance, {})).rows[0];
      const newAssessmentsUrl = baseUrl + `/course_instance/${result.id}/assessments`;
      const response = await fetch(newAssessmentsUrl);
      assert.equal(response.status, 403);
    });
  });
});
