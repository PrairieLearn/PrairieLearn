const assert = require('chai').assert;
const requestp = require('request-promise-native');
const cheerio = require('cheerio');

const news_items = require('../news_items');
const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.newsItemsUrl = locals.baseUrl + '/news_items';

describe('News items', function() {
    this.timeout(10000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    var page, elemList;

    describe('News item initialization', () => {
        it('should prepare by creating the student test user', async () => {
            const cookies = requestp.jar();
            cookies.setCookie(requestp.cookie('pl_test_user=test_student'), locals.siteUrl);
            page = await requestp({url: locals.baseUrl, jar: cookies});
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should succeed with notifications turned on', async () => {
            const notify_with_new_server = true;
            await news_items.initAsync(notify_with_new_server);
        });
        it('should create a notification for news item 1 for admin user', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'dev@illinois.edu', news_item_id: 1});
            assert.equal(results.rowCount, 1);
        });
        it('should create a notification for news item 2 for admin user', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'dev@illinois.edu', news_item_id: 2});
            assert.equal(results.rowCount, 1);
        });
        it('should not create a notification for news item 1 for student user', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'student@illinois.edu', news_item_id: 1});
            assert.equal(results.rowCount, 0);
        });
        it('should not create a notification for news item 2 for student user', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'student@illinois.edu', news_item_id: 2});
            assert.equal(results.rowCount, 0);
        });
    });

    // FIXME: We only test notifiction creation for course staff users
    // (the dev user). We don't test for student users. This is
    // because when this code was originally written we didn't have
    // any student-visible news items and it was too horrible to mock
    // one. If we add a student-visible news item in the future then
    // we should create student_user (see authn.js) and check that it
    // gets the appropriate notifications.

    describe('News item notifications', () => {
        it('should permit page load', async () => {
            page = await requestp(locals.baseUrl);
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should show up in the top navbar', () => {
            elemList = locals.$('span.news-item-count');
            assert.lengthOf(elemList, 1);
        });
        it('should show up in the News link', () => {
            elemList = locals.$('span.news-item-link-count');
            assert.lengthOf(elemList, 1);
        });
    });

    describe('News items page at root level', () => {
        it('should load', async () => {
            page = await requestp(locals.newsItemsUrl);
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should contain a link to the "New layout" news item', () => {
            elemList = locals.$('.news-items-table a:contains("New layout")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link', () => {
            locals.newsItem1Url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(locals.newsItem1Url, locals.baseUrl + '/news_item/1/');
        });
    });

    describe('Single news item page  at root level', () => {
        it('should load', async () => {
            page = await requestp(locals.newsItem1Url);
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should contain the "New layout" header', () => {
            elemList = locals.$('h1:contains("New layout")');
            assert.lengthOf(elemList, 1);
        });
        it('should remove notification 1', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'dev@illinois.edu', news_item_id: 1});
            assert.equal(results.rowCount, 0);
        });
        it('should still have notification 2', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, {uid: 'dev@illinois.edu', news_item_id: 2});
            assert.equal(results.rowCount, 1);
        });
    });

    describe('News items page', () => {
        it('should load in course instructor level', async () => {
            page = await requestp(locals.baseUrl + '/course/1/news_items');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should load in course instance instructor level', async () => {
            page = await requestp(locals.baseUrl + '/course_instance/1/instructor/news_items');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should load in course instance student level', async () => {
            page = await requestp(locals.baseUrl + '/course_instance/1/news_items');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
    });

    describe('Single news item page', () => {
        it('should load in course instructor level', async () => {
            page = await requestp(locals.baseUrl + '/course/1/news_item/1/');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should load in course instance instructor level', async () => {
            page = await requestp(locals.baseUrl + '/course_instance/1/instructor/news_item/1/');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should load in course instance student level', async () => {
            page = await requestp(locals.baseUrl + '/course_instance/1/news_item/1/');
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
    });
});
