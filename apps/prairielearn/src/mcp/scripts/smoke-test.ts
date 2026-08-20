#!/usr/bin/env node
//
// Drives the MCP server over stdio the way a real client does, exercising every
// tool and asserting on the results. Local development only.
//
// Usage:
//   tsx src/mcp/scripts/smoke-test.ts --course-id 1

import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import minimist from 'minimist';

import { APP_ROOT_PATH } from '../../lib/paths.js';

// `pnpm run <script> -- --flag` forwards the `--` separator into our argv, and
// minimist would otherwise treat every flag after it as a positional argument.
const argv = minimist(process.argv.slice(2).filter((arg) => arg !== '--'));
const courseId = String(argv['course-id'] ?? '1');

let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

/** Unwraps the JSON text content our tools return. */
function parse(result: any): any {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Tool returned no text content');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
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

  const client = new Client({ name: 'smoke-test', version: '0.1.0' });

  transport.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  await client.connect(transport);

  console.log('\n== handshake ==');
  const { tools } = await client.listTools();
  const toolNames = tools.map((tool) => tool.name).sort();
  console.log(`  tools: ${toolNames.join(', ')}`);
  check(
    'all five tools registered',
    ['get_job_output', 'list_entities', 'query_course_data', 'sync_course', 'test_question'].every(
      (name) => toolNames.includes(name),
    ),
    toolNames,
  );
  check(
    'instructions include the course path',
    (client.getInstructions() ?? '').includes('pl-agent-scratch'),
  );

  console.log('\n== list_entities ==');
  const questions = parse(
    await client.callTool({ name: 'list_entities', arguments: { scope: 'questions' } }),
  );
  check('returns questions', Array.isArray(questions) && questions.length > 0, {
    count: questions?.length,
  });
  const sample = questions.find((q: any) => q.qid === 'addNumbers') ?? questions[0];
  check(
    'question has id, qid and path',
    !!sample?.question_id && !!sample?.qid && !!sample?.path,
    sample,
  );
  check('path is repo-relative', sample?.path?.startsWith('questions/'), sample?.path);

  const assessments = parse(
    await client.callTool({ name: 'list_entities', arguments: { scope: 'assessments' } }),
  );
  check('returns assessments', Array.isArray(assessments) && assessments.length > 0, {
    count: assessments?.length,
  });

  console.log('\n== query_course_data ==');
  const counts = parse(
    await client.callTool({
      name: 'query_course_data',
      arguments: {
        query: `SELECT count(*)::int AS n FROM questions WHERE course_id = ${courseId} AND deleted_at IS NULL`,
      },
    }),
  );
  check('SELECT returns rows', counts?.rows?.[0]?.n > 0, counts);
  check(
    'reports columns',
    Array.isArray(counts?.columns) && counts.columns.includes('n'),
    counts?.columns,
  );

  const rejectedWrite = await client.callTool({
    name: 'query_course_data',
    arguments: { query: "UPDATE questions SET title = 'nope'" },
  });
  check('rejects UPDATE', rejectedWrite.isError === true, rejectedWrite);

  const rejectedMulti = await client.callTool({
    name: 'query_course_data',
    arguments: { query: 'SELECT 1; SELECT 2' },
  });
  check('rejects multiple statements', rejectedMulti.isError === true, rejectedMulti);

  const rejectedDdl = await client.callTool({
    name: 'query_course_data',
    arguments: { query: 'WITH x AS (SELECT 1) SELECT * FROM x; DROP TABLE users' },
  });
  check('rejects trailing DDL', rejectedDdl.isError === true, rejectedDdl);

  const literalDollar = parse(
    await client.callTool({
      name: 'query_course_data',
      arguments: { query: "SELECT 'costs $5 or $name' AS s" },
    }),
  );
  check(
    'does not mangle $ in string literals',
    literalDollar?.rows?.[0]?.s === 'costs $5 or $name',
    literalDollar,
  );

  console.log('\n== sync_course ==');
  const sync = parse(await client.callTool({ name: 'sync_course', arguments: {} }));
  check('sync completes', sync?.status === 'complete', { status: sync?.status });
  check('no JSON errors on a clean course', sync?.hadJsonErrors === false, sync?.problems);

  console.log('\n== test_question ==');
  const good = parse(
    await client.callTool({
      name: 'test_question',
      arguments: { qid: 'addNumbers', count: 2, seedPrefix: 'smoke' },
    }),
  );
  check('known-good question passes', good?.passed === true, good?.failures ?? good);
  check('reports 6 runs (2 x 3 test types)', good?.summary?.total === 6, good?.summary);

  const missing = await client.callTool({
    name: 'test_question',
    arguments: { qid: 'does-not-exist', count: 1 },
  });
  check('unknown qid returns an error', missing.isError === true, missing);

  // `brokenGeneration` raises in `server.py`'s generate(). This is the signal
  // the issue-triage workflow depends on: a reproducible seed plus a traceback.
  const broken = parse(
    await client.callTool({
      name: 'test_question',
      arguments: { qid: 'brokenGeneration', count: 1, seedPrefix: 'smoke-broken' },
    }),
  );
  check('detects a broken question', broken?.passed === false, broken?.summary);
  check(
    'failure includes a variant seed',
    !!broken?.failures?.[0]?.variantSeed,
    broken?.failures?.[0],
  );
  check(
    'failure includes the Python traceback',
    typeof broken?.failures?.[0]?.issues?.[0]?.output === 'string' &&
      broken.failures[0].issues[0].output.length > 0,
    broken?.failures?.[0]?.issues?.[0],
  );

  console.log('\n== get_job_output ==');
  const jobIds = parse(
    await client.callTool({
      name: 'query_course_data',
      arguments: {
        query: `SELECT id FROM job_sequences WHERE course_id = ${courseId} ORDER BY id DESC LIMIT 1`,
      },
    }),
  );
  if (jobIds?.rows?.length) {
    const job = parse(
      await client.callTool({
        name: 'get_job_output',
        arguments: { jobSequenceId: String(jobIds.rows[0].id) },
      }),
    );
    check('reads job sequence', !!job?.jobSequenceId && Array.isArray(job?.jobs), job);
  } else {
    console.log('  SKIP  no job sequences in this course yet');
  }

  await client.close();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
