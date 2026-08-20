import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveAgentCourseFilePath } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await fs.rm(directory, { force: true, recursive: true });
    }),
  );
});

describe('resolveAgentCourseFilePath', () => {
  it('accepts a regular file inside the course', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-agent-course-'));
    temporaryDirectories.push(root);
    const file = path.join(root, 'questions', 'test', 'question.html');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '<pl-question-panel>Test</pl-question-panel>');

    await expect(resolveAgentCourseFilePath(root, 'questions/test/question.html')).resolves.toBe(
      await fs.realpath(file),
    );
  });

  it('rejects a symlink that escapes the course', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-agent-course-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-agent-outside-'));
    temporaryDirectories.push(root, outside);
    const outsideFile = path.join(outside, 'secret.txt');
    await fs.writeFile(outsideFile, 'secret');
    await fs.symlink(outsideFile, path.join(root, 'linked-secret.txt'));

    await expect(resolveAgentCourseFilePath(root, 'linked-secret.txt')).resolves.toBeNull();
  });
});
