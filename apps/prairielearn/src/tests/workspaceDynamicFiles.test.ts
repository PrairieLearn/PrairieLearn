import * as cheerio from 'cheerio';
import { assert } from 'chai';
import fetch from 'node-fetch';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../lib/config.js';
import { initialize } from '../lib/workspace.js';
import * as helperServer from './helperServer.js';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const originalConfig = { ...config };

let workspaceId: string | undefined;
let sourcePath: string;

async function checkFileContents(filename: string, expectedContents: string) {
  const fileContents = await fs.readFile(join(sourcePath, filename), 'binary');
  assert.equal(fileContents, expectedContents);
}

describe('Test workspace dynamic files', function () {
  this.timeout(20000);

  before('set configuration values', async () => {
    config.workspaceEnable = false;
    config.workspaceHomeDirRoot = await fs.mkdtemp('/tmp/prairielearn-workspace-test-');
  });
  after('restore configuration values', async () => {
    await fs.rm(config.workspaceHomeDirRoot, { force: true, recursive: true });
    config.workspaceEnable = originalConfig.workspaceEnable;
    config.workspaceHomeDirRoot = originalConfig.workspaceHomeDirRoot;
  });
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('Question with valid dynamic files', () => {
    it('create workspace question variant', async () => {
      const questionId = await sqldb.queryRow(
        sql.select_test_question,
        { qid: 'workspace' },
        IdSchema,
      );
      const workspaceQuestionUrl = `${baseUrl}/course_instance/1/instructor/question/${questionId}/preview`;
      const response = await fetch(workspaceQuestionUrl);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.lengthOf(workspace_btns, 1);

      workspaceId = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspaceId);
    });

    it('initialize workspace', async () => {
      assert.isDefined(workspaceId);
      // A workspace is typically initialized using sockets, but to simplify the
      // testing environment, we will call the initialization process directly.
      ({ sourcePath } = await initialize(workspaceId));
      const directoryStats = await fs.stat(sourcePath);
      assert.isTrue(directoryStats.isDirectory());
    });

    it('creates all static files', async () => {
      await checkFileContents(
        'starter_code.c',
        '// starter_code.c\n\n#include <stdio.h>\n#include "starter_code.h"\n\nint main()\n{\n    // enter your code\n}\n',
      );
      await checkFileContents('starter_code.h', '// starter_code.h\n');
      await checkFileContents('subdir/other_file.txt', 'Content in subdirectory\n');
      await checkFileContents(
        'binary.bin',
        '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F',
      );
    });

    it('creates all template files', async () => {
      await checkFileContents('first_file.txt', 'A is WORD, while B is 35\n');
      await checkFileContents('second_file.txt', 'The value of params.a is WORD.\n');
      await checkFileContents('path/with/multiple/components.py', 'b = "WORD"\nprint(b)\n');
    });

    it('creates all dynamic files', async () => {
      await checkFileContents('first_dynamic_file.py', 'a, b = b, a\nprint(a, b)\n');
      await checkFileContents(
        'second_dynamic_file.bin',
        '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F',
      );
      await checkFileContents(
        'path/with/multiple/dynamic/components.bin',
        '\x00\x11\x22\x33\x44\x55\x66\x77\x88\x99\xAA\xBB\xCC\xDD\xEE\xFF',
      );
      await checkFileContents('blank_file.txt', '');
    });

    it('template files override static files', async () => {
      await checkFileContents('template_and_static.txt', 'The correct answer is 35.\n');
    });

    it('dynamic files override template files', async () => {
      await checkFileContents('template_and_dynamic.csv', 'a,b\n1,1\n2,4\n3,9');
    });
  });
});
