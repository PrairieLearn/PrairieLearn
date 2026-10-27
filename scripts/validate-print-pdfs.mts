#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

const VERAPDF_VERSION = '1.30.3';
const USAGE =
  'Usage: node scripts/validate-print-pdfs.mts --output <new-directory> [--verapdf <executable>] <pdf>...';

const ReportSchema = z.object({
  report: z.object({
    jobs: z
      .array(
        z.object({
          validationResult: z
            .array(
              z.object({
                jobEndStatus: z.literal('normal'),
                profileName: z.literal('PDF/UA-1 validation profile'),
                compliant: z.boolean(),
                details: z.object({
                  failedChecks: z.number().int().nonnegative(),
                  failedRules: z.number().int().nonnegative(),
                  ruleSummaries: z
                    .array(
                      z.object({
                        clause: z.string(),
                        testNumber: z.number(),
                        description: z.string(),
                        failedChecks: z.number(),
                        checks: z.array(
                          z.object({ context: z.string(), errorMessage: z.string() }),
                        ),
                      }),
                    )
                    .default([]),
                }),
              }),
            )
            .length(1),
        }),
      )
      .length(1),
    batchSummary: z.object({
      totalJobs: z.literal(1),
      outOfMemory: z.literal(0),
      veraExceptions: z.literal(0),
      failedEncryptedJobs: z.literal(0),
      failedParsingJobs: z.literal(0),
      validationSummary: z.object({ failedJobCount: z.literal(0) }),
    }),
  }),
});

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      output: { type: 'string' },
      verapdf: { type: 'string', default: 'verapdf' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (!values.output || positionals.length === 0) throw new Error(USAGE);

  const version = spawnSync(values.verapdf, ['--version'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (version.error) throw version.error;
  if (version.status !== 0) throw new Error(`veraPDF failed: ${version.stderr}`);
  const installedVersion = /^veraPDF (\S+)/m.exec(version.stdout)?.[1];
  if (installedVersion !== VERAPDF_VERSION) {
    throw new Error(
      `Expected veraPDF ${VERAPDF_VERSION}; found ${installedVersion ?? 'no version'}.`,
    );
  }

  const output = resolve(values.output);
  await mkdir(output);
  await writeFile(join(output, 'version.txt'), version.stdout);
  const summaries: string[] = [];

  for (const [index, input] of positionals.entries()) {
    const name = `${index + 1}-${basename(input)}`;
    const retainedPdf = join(output, name);
    const reportPath = `${retainedPdf}.report`;
    try {
      await copyFile(input, retainedPdf);
      const result = spawnSync(
        values.verapdf,
        ['--flavour', 'ua1', '--format', 'json', '--maxfailuresdisplayed', '-1', retainedPdf],
        { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
      );
      await writeFile(`${reportPath}.json`, result.stdout ?? '');
      await writeFile(`${reportPath}.log`, result.stderr ?? '');
      if (result.error) throw result.error;
      const report = ReportSchema.parse(JSON.parse(result.stdout));
      const validation = report.report.jobs[0].validationResult[0];
      const { failedChecks, failedRules, ruleSummaries } = validation.details;
      const passed = result.status === 0 && validation.compliant && failedChecks === 0;
      const summary = `${passed ? 'PASS' : 'FAIL'} ${name}: ${failedChecks} failed checks across ${failedRules} rules (exit ${result.status}).`;
      const details = ruleSummaries.flatMap((rule) => [
        `${rule.clause}, test ${rule.testNumber}: ${rule.failedChecks} failed checks`,
        rule.description,
        ...rule.checks.map((check) => `  ${check.context}\n  ${check.errorMessage}`),
        '',
      ]);
      await writeFile(`${reportPath}.txt`, [summary, '', ...details].join('\n'));
      summaries.push(summary);
      if (!passed) process.exitCode = 1;
    } catch (error) {
      const summary = `ERROR ${name}: ${error instanceof Error ? error.message : String(error)}`;
      await writeFile(`${reportPath}.txt`, `${summary}\n`);
      summaries.push(summary);
      process.exitCode = 1;
    }
  }

  await writeFile(join(output, 'summary.txt'), `${summaries.join('\n')}\n`);
  console.log(summaries.join('\n'));
  console.log(`Retained PDFs and reports: ${output}`);
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
