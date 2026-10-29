import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';

import { REPOSITORY_ROOT_PATH } from '../paths.js';

import { createPdfOutput } from './pdf-output.js';
import { withPrintPdfDirectory } from './pdf-tools.js';

it('exports tagged PDF math, figures, and document structure from source semantics', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Accessible assessment</title>
          <style>
            @page { size: letter; margin: 0; }
            body { margin: 36px; font: 16px Arial; }
          </style>
        </head>
        <body>
          <h1>Accessible assessment</h1>
          <p lang="fr">Lisez chaque question.</p>
          <h2>Question 1</h2>
          <ol><li>Read the expression.</li><li>Explain your answer.</li></ol>
          <p>Evaluate
            <mjx-container data-semantic-speech-none="x squared" style="display: inline-block">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24">
                <text x="0" y="18">x²</text>
              </svg>
            </mjx-container>.
          </p>
          <svg xmlns="http://www.w3.org/2000/svg" role="img" width="48" height="48" style="display: block">
            <title>A square</title>
            <desc>All four sides are equal</desc>
            <rect x="4" y="4" width="40" height="40" fill="none" stroke="black" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A circle"
               aria-describedby="circle-description" width="48" height="48" style="display: block">
            <circle cx="24" cy="24" r="20" fill="none" stroke="black" />
          </svg>
          <p id="circle-description" hidden>The radius is twenty units</p>
          <table>
            <caption>Values</caption>
            <thead><tr><th id="input" scope="col">Input</th><th id="result" scope="col">Result</th></tr></thead>
            <tbody><tr><td headers="input">2</td><td headers="result">4</td></tr></tbody>
          </table>
          <footer data-print-pdf-role="Artifact">Page 1</footer>
        </body>
      </html>`);

    const pdf = await createPdfOutput().produce(page);
    await withPrintPdfDirectory(async (directory) => {
      const filename = path.join(directory, 'assessment.pdf');
      const decodedPath = path.join(directory, 'decoded.pdf');
      await writeFile(filename, pdf);
      await execa(
        process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java',
        [
          '-Djava.awt.headless=true',
          '-jar',
          path.join(REPOSITORY_ROOT_PATH, '.local', 'print-pdf-tools', 'pdfbox-app-3.0.8.jar'),
          'decode',
          filename,
          decodedPath,
        ],
      );
      const decoded = await readFile(decodedPath, 'latin1');
      for (const role of ['H1', 'H2', 'L', 'LI', 'Table', 'TH', 'TD', 'Formula', 'Figure']) {
        expect(decoded).toMatch(new RegExp(`/S /${role}\\b`));
      }
      expect(decoded).toContain('/Alt (x squared)');
      expect(decoded).toContain('/Alt (A square. All four sides are equal)');
      expect(decoded).toContain('/Alt (A circle. The radius is twenty units)');
      expect(decoded).toContain('/Lang (fr)');
      expect(decoded).toContain('/Artifact BMC');
      expect(decoded).toContain('/DisplayDocTitle true');
    });
  } finally {
    await browser.close();
  }
}, 60_000);
