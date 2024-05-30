import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import { assert } from 'chai';
import * as tmp from 'tmp-promise';

import { TEST_COURSE_PATH } from '../lib/paths.js';
import { generateWorkspaceFiles } from '../lib/workspace.js';

async function checkFileContents(targetPath: string, filename: string, expectedContents: string) {
  const fileContents = await fs.readFile(join(targetPath, filename), 'binary');
  assert.equal(fileContents, expectedContents);
}

describe('Workspace dynamic files', function () {
  it('succeeds with valid dynamic files', async () => {
    const targetPath = await tmp.dir({ unsafeCleanup: true });
    const { fileGenerationErrors } = await generateWorkspaceFiles({
      questionBasePath: join(TEST_COURSE_PATH, 'questions', 'workspace'),
      params: {
        a: 'WORD',
        _workspace_files: [
          { name: 'first_dynamic_file.py', contents: 'a, b = b, a\nprint(a, b)\n' },
          {
            name: 'second_dynamic_file.bin',
            contents: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
            encoding: 'hex',
          },
          {
            name: 'path/with/multiple/dynamic/components.bin',
            contents: 'ABEiM0RVZneImaq7zN3u/w==',
            encoding: 'base64',
          },
          { name: 'blank_file.txt', contents: null },
          { name: 'template_and_dynamic.csv', contents: 'a,b\n1,1\n2,4\n3,9' },
          {
            name: 'reference_file.txt',
            questionFile: 'file_in_question_dir.txt',
          },
          {
            name: 'reference_to_subdir.txt',
            questionFile: 'path/with/another/file.txt',
          },
          {
            name: 'path/../not_normalized.txt',
            contents: 'File identified by path that is not normalized\n',
          },
        ],
      },
      correctAnswers: {
        b: 35,
      },
      targetPath: targetPath.path,
    });

    assert.lengthOf(fileGenerationErrors, 0);

    // Static files.
    await checkFileContents(
      targetPath.path,
      'starter_code.c',
      '// starter_code.c\n\n#include <stdio.h>\n#include "starter_code.h"\n\nint main()\n{\n    // enter your code\n}\n',
    );
    await checkFileContents(targetPath.path, 'starter_code.h', '// starter_code.h\n');
    await checkFileContents(targetPath.path, 'subdir/other_file.txt', 'Content in subdirectory\n');
    await checkFileContents(
      targetPath.path,
      'binary.bin',
      '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F',
    );

    // Template files.
    await checkFileContents(targetPath.path, 'first_file.txt', 'A is WORD, while B is 35\n');
    await checkFileContents(targetPath.path, 'second_file.txt', 'The value of params.a is WORD.\n');
    await checkFileContents(
      targetPath.path,
      'path/with/multiple/components.py',
      'b = "WORD"\nprint(b)\n',
    );

    // Dynamic files.
    await checkFileContents(targetPath.path, 'first_dynamic_file.py', 'a, b = b, a\nprint(a, b)\n');
    await checkFileContents(
      targetPath.path,
      'second_dynamic_file.bin',
      '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F',
    );
    await checkFileContents(
      targetPath.path,
      'path/with/multiple/dynamic/components.bin',
      '\x00\x11\x22\x33\x44\x55\x66\x77\x88\x99\xAA\xBB\xCC\xDD\xEE\xFF',
    );
    await checkFileContents(targetPath.path, 'blank_file.txt', '');
    await checkFileContents(
      targetPath.path,
      'reference_file.txt',
      'This is included in the workspace.\n',
    );
    await checkFileContents(targetPath.path, 'reference_to_subdir.txt', 'Test file.\n');
    await checkFileContents(
      targetPath.path,
      'not_normalized.txt',
      'File identified by path that is not normalized\n',
    );

    // Ensure that template files override static files.
    await checkFileContents(
      targetPath.path,
      'template_and_static.txt',
      'The correct answer is 35.\n',
    );

    // Ensure that dynamic files override template files.
    await checkFileContents(targetPath.path, 'template_and_dynamic.csv', 'a,b\n1,1\n2,4\n3,9');
  });

  it('fails with invalid dynamic files', async () => {
    const targetPath = await tmp.dir({ unsafeCleanup: true });
    const { fileGenerationErrors } = await generateWorkspaceFiles({
      questionBasePath: join(TEST_COURSE_PATH, 'questions', 'workspaceInvalidDynamicFiles'),
      params: {
        a: 'STRING',
        _workspace_files: [
          {
            // Valid file
            name: 'dynamic.txt',
            contents: 'This is a dynamic file.\n',
          },
          {
            // File without a name
            contents: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
            encoding: 'hex',
          },
          {
            // File with invalid encoding
            name: 'invalid_encoding.bin',
            contents: 'ABEiM0RVZneImaq7zN3u/w==',
            encoding: 'utf-4',
          },
          {
            // File that points outside the home directory in name
            name: '../outside_home.txt',
            contents: 'This file should not be created\n',
          },
          {
            // File whose normalized version points outside the home directory in name
            name: 'path/../../outside_home.txt',
            contents: 'This file should also not be created\n',
          },
          {
            // File with absolute path
            name: '/home/prairie/absolute.txt',
            contents: 'This file should also not be created\n',
          },
          {
            // File that points outside the question directory in questionFile
            name: 'server.py',
            questionFile: '../workspace/server.py',
          },
          {
            // File without contents or questionFile
            name: 'no_contents.txt',
          },
        ],
      },
      correctAnswers: {
        b: 53,
      },
      targetPath: targetPath.path,
    });

    // Valid files should still have been created.
    await checkFileContents(targetPath.path, 'static.txt', 'Static content\n');
    await checkFileContents(targetPath.path, 'template.txt', 'A is STRING, while B is 53\n');
    await checkFileContents(targetPath.path, 'dynamic.txt', 'This is a dynamic file.\n');

    const expectedErrors = [
      { file: 'Dynamic file 1', msg: 'does not include a name' },
      { file: 'invalid_encoding.bin', msg: 'unsupported file encoding' },
      { file: '../outside_home.txt', msg: 'traverses outside the home directory' },
      { file: 'path/../../outside_home.txt', msg: 'traverses outside the home directory' },
      { file: '/home/prairie/absolute.txt', msg: 'has an absolute path' },
      { file: 'server.py', msg: 'local file outside the question directory' },
      { file: 'no_contents.txt', msg: 'has neither "contents" nor "questionFile"', contents: '' },
    ];

    for (const expectedError of expectedErrors) {
      const issueError = fileGenerationErrors.find((error) => error.file === expectedError.file);
      assert.isDefined(issueError, `Expected error not found: ${expectedError.file}`);
      assert.include(issueError.msg, expectedError.msg);
      if (expectedError.contents != null) {
        await checkFileContents(targetPath.path, expectedError.file, expectedError.contents);
      } else {
        await fs.access(join(targetPath.path, expectedError.file)).then(
          () => assert.fail(`File ${expectedError.file} should not exist`),
          (err) => assert.equal(err.code, 'ENOENT'),
        );
      }
    }

    assert.lengthOf(fileGenerationErrors, 7);
  });
});
