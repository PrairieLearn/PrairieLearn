#!/usr/bin/env node
// @ts-check
//
// Formats all files changed on the current branch compared to the default branch,
// including both committed and uncommitted changes.

import { execFileSync, spawn } from 'node:child_process';

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
 * Detect the remote default branch (e.g. origin/main or origin/master).
 * @returns {string}
 */
function getBaseBranch() {
  // Use origin's HEAD symref, which tracks the remote's default branch.
  try {
    const ref = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf-8',
    }).trim();
    // ref is like "refs/remotes/origin/main" — strip the prefix.
    const prefix = 'refs/remotes/';
    return ref.slice(prefix.length);
  } catch {
    // origin/HEAD may not be set (e.g. older clones). Probe common names.
  }

  for (const candidate of ['origin/master', 'origin/main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], { encoding: 'utf-8' });
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('Could not determine the default branch. Run: git remote set-head origin --auto');
}

/**
 * Get the merge base between the current branch and the default branch.
 * @returns {string}
 */
function getMergeBase() {
  const baseBranch = getBaseBranch();
  return execFileSync('git', ['merge-base', 'HEAD', baseBranch], { encoding: 'utf-8' }).trim();
}

/**
 * Get all changed files on the current branch compared to the default branch,
 * including committed, staged, unstaged, and untracked changes.
 * @returns {string[]}
 */
function getChangedFiles() {
  const mergeBase = getMergeBase();

  // Get all files changed between merge base and working tree, excluding deletions
  const diffOutput = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', mergeBase], {
    encoding: 'utf-8',
  });

  // Get untracked files
  const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf-8',
  });

  return [
    ...new Set([
      ...diffOutput.split('\n').filter(Boolean),
      ...untrackedOutput.split('\n').filter(Boolean),
    ]),
  ];
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
