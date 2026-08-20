#!/usr/bin/env node
//
// Exercises the edit -> sync -> test loop the way an agent would, including the
// cases that motivated the tool design:
//
//   1. A brand-new question is authored on disk, synced, and verified.
//   2. A seed-dependent bug is planted; the test cycle must catch it and report
//      the exact failing seed.
//   3. The bug is fixed and re-verified with the same seeds.
//   4. A malformed info.json must surface as a sync error, not a silent failure.
//
// Local development only. Operates on the scratch course, outside the repo.

import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs-extra';
import minimist from 'minimist';

import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from '../../lib/paths.js';

// `pnpm run <script> -- --flag` forwards the `--` separator into our argv, and
// minimist would otherwise treat every flag after it as a positional argument.
const argv = minimist(process.argv.slice(2).filter((arg) => arg !== '--'));
const courseId = String(argv['course-id'] ?? '1');
const coursePath: string =
  argv['course-path'] ?? path.join(process.env.HOME ?? '', 'pl-agent-scratch', 'course');

const QID = 'agent-loop-test';

let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 500)}`);
  }
}

function parse(result: any): any {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Tool returned no text content');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Built by concatenation because the LaTeX delimiters sit directly against
// Mustache braces, which reads as JS interpolation inside a template literal.
const QUESTION_HTML = [
  '<pl-question-panel>',
  '  <p>What is $' + '{{params.a}} + {{params.b}}$?</p>',
  '</pl-question-panel>',
  '',
  '<pl-integer-input answers-name="c" label="$c =$"></pl-integer-input>',
  '',
].join('\n');

const INFO_JSON = {
  uuid: 'f1e2d3c4-b5a6-4789-9abc-def012345678',
  title: 'Agent loop test',
  topic: 'Algebra',
  tags: ['test'],
  type: 'v3',
};

/** Correct implementation. */
const SERVER_PY_GOOD = `import random


def generate(data):
    a = random.randint(1, 10)
    b = random.randint(1, 10)
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["c"] = a + b
`;

/**
 * Raises only when \`a\` happens to be 7. This is the class of bug that a single
 * "New variant" click almost always misses.
 */
const SERVER_PY_BROKEN = `import random


def generate(data):
    a = random.randint(1, 10)
    b = random.randint(1, 10)
    if a == 7:
        raise ValueError("seed-dependent failure: a == 7")
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["c"] = a + b
`;

async function writeQuestion(serverPy: string) {
  const dir = path.join(coursePath, 'questions', QID);
  await fs.ensureDir(dir);
  await fs.writeJson(path.join(dir, 'info.json'), INFO_JSON, { spaces: 4 });
  await fs.writeFile(path.join(dir, 'question.html'), QUESTION_HTML);
  await fs.writeFile(path.join(dir, 'server.py'), serverPy);
}

async function main() {
  if (coursePath.startsWith(REPOSITORY_ROOT_PATH)) {
    throw new Error(`Refusing to write into the PrairieLearn repository: ${coursePath}`);
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: [
      'tsx',
      '--tsconfig',
      path.join(APP_ROOT_PATH, 'src/tsconfig.json'),
      path.join(APP_ROOT_PATH, 'src/mcp-server.ts'),
      '--course-id',
      courseId,
    ],
    cwd: APP_ROOT_PATH,
    env: process.env as Record<string, string>,
    stderr: 'pipe',
  });

  const client = new Client({ name: 'loop-test', version: '0.1.0' });
  transport.stderr?.on('data', () => {});
  await client.connect(transport);

  // Rendering dozens of variants comfortably exceeds the SDK's 60s default.
  const TIMEOUT = { timeout: 600_000 };

  const callSync = async () =>
    parse(await client.callTool({ name: 'sync_course', arguments: {} }, undefined, TIMEOUT));
  const callTest = async (count: number, seedPrefix: string) =>
    parse(
      await client.callTool(
        { name: 'test_question', arguments: { qid: QID, count, seedPrefix } },
        undefined,
        TIMEOUT,
      ),
    );

  try {
    console.log('\n== 1. author a new question, sync, verify ==');
    await writeQuestion(SERVER_PY_GOOD);
    const sync1 = await callSync();
    check('sync succeeds', sync1?.status === 'complete' && !sync1?.hadJsonErrors, sync1?.problems);

    const listed = parse(
      await client.callTool({ name: 'list_entities', arguments: { scope: 'questions' } }),
    );
    check(
      'new question appears in list_entities',
      listed.some((q: any) => q.qid === QID),
    );

    const good = await callTest(4, 'loop-good');
    check('new question passes its tests', good?.passed === true, good?.failures);

    console.log('\n== 2. plant a seed-dependent bug ==');
    await writeQuestion(SERVER_PY_BROKEN);
    const sync2 = await callSync();
    check('broken version still syncs (bug is runtime, not schema)', sync2?.status === 'complete');

    // 12 iterations of each type over a 1-10 range makes hitting a == 7 nearly certain.
    const broken = await callTest(12, 'loop-broken');
    check('test cycle catches the seed-dependent bug', broken?.passed === false, broken?.summary);

    const failure = broken?.failures?.[0];
    check('failure reports the exact seed', typeof failure?.variantSeed === 'string', failure);
    check(
      'failure includes the Python traceback',
      typeof failure?.issues?.[0]?.output === 'string' &&
        failure.issues[0].output.includes('seed-dependent failure'),
      failure?.issues?.[0]?.output?.slice(0, 200),
    );

    console.log('\n== 3. reproduce deterministically with the same seed prefix ==');
    const rerun = await callTest(12, 'loop-broken');
    check(
      'same seeds reproduce the same failure count',
      rerun?.summary?.failed === broken?.summary?.failed,
      {
        first: broken?.summary,
        second: rerun?.summary,
      },
    );

    console.log('\n== 4. fix and re-verify ==');
    await writeQuestion(SERVER_PY_GOOD);
    await callSync();
    const fixed = await callTest(12, 'loop-broken');
    check(
      'fixed question passes on the previously failing seeds',
      fixed?.passed === true,
      fixed?.failures,
    );

    console.log('\n== 5. malformed info.json surfaces as a sync error ==');
    await fs.writeJson(
      path.join(coursePath, 'questions', QID, 'info.json'),
      { uuid: INFO_JSON.uuid, title: 'Broken', type: 'v3', topic: 'Algebra', bogusProperty: true },
      { spaces: 4 },
    );
    const sync3 = await callSync();
    check('sync reports the schema problem', (sync3?.problems?.length ?? 0) > 0, sync3?.problems);
    const problem = sync3?.problems?.find((p: any) => p.identifier === QID);
    check('problem is attributed to the right question', !!problem, sync3?.problems);
  } finally {
    // Leave the scratch course clean for the next run.
    await fs.remove(path.join(coursePath, 'questions', QID));
    await callSync().catch(() => {});
    await client.close();
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
