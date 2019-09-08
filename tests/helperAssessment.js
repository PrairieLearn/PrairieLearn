const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const requestp = require('request-promise');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

let res, page, elemList;

module.exports = {

    attachFile(locals, textFile) {
        describe('attachFile-1. GET to assessment_instance URL', () => {
            it('should load successfully', async () => {
                page = await requestp(locals.assessmentInstanceUrl);
                locals.$ = cheerio.load(page);
            });
            it('should have a CSRF token', () => {
                const formName = textFile ? 'attach-text-form' : 'attach-file-form';
                elemList = locals.$(`.${formName} input[name="__csrf_token"]`);
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
            it('should have an action', () => {
                const formName = textFile ? 'attach-text-form' : 'attach-file-form';
                elemList = locals.$(`.${formName} button[name="__action"]`);
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__action = elemList[0].attribs.value;
                assert.isString(locals.__action);
            });
        });

        describe('attachFile-2. POST to assessment_instance URL', () => {
            it('should load successfully', async () => {
                const form = {
                    __action: locals.__action,
                    __csrf_token: locals.__csrf_token,
                };
                if (textFile) {
                    form.filename = 'testfile.txt';
                    form.contents = 'This is the test text';
                } else {
                    form.file = {
                        value: 'This is the test text',
                        options: {
                            filename: 'testfile.txt',
                            contentType: 'text/plain',
                        },
                    };
                }
                const options = {
                    url: locals.assessmentInstanceUrl,
                    form: form,
                    followAllRedirects: true,
                };
                page = await requestp.post(options);
                locals.$ = cheerio.load(page);
            });
            it('should create an attached file', async () => {
                const result = await sqldb.queryAsync(sql.select_files, []);
                assert.equal(result.rowCount, 1);
                locals.file = result.rows[0];
            });
            it('should have the correct file.display_filename', () => {
                assert.equal(locals.file.display_filename, 'testfile.txt');
            });
            it('should have the correct file.assessment_instance_id', () => {
                assert.equal(locals.file.assessment_instance_id, 1);
            });
        });
    },

    downloadAttachedFile(locals) {
        describe('downloadAttachedFile-1. GET to assessment_instance URL', () => {
            it('should load successfully', async () => {
                page = await requestp(locals.assessmentInstanceUrl);
                locals.$ = cheerio.load(page);
            });
            it('should have a file URL', () => {
                elemList = locals.$('#attach-file-panel a.attached-file');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.href');
                locals.fileHref = elemList[0].attribs.href;
                assert.isString(locals.fileHref);
            });
        });

        describe('downloadAttachedFile-2. GET to file URL', () => {
            it('should load successfully', async () => {
                page = await requestp(locals.siteUrl + locals.fileHref);
            });
            it('should contain the correct data', () => {
                assert.equal(page, 'This is the test text');
            });
        });
    },

    deleteAttachedFile(locals) {
        describe('deleteAttachedFile-1. GET to assessment_instance URL', () => {
            it('should load successfully', async () => {
                page = await requestp(locals.assessmentInstanceUrl);
                locals.$ = cheerio.load(page);
            });
        });

        describe('deleteAttachedFile-2. the file delete button', () => {
            it('should have a CSRF token', () => {
                const formName = textFile ? 'attach-text-form' : 'attach-file-form';
                elemList = locals.$(`.${formName} input[name="__csrf_token"]`);
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
            it('should have an action', () => {
                const formName = textFile ? 'attach-text-form' : 'attach-file-form';
                elemList = locals.$(`.${formName} button[name="__action"]`);
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__action = elemList[0].attribs.value;
                assert.isString(locals.__action);
            });
        });

        describe('deleteAttachedFile-3. the delete-file form', () => {
            it('should exist', () => {
                elemList = locals.$('.attachFileDeleteButton');
                assert.lengthOf(elemList, 1);
            });
            it('should have data-content', () => {
                assert.isString(elemList[0].attribs['data-content']);
            });
            it('data-content should parse', () => {
                locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
            });
            it('data-content should have a CSRF token', () => {
                elemList = locals.data$('form input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
            it('data-content should have an __action', () => {
                elemList = locals.data$('form input[name="__action"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__action = elemList[0].attribs.value;
                assert.isString(locals.__action);
            });
            it('data-content should have an file_id', () => {
                elemList = locals.data$('form input[name="file_id"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.file_id = Number.parseInt(elemList[0].attribs.value);
            });
        });

        describe('deleteAttachedFile-4. POST to delete attached file', () => {
            it('should load successfully', async () => {
                const form = {
                    __action: locals.__action,
                    __csrf_token: locals.__csrf_token,
                    file_id: locals.file_id,
                };
                const options = {
                    url: locals.assessmentInstanceUrl,
                    form: form,
                    followAllRedirects: true,
                };
                page = await requestp.post(options);
                locals.$ = cheerio.load(page);
            });
            it('should result in no attached files', async () => {
                const result = await sqldb.queryAsync(sql.select_files, []);
                assert.equal(result.rowCount, 0);
            });
        });
    },

    checkNoAttachedFiles(locals) {
        describe('checkNoAttachedFiles-1. GET to assessment_instance URL', () => {
            it('should load successfully', async () => {
                page = await requestp(locals.assessmentInstanceUrl);
                locals.$ = cheerio.load(page);
            });
            it('should not have a file URL', () => {
                elemList = locals.$('#attach-file-panel a.attached-file');
                assert.lengthOf(elemList, 0);
            });
        });

    },

};
