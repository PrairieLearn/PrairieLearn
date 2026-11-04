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

import { text } from 'node:stream/consumers';

import { loadCase, openTargetPage, setup } from './browser_common.mjs';

const { appRoot, chromium, versions } = await setup();
const input = JSON.parse(await text(process.stdin));

async function submitCase(page, html) {
  await loadCase(page, html);
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
    const { page, pageErrors } = await openTargetPage(browser, { appRoot, elementDir });
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
