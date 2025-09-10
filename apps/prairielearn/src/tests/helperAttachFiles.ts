import * as cheerio from 'cheerio';
import fetch, { FormData } from 'node-fetch';
import { assert, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { FileSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let elemList;

export function attachFile(locals, textFile) {
  describe('attachFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      const res = await fetch(locals.attachFilesUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
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
      const formData = new FormData();
      formData.append('__action', locals.__action);
      formData.append('__csrf_token', locals.__csrf_token);

      if (locals.__variant_id) {
        formData.append('__variant_id', locals.__variant_id);
      }

      if (textFile) {
        formData.append('filename', 'testfile.txt');
        formData.append('contents', 'This is the test text');
      } else {
        formData.append('file', new Blob(['This is the test text']), 'testfile.txt');
      }

      const res = await fetch(locals.attachFilesUrl, { method: 'POST', body: formData });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should create an attached file', async () => {
      locals.file = await sqldb.queryRow(sql.select_files, FileSchema);
    });
    it('should have the correct file.display_filename', () => {
      assert.equal(locals.file.display_filename, 'testfile.txt');
    });
    it('should have the correct file.assessment_instance_id', () => {
      assert.equal(locals.file.assessment_instance_id, 1);
    });
  });
}

export function downloadAttachedFile(locals) {
  describe('downloadAttachedFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      const res = await fetch(locals.attachFilesUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should have a file URL', () => {
      elemList = locals.$('#attach-file-panel a[data-testid="attached-file"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.href');
      locals.fileHref = elemList[0].attribs.href;
      assert.isString(locals.fileHref);
    });
  });

  describe('downloadAttachedFile-2. GET to file URL', () => {
    it('should load successfully', async () => {
      const res = await fetch(locals.siteUrl + locals.fileHref);
      assert.isOk(res.ok);
      const contents = await res.text();
      assert.equal(contents, 'This is the test text');
    });
  });
}

export function deleteAttachedFile(locals) {
  describe('deleteAttachedFile-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      const res = await fetch(locals.attachFilesUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
  });

  describe('deleteAttachedFile-2. the delete-file form', () => {
    it('should exist', () => {
      elemList = locals.$('[data-testid="delete-personal-note-button"]');
      assert.lengthOf(elemList, 1);
    });
    it('should have data-bs-content', () => {
      assert.isString(elemList[0].attribs['data-bs-content']);
    });
    it('data-bs-content should parse', () => {
      locals.data$ = cheerio.load(elemList[0].attribs['data-bs-content']);
    });
    it('data-bs-content should have a CSRF token', () => {
      elemList = locals.data$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('data-bs-content should have an __action', () => {
      elemList = locals.data$('form input[name="__action"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
    });
    it('data-bs-content should have an file_id', () => {
      elemList = locals.data$('form input[name="file_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.file_id = Number.parseInt(elemList[0].attribs.value);
    });
    it('data-bs-content might have a variant', () => {
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
      const res = await fetch(locals.attachFilesUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          __variant_id: locals.__variant_id,
          file_id: locals.file_id,
        }),
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should result in no attached files', async () => {
      const rowCount = await sqldb.execute(sql.select_files);
      assert.equal(rowCount, 0);
    });
  });
}

export function checkNoAttachedFiles(locals) {
  describe('checkNoAttachedFiles-1. GET to assessment_instance URL', () => {
    it('should load successfully', async () => {
      const res = await fetch(locals.attachFilesUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
    it('should not have a file URL', () => {
      elemList = locals.$('#attach-file-panel a[data-testid="attached-file"]');
      assert.lengthOf(elemList, 0);
    });
  });
}
