// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const fetch = require('node-fetch').default;
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqldb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { setUser, parseInstanceQuestionId, saveOrGrade } = require('./helperClient');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

describe('Question Sharing', function () {
  this.timeout(80000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await sqldb.queryAsync(sql.enable_question_sharing, {});
  });

  describe('Create a sharing set and add a question to it', () => {
    
    step('load sharing set admin page', async () => {
    
    });

  });
});
