#!/usr/bin/env node
// @ts-check
//
// Formats all changed files (staged + unstaged) compared to HEAD.
// This is useful for formatting all your work-in-progress changes before committing.

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// File patterns matching the project's linter configurations
const ESLINT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.html',
  '.mustache',
]);

const PRETTIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.md',
  '.sql',
  '.json',
  '.yml',
  '.toml',
  '.html',
  '.css',
  '.scss',
  '.sh',
]);

const RUFF_EXTENSIONS = new Set(['.py']);

/**
 * Get all changed files compared to HEAD (both staged and unstaged).
 * @returns {string[]}
 */
function getChangedFiles() {
  // Get modified/added files (staged and unstaged)
  const diffOutput = execSync('git diff --name-only HEAD', { encoding: 'utf-8' });

  // Get untracked files
  const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
    encoding: 'utf-8',
  });

  const files = new Set([
    ...diffOutput.split('\n').filter(Boolean),
    ...untrackedOutput.split('\n').filter(Boolean),
  ]);

  // Filter to only existing files (in case of deletions)
  return [...files].filter((file) => existsSync(file));
}

/**
 * Get the file extension including the dot.
 * @param {string} file
 * @returns {string}
 */
function getExtension(file) {
  const lastDot = file.lastIndexOf('.');
  if (lastDot === -1) return '';
  return file.slice(lastDot).toLowerCase();
}

/**
 * Run a command with the given arguments.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ success: boolean; code: number | null }>}
 */
function runCommand(command, args) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0, code });
    });

    proc.on('error', () => {
      resolve({ success: false, code: null });
    });
  });
}

const changedFiles = getChangedFiles();

if (changedFiles.length === 0) {
  console.log('No changed files to format.');
  process.exit(0);
}

console.log(`Found ${changedFiles.length} changed file(s)\n`);

// Categorize files by tool
const eslintFiles = changedFiles.filter((f) => ESLINT_EXTENSIONS.has(getExtension(f)));
const prettierFiles = changedFiles.filter((f) => PRETTIER_EXTENSIONS.has(getExtension(f)));
const ruffFiles = changedFiles.filter((f) => RUFF_EXTENSIONS.has(getExtension(f)));

let hasErrors = false;

// Run ESLint
if (eslintFiles.length > 0) {
  console.log(`Running ESLint on ${eslintFiles.length} file(s)...`);
  const result = await runCommand('yarn', ['eslint', '--fix', '--', ...eslintFiles]);
  if (!result.success) {
    console.error('ESLint encountered errors');
    hasErrors = true;
  }
}

// Run Prettier
if (prettierFiles.length > 0) {
  console.log(`Running Prettier on ${prettierFiles.length} file(s)...`);
  const result = await runCommand('yarn', ['prettier', '--write', '--', ...prettierFiles]);
  if (!result.success) {
    console.error('Prettier encountered errors');
    hasErrors = true;
  }
}

// Run Ruff
if (ruffFiles.length > 0) {
  console.log(`Running Ruff on ${ruffFiles.length} file(s)...`);

  const checkResult = await runCommand('uv', ['run', 'ruff', 'check', '--fix', '--', ...ruffFiles]);
  if (!checkResult.success) {
    console.error('Ruff check encountered errors');
    hasErrors = true;
  }

  const formatResult = await runCommand('uv', ['run', 'ruff', 'format', '--', ...ruffFiles]);
  if (!formatResult.success) {
    console.error('Ruff format encountered errors');
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log('\nDone!');
