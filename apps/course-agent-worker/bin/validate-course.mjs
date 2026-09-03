#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const errors = [];
const warnings = [];

const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
});
if (git.status !== 0) {
  console.error(git.stderr || 'Unable to enumerate course files.');
  process.exit(1);
}

const files = git.stdout.split('\0').filter(Boolean);
const uuids = new Map();
for (const file of files) {
  const absolutePath = join(root, file);
  if (/\.(?:html|json|md|py)$/u.test(file)) {
    const contents = readFileSync(absolutePath, 'utf8');
    if (/^(?:<<<<<<<|=======|>>>>>>>)/mu.test(contents)) {
      errors.push(`${file}: contains an unresolved merge conflict`);
    }
  }
  if (file.endsWith('.json')) {
    try {
      const value = JSON.parse(readFileSync(absolutePath, 'utf8'));
      if (/^questions\/[^/]+\/info\.json$/u.test(file)) {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            value.uuid ?? '',
          )
        ) {
          errors.push(`${file}: uuid must be a valid UUID`);
        } else if (uuids.has(value.uuid)) {
          errors.push(`${file}: duplicates uuid from ${uuids.get(value.uuid)}`);
        } else {
          uuids.set(value.uuid, file);
        }
        const questionHtml = join(dirname(absolutePath), 'question.html');
        if (!files.includes(relative(root, questionHtml))) {
          errors.push(`${file}: question.html is missing`);
        }
      }
    } catch (error) {
      errors.push(`${file}: invalid JSON (${error.message})`);
    }
  }
  if (file.endsWith('.py')) {
    const python = spawnSync(
      'python3',
      ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', absolutePath],
      { encoding: 'utf8' },
    );
    if (python.status !== 0) errors.push(`${file}: ${python.stderr.trim()}`);
  }
}

if (!files.includes('infoCourse.json')) errors.push('infoCourse.json is missing');
if (!files.some((file) => /^questions\/[^/]+\/info\.json$/u.test(file))) {
  warnings.push('No questions were found');
}

const whitespace = spawnSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8' });
if (whitespace.status !== 0) errors.push(whitespace.stdout.trim());

for (const warning of warnings) process.stdout.write(`warning: ${warning}\n`);
for (const error of errors) console.error(`error: ${error}`);
process.stdout.write(
  `Validated ${files.length} files, ${uuids.size} questions: ${errors.length} errors, ${warnings.length} warnings.\n`,
);
process.exit(errors.length === 0 ? 0 : 1);
