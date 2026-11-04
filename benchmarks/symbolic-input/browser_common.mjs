// Benchmark-only helpers for driving a target commit's pl-symbolic-input
// element in headless Chromium.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';

const CONTENT_TYPES = {
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
};

/**
 * Parse the shared command-line options, resolve Playwright and the browser
 * packages from the main checkout, and assert the package versions.
 */
export async function setup(extraOptions = {}) {
  const { values: args } = parseArgs({
    options: {
      'node-root': { type: 'string' },
      'expect-compute-engine': { type: 'string' },
      'expect-mathlive': { type: 'string' },
      ...extraOptions,
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
  const packagePath = (name, ...rest) => path.join(appRoot, 'node_modules', name, ...rest);
  const packageVersion = async (name) =>
    JSON.parse(await readFile(packagePath(name, 'package.json'), 'utf8')).version;

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
  return { args, appRoot, chromium, packagePath, versions };
}

/**
 * The page-relative scripts a target's element loads: jQuery (provided by the
 * PrairieLearn page layout), then its info.json dependencies in order.
 */
export async function targetScripts(elementDir) {
  const info = JSON.parse(await readFile(path.join(elementDir, 'info.json'), 'utf8'));
  return [
    '/node_modules/jquery/dist/jquery.min.js',
    ...(info.dependencies.nodeModulesScripts ?? []).map((script) => `/node_modules/${script}`),
    ...(info.dependencies.elementScripts ?? []).map((script) => `/element/${script}`),
  ];
}

/**
 * Open a page for a target, served from an origin rather than setContent() so
 * MathLive can resolve its fonts relative to its script URL and focus works.
 * `beforeNavigate(page)` runs after the page exists but before it loads.
 */
export async function openTargetPage(context, { appRoot, elementDir, beforeNavigate }) {
  const scripts = await targetScripts(elementDir);
  const body = `<!doctype html><html><body><form id="bench-form"></form>
${scripts.map((src) => `<script src="${src}"></script>`).join('\n')}
</body></html>`;
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('http://bench.test/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body });
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
  await beforeNavigate?.(page);
  await page.goto('http://bench.test/');
  await page.waitForFunction(() => typeof window.PLSymbolicInput === 'function');
  return { page, pageErrors, scripts };
}

/** Replace the form with a rendered question panel and initialize it. */
export async function loadCase(page, html) {
  await page.evaluate((html) => {
    // Inline <script> tags do not run through innerHTML, so initialize the
    // element directly, as its $(function () { ... }) wrapper would.
    document.getElementById('bench-form').innerHTML = html;
    window.PLSymbolicInput('bench');
  }, html);
}
