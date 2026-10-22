import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { selectJobsByJobSequenceId } from '../../lib/server-jobs.js';
import { selectAssessmentByTid } from '../../models/assessment.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({ features: { 'printable-exams': true } });

const execFileAsync = promisify(execFile);
const userCount = Number(process.env.PRINT_LOAD_USERS);

test.skip(
  !Number.isInteger(userCount) || userCount < 1,
  'Set PRINT_LOAD_USERS to run the load test',
);

test('measures concurrent print previews and exports on an isolated server', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  test.setTimeout(30 * 60_000);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'print-load-'));
  const storageState = path.join(tempDir, 'auth.json');
  const configPath = path.join(tempDir, 'config.json');
  const outputPath = path.join(os.tmpdir(), `print-load-results-${userCount}.json`);
  try {
    await page.goto(baseURL);
    await page.context().storageState({ path: storageState });

    const assessments = await Promise.all(
      ['exam20-assessmentTools', 'hw15-lockpoints'].map(async (tid) => ({
        tid,
        assessment: await selectAssessmentByTid({ course_instance_id: courseInstance.id, tid }),
      })),
    );
    const scenarios: { name: string; url: string; export: 'form' | 'booklet'; copies?: number }[] =
      assessments.map(({ tid, assessment }) => ({
        name: tid,
        url: `${baseURL}/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
        export: 'form',
      }));
    const bookletCopies = Number(process.env.PRINT_LOAD_BOOKLET_COPIES);
    if (Number.isInteger(bookletCopies) && bookletCopies > 0) {
      scenarios.push({
        name: `${assessments[0].tid} booklet ${bookletCopies}`,
        url: `${baseURL}/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessments[0].assessment.id}/print_preparation?instances=`,
        export: 'booklet',
        copies: bookletCopies,
      });
    }
    const port = new URL(baseURL).port;
    const serverPid = Number(
      execFileSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')[0],
    );
    await fs.writeFile(configPath, JSON.stringify({ storageState, serverPid, scenarios }));
    const { stdout } = await execFileAsync(
      'pnpm',
      [
        '--filter',
        '@prairielearn/prairielearn',
        'exec',
        'tsx',
        'src/tests/load/print-preparation.ts',
        '--config',
        configPath,
        '--users',
        String(userCount),
        '--output',
        outputPath,
      ],
      { cwd: path.resolve(import.meta.dirname, '../../../../..'), timeout: 25 * 60_000 },
    );
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8')) as {
      users: number;
      successes: number;
      failures: number;
      results: { error: string | null; jobSequenceId: string | null }[];
    };
    expect(result.users).toBe(userCount);
    expect(result.successes + result.failures).toBe(userCount);
    process.stdout.write(`${stdout}Results: ${outputPath}\n`);
    for (const failed of result.results) {
      if (!failed.error || !failed.jobSequenceId) continue;
      const jobs = await selectJobsByJobSequenceId(failed.jobSequenceId);
      process.stdout.write(
        `Failed export ${failed.jobSequenceId}: ${jobs.map((job) => job.error_message ?? job.output?.slice(0, 1000)).join(' | ')}\n`,
      );
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
