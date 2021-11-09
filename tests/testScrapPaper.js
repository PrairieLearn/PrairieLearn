const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');
const helperAttachFiles = require('./helperAttachFiles');


describe('Scrap paper', function () {
  this.timeout(60000);

  const siteUrl = 'http://localhost:' + config.serverPort;
  const scrapPaperUrl = siteUrl + '/scrap_paper';
  const scanPaperUrl = siteUrl + '/scan_paper'

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', () => {

    it('should contain placeholder values on load', () => {
      const $scrapPaper = cheerio.load(scrapPaperUrl);
      const numPages = $scrapPaper('#num_pages').attr('val');
      const label = $scrapPaper('#label').attr('val');
      assert.isNotNull(numPages);
      assert.isNotNull(label);
    });
  });
});
