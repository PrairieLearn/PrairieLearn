// const ERR = require('async-stacktrace');
// const _ = require('lodash');
const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const config = require('../lib/config');
// const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
// const helperQuestion = require('./helperQuestion');
// const helperAttachFiles = require('./helperAttachFiles');


describe('Scrap paper', function () {
  this.timeout(60000);

  const baseUrl = 'http://localhost:' + config.serverPort + '/pl';
  const scrapPaperUrl = baseUrl + '/scrap_paper';
  // const scanPaperUrl = baseUrl + '/scan_paper';

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', () => {

    let scrapPaperPage;
    let $scrapPaper;

    it('should be able to load page and find payload values', async () => {
      const req = await fetch(scrapPaperUrl);
      assert.equal(req.status, 200);
      scrapPaperPage = await req.text();
      $scrapPaper = cheerio.load(scrapPaperPage);
      const numPages = $scrapPaper('#num_pages');
      const pageLabel = $scrapPaper('#page_label');
      assert.length(numPages, 1);
      assert.length(pageLabel, 1);
    });
  });
});
