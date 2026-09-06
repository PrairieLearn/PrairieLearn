import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

const directories = [];

afterEach(async () => {
  await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true })));
  directories.length = 0;
});

async function courseFixture() {
  const root = await mkdtemp(join(tmpdir(), 'course-agent-validation-'));
  directories.push(root);
  const question = join(root, 'questions', 'algorithms', 'hashmaps');
  await mkdir(question, { recursive: true });
  await writeFile(join(root, 'infoCourse.json'), '{}');
  await writeFile(
    join(question, 'info.json'),
    JSON.stringify({ uuid: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400' }),
  );
  await writeFile(join(question, 'question.html'), '<p>Question</p>');
  spawnSync('git', ['init', '--quiet'], { cwd: root });
  return { question, root };
}

function validate(root) {
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('validate-course.mjs', import.meta.url)), root],
    { encoding: 'utf8' },
  );
}

it('validates nested question IDs', async () => {
  const { root } = await courseFixture();
  const result = validate(root);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('1 questions: 0 errors');
});

it('rejects missing question files and invalid Python', async () => {
  const { question, root } = await courseFixture();
  await rm(join(question, 'question.html'));
  await writeFile(join(question, 'server.py'), 'not valid Python');
  const result = validate(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('question.html is missing');
  expect(result.stderr).toContain('SyntaxError');
});
