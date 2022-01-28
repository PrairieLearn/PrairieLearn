const assert = require('chai').assert;
const requestp = require('request-promise-native');
const cheerio = require('cheerio');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

let page, elemList;

module.exports.attachFile = (locals, textFile) => {
  describe('attachFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      page = await requestp(locals.attachFilesUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should have a CSRF token', () => {
      if (textFile) {
        elemList = locals.$('.attach-text-form input[name="__csrf_token"]');
      } else {
        elemList = locals.$('.attach-file-form input[name="__csrf_token"]');
      }
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should have an action', () => {
      if (textFile) {
        elemList = locals.$('.attach-text-form button[name="__action"]');
      } else {
        elemList = locals.$('.attach-file-form input[name="__action"]');
      }
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
    });
    it('might have a variant', () => {
      if (textFile) {
        elemList = locals.$('.attach-text-form input[name="__variant_id"]');
      } else {
        elemList = locals.$('.attach-file-form input[name="__variant_id"]');
      }
      delete locals.__variant_id;
      if (elemList.length === 0) return; // assessment_instance page does not have variant_id
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__variant_id = elemList[0].attribs.value;
    });
  });

  describe('attachFile-2. POST to assessment_instance URL', () => {
    it('should load successfully', async () => {
      const options = {
        url: locals.attachFilesUrl,
        followAllRedirects: true,
      };
      if (textFile) {
        options.form = {
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          __variant_id: locals.__variant_id,
          filename: 'testfile.txt',
          contents: 'This is the test text',
        };
      } else {
        options.formData = {
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          file: {
            value: 'This is the test text',
            options: {
              filename: 'testfile.txt',
              contentType: 'text/plain',
            },
          },
        };
        if (locals.__variant_id) {
          options.formData.__variant_id = locals.__variant_id;
        }
      }
      page = await requestp.post(options);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
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
};

module.exports.downloadAttachedFile = (locals) => {
  describe('downloadAttachedFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      page = await requestp(locals.attachFilesUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
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
};

module.exports.deleteAttachedFile = (locals) => {
  describe('deleteAttachedFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      page = await requestp(locals.attachFilesUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
  });

  describe('deleteAttachedFile-2. the delete-file form', () => {
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
    it('data-content might have a variant', () => {
      elemList = locals.data$('form input[name="__variant_id"]');
      delete locals.__variant_id;
      if (elemList.length === 0) return; // assessment_instance page does not have variant_id
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__variant_id = elemList[0].attribs.value;
    });
  });

  describe('deleteAttachedFile-3. POST to delete attached file', () => {
    it('should load successfully', async () => {
      const options = {
        url: locals.attachFilesUrl,
        followAllRedirects: true,
      };
      options.form = {
        __action: locals.__action,
        __csrf_token: locals.__csrf_token,
        __variant_id: locals.__variant_id,
        file_id: locals.file_id,
      };
      page = await requestp.post(options);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should result in no attached files', async () => {
      const result = await sqldb.queryAsync(sql.select_files, []);
      assert.equal(result.rowCount, 0);
    });
  });
};

module.exports.checkNoAttachedFiles = (locals) => {
  describe('checkNoAttachedFiles-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      page = await requestp(locals.attachFilesUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });
    it('should not have a file URL', () => {
      elemList = locals.$('#attach-file-panel a.attached-file');
      assert.lengthOf(elemList, 0);
    });
  });
};
