import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from '../paths.js';

import type { PdfAccessibilityManifest } from './pdf-accessibility-browser.js';

const toolsDirectory = path.join(REPOSITORY_ROOT_PATH, '.local', 'print-pdf-tools');
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';

export class PrintPdfAccessibilityError extends Error {}

async function runPrintPdfTool(
  source: 'PrintPdf' | 'PrintPdfFinalize',
  args: string[],
  signal?: AbortSignal,
) {
  const result = await execa(
    java,
    [
      '-Xmx512m',
      '-Djava.awt.headless=true',
      '--class-path',
      path.join(toolsDirectory, 'pdfbox-app-3.0.8.jar'),
      path.join(APP_ROOT_PATH, 'src', 'lib', 'printing', `${source}.java`),
      ...args,
    ],
    { timeout: 120_000, cancelSignal: signal, reject: false },
  );
  if (!result.failed) return;
  const prefix = 'PDF accessibility: ';
  if (result.exitCode === 2 && result.stderr.startsWith(prefix)) {
    const output = source === 'PrintPdfFinalize' && args[0] === 'metadata' ? args[2] : args[1];
    await writeFile(`${output}.accessibility.log`, result.stderr);
    throw new PrintPdfAccessibilityError(
      `${result.stderr.slice(prefix.length).trim()} Update the source content and try the export again.`,
      { cause: result },
    );
  }
  throw new Error(result.stderr || result.shortMessage, { cause: result });
}

/** Remove temporary PDFs; retain diagnostics when source accessibility checks fail. */
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
        if (!name.endsWith('.accessibility.log')) {
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

/** Restore source-declared semantics and finalize document metadata. */
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
