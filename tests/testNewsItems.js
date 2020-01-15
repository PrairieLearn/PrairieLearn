const assert = require('chai').assert;
const requestp = require('request-promise-native');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

config.testNewsItemsSetCount = true; // hack to tell middlewares/authn to process notification counts

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.newsItemsUrl = locals.baseUrl + '/news_items';

describe('News items', function() {
    this.timeout(10000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    var page, elemList;

    describe('News item notifications', () => {
        it('should be inserted', async () => {
            await sqldb.queryAsync(sql.insert_notifications, []);
        });
        it('should permit page load', async () => {
            page = await requestp(locals.baseUrl);
            locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
        });
        it('should show up in the top navbar', () => {
            elemList = locals.$('span.news-item-count:contains("2")');
            assert.lengthOf(elemList, 1);
        });
        it('should show up in the News link', () => {
            elemList = locals.$('span.news-item-link-count:contains("2")');
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
            const results = await sqldb.queryAsync(sql.select_notification, [1]);
            assert.equal(results.rowCount, 0);
        });
        it('should still have notification 2', async () => {
            const results = await sqldb.queryAsync(sql.select_notification, [2]);
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
