#!/usr/bin/env node
// Benchmark-only: load each case into the real pl-symbolic-input formula
// editor in headless Chromium, then focus, blur, and submit it as a student
// would, and read back the hidden submission fields.
//
// Input (stdin): one JSON object
//   {"targets": {<name>: {"elementDir": string}},
//    "cases": [{"id": string, "html": {<name>: string}}]}
// where each `html` is that target's question panel restoring the case's
// saved `-latex` value.
// Output (stdout): a {"ready": true, ...} line, then one JSON line per case and
// target: {"id", "target", "submission", "latex", "mathjson"}.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'node-root': { type: 'string' },
    'expect-compute-engine': { type: 'string' },
    'expect-mathlive': { type: 'string' },
  },
});
for (const name of ['node-root', 'expect-compute-engine', 'expect-mathlive']) {
  if (!args[name]) throw new Error(`--${name} is required`);
}

const appRoot = path.join(args['node-root'], 'apps/prairielearn');
const require = createRequire(path.join(appRoot, 'package.json'));
const { chromium } = require('@playwright/test');

// Read packages from disk because Compute Engine's `exports` map hides both
// its package.json and the UMD bundle the element loads.
function packagePath(name, ...rest) {
  return path.join(appRoot, 'node_modules', name, ...rest);
}

async function packageVersion(name) {
  return JSON.parse(await readFile(packagePath(name, 'package.json'), 'utf8')).version;
}

const versions = {
  computeEngine: await packageVersion('@cortex-js/compute-engine'),
  mathlive: await packageVersion('mathlive'),
  playwright: require('@playwright/test/package.json').version,
};
if (versions.computeEngine !== args['expect-compute-engine']) {
  throw new Error(
    `Expected Compute Engine ${args['expect-compute-engine']}, found ${versions.computeEngine}`,
  );
}
if (versions.mathlive !== args['expect-mathlive']) {
  throw new Error(`Expected MathLive ${args['expect-mathlive']}, found ${versions.mathlive}`);
}

const input = JSON.parse(await text(process.stdin));

const CONTENT_TYPES = {
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
};

// Serve the page from an origin, not setContent(), so MathLive can resolve its
// fonts and sounds relative to its script URL and keyboard focus works. Load
// order matches the element's info.json dependencies.
const PAGE = `<!doctype html><html><body><form id="bench-form"></form>
<script src="/node_modules/jquery/dist/jquery.min.js"></script>
<script src="/node_modules/@cortex-js/compute-engine/dist/umd-min/compute-engine.cjs"></script>
<script src="/node_modules/mathlive/mathlive.min.js"></script>
<script src="/element/pl-symbolic-input.js"></script>
</body></html>`;

async function openTargetPage(browser, elementDir) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('http://bench.test/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
    let file;
    if (pathname.startsWith('/node_modules/')) file = path.join(appRoot, pathname);
    else if (pathname.startsWith('/element/')) {
      file = path.join(elementDir, pathname.slice('/element/'.length));
    }
    if (!file) return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({
        contentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        body: await readFile(file),
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('http://bench.test/');
  await page.waitForFunction(() => typeof window.PLSymbolicInput === 'function');
  return { page, pageErrors };
}

async function submitCase(page, html) {
  await page.evaluate((html) => {
    // Inline <script> tags do not run through innerHTML, so initialize the
    // element directly, as its $(function () { ... }) wrapper would.
    document.getElementById('bench-form').innerHTML = html;
    window.PLSymbolicInput('bench');
  }, html);
  await page.focus('#symbolic-input-bench');
  // Leaving the field runs blur validation, which may insert placeholders;
  // submitting re-syncs the hidden fields in the capture phase.
  return await page.evaluate(() => {
    const form = document.getElementById('bench-form');
    document.getElementById('symbolic-input-bench').blur();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const result = {
      submission: $('#symbolic-input-sub-bench').val(),
      latex: $('#symbolic-input-latex-bench').val(),
      mathjson: $('#symbolic-input-json-bench').val() ?? null,
    };
    form.replaceChildren();
    return result;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  process.stdout.write(
    JSON.stringify({ ready: true, versions, browser: browser.version() }) + '\n',
  );
  for (const [target, { elementDir }] of Object.entries(input.targets)) {
    const { page, pageErrors } = await openTargetPage(browser, elementDir);
    for (const { id, html } of input.cases) {
      const result = await submitCase(page, html[target]);
      if (pageErrors.length > 0) throw pageErrors[0];
      process.stdout.write(JSON.stringify({ id, target, ...result }) + '\n');
    }
    await page.close();
  }
} finally {
  await browser.close();
}
