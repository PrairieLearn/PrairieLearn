import { assert } from 'chai';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import * as sqldb from '@prairielearn/postgres';

import * as news_items from '../news_items';
import { config } from '../lib/config';

import * as helperServer from './helperServer';

const sql = sqldb.loadSqlEquiv(__filename);

const locals: Record<string, any> = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.newsItemsUrl = locals.baseUrl + '/news_items';

describe('News items', function () {
  this.timeout(10000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('News item initialization', () => {
    it('should prepare by creating the student test user', async () => {
      const res = await fetch(locals.baseUrl, {
        headers: {
          Cookie: 'pl_test_user=test_student',
        },
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should succeed with notifications turned on', async () => {
      await news_items.init({
        notifyIfPreviouslyEmpty: true,
        errorIfLockNotAcquired: true,
      });
    });
    it('should create a notification for news item 1 for admin user', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'dev@illinois.edu',
        news_item_id: 1,
      });
      assert.equal(results.rowCount, 1);
    });
    it('should create a notification for news item 2 for admin user', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'dev@illinois.edu',
        news_item_id: 2,
      });
      assert.equal(results.rowCount, 1);
    });
    it('should not create a notification for news item 1 for student user', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'student@illinois.edu',
        news_item_id: 1,
      });
      assert.equal(results.rowCount, 0);
    });
    it('should not create a notification for news item 2 for student user', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'student@illinois.edu',
        news_item_id: 2,
      });
      assert.equal(results.rowCount, 0);
    });
  });

  // FIXME: We only test notification creation for course staff users
  // (the dev user). We don't test for student users. This is
  // because when this code was originally written we didn't have
  // any student-visible news items and it was too horrible to mock
  // one. If we add a student-visible news item in the future then
  // we should create student_user (see authn.js) and check that it
  // gets the appropriate notifications.

  describe('News item notifications', () => {
    it('should permit page load', async () => {
      const res = await fetch(locals.baseUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should show up in the top navbar', () => {
      const elemList = locals.$('span.news-item-count');
      assert.lengthOf(elemList, 1);
    });
    it('should show up in the News link', () => {
      const elemList = locals.$('span.news-item-link-count');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('News items page at root level', () => {
    it('should load', async () => {
      const res = await fetch(locals.newsItemsUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should contain a link to the "New layout" news item', () => {
      const elemList = locals.$('.news-items-table a:contains("New layout")');
      assert.lengthOf(elemList, 1);
      locals.newsItem1Url = locals.siteUrl + elemList[0].attribs.href;
      assert.equal(locals.newsItem1Url, locals.baseUrl + '/news_item/1/');
    });
  });

  describe('Single news item page  at root level', () => {
    it('should load', async () => {
      const res = await fetch(locals.newsItem1Url);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should contain the "New layout" header', () => {
      const elemList = locals.$('h1:contains("New layout")');
      assert.lengthOf(elemList, 1);
    });
    it('should remove notification 1', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'dev@illinois.edu',
        news_item_id: 1,
      });
      assert.equal(results.rowCount, 0);
    });
    it('should still have notification 2', async () => {
      const results = await sqldb.queryAsync(sql.select_notification, {
        uid: 'dev@illinois.edu',
        news_item_id: 2,
      });
      assert.equal(results.rowCount, 1);
    });
  });

  describe('News items page', () => {
    it('should load in course instructor level', async () => {
      const res = await fetch(locals.baseUrl + '/course/1/news_items', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
    it('should load in course instance instructor level', async () => {
      const res = await fetch(locals.baseUrl + '/course_instance/1/instructor/news_items', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
    it('should load in course instance student level', async () => {
      const res = await fetch(locals.baseUrl + '/course_instance/1/news_items', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
  });

  describe('Single news item page', () => {
    it('should load in course instructor level', async () => {
      const res = await fetch(locals.baseUrl + '/course/1/news_item/1/', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
    it('should load in course instance instructor level', async () => {
      const res = await fetch(locals.baseUrl + '/course_instance/1/instructor/news_item/1/', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
    it('should load in course instance student level', async () => {
      const res = await fetch(locals.baseUrl + '/course_instance/1/news_item/1/', {
        method: 'HEAD',
      });
      assert.isOk(res.ok);
    });
  });
});
