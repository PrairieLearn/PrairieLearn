import { assert } from 'chai';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

import { config } from '../lib/config';
import * as helperServer from './helperServer';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

describe('Administrator pages', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('view administrator admins list page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/admins');
      assert(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('#administratorInsertButton span:contains("Add administrator")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator settings page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/settings');
      assert(res.ok);
    });
  });

  describe('view administrator institutions page', function () {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/institutions');
      assert(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('#institutions td:first-child:contains("Default")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator courses page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/courses');
      assert(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('#courses td:contains("QA 101")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator exam-mode networks page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/networks');
      assert(res.ok);
    });
  });
});
