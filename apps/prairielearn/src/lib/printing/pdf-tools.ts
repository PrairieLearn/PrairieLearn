import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { z } from 'zod';

import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from '../paths.js';

import type { PdfAccessibilityManifest } from './pdf-accessibility-browser.js';

const toolsDirectory = path.join(REPOSITORY_ROOT_PATH, '.local', 'print-pdf-tools');
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
const verapdf = path.join(toolsDirectory, 'verapdf', 'verapdf');

const ValidationReportSchema = z.object({
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
                details: z.object({ failedChecks: z.number().int().nonnegative() }),
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

export class PrintPdfValidationError extends Error {
  constructor(
    readonly reportPath: string,
    options?: ErrorOptions,
  ) {
    super(
      'The PDF failed accessibility validation. Check image descriptions, mathematical expressions, table headers, and document language, then regenerate the preview. The server retained a validation report for diagnosis.',
      options,
    );
  }
}

export async function runPrintPdfTool(
  source: 'PrintPdf' | 'PrintPdfFinalize',
  args: string[],
  signal?: AbortSignal,
) {
  await execa(
    java,
    [
      '-Xmx512m',
      '-Djava.awt.headless=true',
      '--class-path',
      path.join(toolsDirectory, 'pdfbox-app-3.0.8.jar'),
      path.join(APP_ROOT_PATH, 'src', 'lib', 'printing', `${source}.java`),
      ...args,
    ],
    { timeout: 120_000, cancelSignal: signal },
  );
}

let validatorVersion: Promise<void> | undefined;

/** Validate the bytes that will be downloaded, after all PDF modifications. */
export async function validatePrintPdf(filename: string, signal?: AbortSignal): Promise<void> {
  validatorVersion ??= execa(verapdf, ['--version'], { timeout: 30_000 }).then(({ stdout }) => {
    if (!/^veraPDF 1\.30\.3(?:\s|$)/m.test(stdout)) {
      throw new Error(
        'PDF exports require veraPDF 1.30.3. Run scripts/install-print-pdf-tools.sh.',
      );
    }
  });
  await validatorVersion;
  const result = await execa(
    verapdf,
    ['--flavour', 'ua1', '--format', 'json', '--maxfailuresdisplayed', '-1', filename],
    { timeout: 120_000, maxBuffer: 64 * 1024 * 1024, reject: false, cancelSignal: signal },
  );
  const reportPath = `${filename}.validation.json`;
  await writeFile(reportPath, result.stdout);
  await writeFile(`${filename}.validation.log`, result.stderr);
  let report: z.infer<typeof ValidationReportSchema>;
  try {
    report = ValidationReportSchema.parse(JSON.parse(result.stdout));
  } catch (error) {
    throw new PrintPdfValidationError(reportPath, { cause: error });
  }
  const validation = report.report.jobs[0].validationResult[0];
  if (result.failed || !validation.compliant || validation.details.failedChecks !== 0) {
    throw new PrintPdfValidationError(reportPath);
  }
}

/** Remove temporary PDFs; retain diagnostic reports when validation fails. */
export async function withPrintPdfDirectory<T>(
  produce: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'prairielearn-pdf-'));
  let failed = true;
  try {
    const output = await produce(directory);
    failed = false;
    return output;
  } finally {
    if (failed) {
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.validation.json') && !name.endsWith('.validation.log')) {
          await rm(path.join(directory, name), { force: true });
        }
      }
    }
    if (!failed || (await readdir(directory)).length === 0) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function xmlAttribute(value: string): string {
  return value.replaceAll(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

/** Finalize generated documents and assembled packets before validation. */
export async function finalizePrintPdf(
  input: string,
  output: string,
  manifest: PdfAccessibilityManifest,
  signal?: AbortSignal,
): Promise<void> {
  const manifestPath = `${output}.xml`;
  const tags = manifest.tags.map(
    (tag) =>
      `<tag marker="${xmlAttribute(tag.marker)}" role="${xmlAttribute(tag.role)}"${tag.alt === undefined ? '' : ` alt="${xmlAttribute(tag.alt)}"`}${tag.decorativePaint ? ' decorativePaint="true"' : ''}/>`,
  );
  const links = manifest.links.map(
    (link) => `<link uri="${xmlAttribute(link.uri)}" alt="${xmlAttribute(link.alt)}"/>`,
  );
  await writeFile(
    manifestPath,
    `<document title="${xmlAttribute(manifest.title)}" language="${xmlAttribute(manifest.language)}">${tags.join('')}${links.join('')}</document>`,
  );
  await runPrintPdfTool('PrintPdfFinalize', [input, output, manifestPath], signal);
}
