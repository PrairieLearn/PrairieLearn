#!/usr/bin/env node
// Benchmark-only: measure the browser-side cost of a target's pl-symbolic-input
// element in headless Chromium.
//
// Input (stdin): one JSON object
//   {"targets": {<name>: {"elementDir": string}},
//    "cases": [{"id": string, "html": {<name>: string}}],
//    "dispatches": number, "loadSamples": number, "throttles": [number]}
// Output (stdout): one JSON object with per-case handler timings, first-field
// initialization, script load metrics, and script sizes.
//
// Handlers are timed by dispatching synthetic `input` and `blur` events on
// the field, which runs exactly the listeners the element registers. Each
// sample times a batch of dispatches because performance.now() is coarsened
// to 100 microseconds without cross-origin isolation.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';

import { loadCase, openTargetPage, setup, targetScripts } from './browser_common.mjs';

const { appRoot, chromium, versions } = await setup();
const input = JSON.parse(await text(process.stdin));
const targets = Object.entries(input.targets);

async function throttle(context, page, rate) {
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  return session;
}

async function measureCase(page, html, dispatches) {
  await loadCase(page, html);
  return await page.evaluate((dispatches) => {
    const mf = document.getElementById('symbolic-input-bench');
    const time = (type) => {
      // Warm up, and let blur normalization settle the field's value.
      for (let i = 0; i < 3; i++) mf.dispatchEvent(new Event(type));
      const start = performance.now();
      for (let i = 0; i < dispatches; i++) mf.dispatchEvent(new Event(type));
      return (performance.now() - start) / dispatches;
    };
    const result = { inputMs: time('input'), blurMs: time('blur') };
    document.getElementById('bench-form').replaceChildren();
    return result;
  }, dispatches);
}

async function measureHandlers(browser, rate) {
  const pages = {};
  for (const [target, { elementDir }] of targets) {
    const context = await browser.newContext();
    const opened = await openTargetPage(context, { appRoot, elementDir });
    await throttle(context, opened.page, rate);
    pages[target] = opened;
  }
  const results = [];
  for (const [index, { id, html }] of input.cases.entries()) {
    // Alternate which target goes first so drift affects both equally.
    const order = index % 2 === 0 ? targets : [...targets].reverse();
    for (const [target] of order) {
      const { page, pageErrors } = pages[target];
      const timing = await measureCase(page, html[target], input.dispatches);
      if (pageErrors.length > 0) throw pageErrors[0];
      results.push({ id, target, rate, ...timing });
    }
  }
  for (const { page } of Object.values(pages)) await page.context().close();
  return results;
}

async function measureLoad(browser, rate, firstHtml) {
  const samples = [];
  for (let sample = 0; sample < input.loadSamples; sample++) {
    const order = sample % 2 === 0 ? targets : [...targets].reverse();
    for (const [target, { elementDir }] of order) {
      const context = await browser.newContext();
      // Throttle and enable metrics before navigation so script evaluation
      // during page load is measured under the same conditions.
      let session;
      const opened = await openTargetPage(context, {
        appRoot,
        elementDir,
        beforeNavigate: async (page) => {
          session = await throttle(context, page, rate);
          await session.send('Performance.enable');
        },
      });
      const { metrics } = await session.send('Performance.getMetrics');
      const metric = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
      const firstFieldMs = await opened.page.evaluate((html) => {
        document.getElementById('bench-form').innerHTML = html;
        const start = performance.now();
        window.PLSymbolicInput('bench');
        return performance.now() - start;
      }, firstHtml[target]);
      if (opened.pageErrors.length > 0) throw opened.pageErrors[0];
      samples.push({
        target,
        rate,
        scriptDurationMs: metric.ScriptDuration * 1000,
        taskDurationMs: metric.TaskDuration * 1000,
        jsHeapUsedBytes: metric.JSHeapUsedSize,
        firstFieldMs,
      });
      await context.close();
    }
  }
  return samples;
}

async function scriptSizes() {
  const sizes = {};
  for (const [target, { elementDir }] of targets) {
    sizes[target] = [];
    for (const script of await targetScripts(elementDir)) {
      const file = script.startsWith('/element/')
        ? path.join(elementDir, script.slice('/element/'.length))
        : path.join(appRoot, script);
      const bytes = await readFile(file);
      sizes[target].push({
        script,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
      });
    }
  }
  return sizes;
}

const browser = await chromium.launch({ headless: true });
try {
  const output = {
    versions,
    browser: browser.version(),
    dispatches: input.dispatches,
    handlers: [],
    load: [],
    sizes: await scriptSizes(),
  };
  for (const rate of input.throttles) {
    output.load.push(...(await measureLoad(browser, rate, input.cases[0].html)));
    output.handlers.push(...(await measureHandlers(browser, rate)));
  }
  process.stdout.write(JSON.stringify(output) + '\n');
} finally {
  await browser.close();
}
