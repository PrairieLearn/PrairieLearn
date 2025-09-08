import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

describe('Administrator pages', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  describe('view administrator admins list page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/admins');
      assert.isTrue(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('button[data-testid="administrator-insert-button"]');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator settings page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/settings');
      assert.isTrue(res.ok);
    });
  });

  describe('view administrator institutions page', function () {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/institutions');
      assert.isTrue(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('#institutions td:first-child:contains("Default")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator courses page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/courses');
      assert.isTrue(res.ok);
      const $ = cheerio.load(await res.text());
      const elemList = $('#courses td:contains("QA 101")');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('view administrator exam-mode networks page', () => {
    it('should load successfully', async () => {
      const res = await fetch(baseUrl + '/administrator/networks');
      assert.isTrue(res.ok);
    });
  });
});
