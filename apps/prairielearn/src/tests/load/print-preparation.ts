import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { type Request, chromium } from 'playwright';
import { z } from 'zod';

const ScenarioSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  export: z.enum(['form', 'booklet']),
  copies: z.number().int().min(1).max(500).optional(),
});
const ConfigSchema = z.object({
  storageState: z.string(),
  scenarios: z.array(ScenarioSchema).min(1),
  serverPid: z.number().int().positive().optional(),
  targets: z
    .object({
      maxFailures: z.number().int().nonnegative().optional(),
      previewP95Ms: z.number().positive().optional(),
      exportP95Ms: z.number().positive().optional(),
      peakRssBytes: z.number().positive().optional(),
    })
    .optional(),
});

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
}

interface WorkloadResult {
  user: number;
  scenario: string;
  jobSequenceId: string | null;
  previewMs: number;
  exportMs: number | null;
  downloadMs: number | null;
  bytes: number;
  error: string | null;
}

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index === -1 || !value || value.startsWith('--')) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function safeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) =>
      ['accept', 'content-type', 'cookie', 'origin', 'x-csrf-token', 'x-trpc'].includes(
        key.toLowerCase(),
      ),
    ),
  );
}

function getHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'content-type'),
  );
}

async function capturedRequest(request: Request): Promise<CapturedRequest> {
  return {
    url: request.url(),
    headers: safeHeaders(await request.allHeaders()),
    body: request.postDataBuffer() ?? undefined,
  };
}

async function captureScenario(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  storageState: string,
  scenario: z.infer<typeof ScenarioSchema>,
) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const previews: Promise<CapturedRequest>[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/print/preview')) {
      previews.push(capturedRequest(request));
    }
  });
  try {
    await page.goto(scenario.url);
    await page.getByRole('button', { name: 'Create preview', exact: true }).click();
    await page.getByRole('button', { name: 'Download', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    let resolveExport!: (request: CapturedRequest) => void;
    let rejectExport!: (error: unknown) => void;
    const exportRequest = new Promise<CapturedRequest>((resolve, reject) => {
      resolveExport = resolve;
      rejectExport = reject;
    });
    await page.route('**/printableAssessmentExport.pdf', async (route) => {
      try {
        const captured = await capturedRequest(route.request());
        await route.abort();
        resolveExport(captured);
      } catch (error) {
        rejectExport(error);
      }
    });
    if (scenario.export === 'form') {
      await page.getByRole('button', { name: 'Download Form A (PDF)', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Download booklet PDF…', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Download booklet PDF', exact: true });
      if (scenario.copies) {
        await modal
          .getByRole('spinbutton', { name: 'Number of students' })
          .fill(String(scenario.copies));
      }
      await modal.getByRole('button', { name: 'Download booklet PDF', exact: true }).click();
    }
    const exportCall = await exportRequest;
    if (previews.length === 0) throw new Error(`No previews were captured for ${scenario.name}`);
    return { name: scenario.name, previews: await Promise.all(previews), exportCall };
  } finally {
    await context.close();
  }
}

async function drain(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: 0, prefix: '' };
  const prefix: Uint8Array[] = [];
  let prefixBytes = 0;
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (prefixBytes < 65_536) {
      const part = chunk.value.subarray(0, 65_536 - prefixBytes);
      prefix.push(part);
      prefixBytes += part.byteLength;
    }
  }
  return { bytes, prefix: Buffer.concat(prefix).toString('utf8') };
}

function trpcData(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  const data = z
    .object({ result: z.object({ data: z.object({ json: z.record(z.string(), z.unknown()) }) }) })
    .safeParse(parsed);
  if (!data.success) {
    const error = z
      .object({ error: z.object({ json: z.object({ message: z.string() }) }) })
      .safeParse(parsed);
    const result = z.object({ result: z.object({ data: z.unknown() }) }).safeParse(parsed);
    throw new Error(
      error.success
        ? error.data.error.json.message
        : `Unexpected print export result: ${result.success ? Object.keys(result.data.result.data ?? {}).join(',') : typeof parsed}`,
    );
  }
  return data.data.result.data.json;
}

async function runUser(
  user: number,
  workload: Awaited<ReturnType<typeof captureScenario>>,
  timeoutMs: number,
): Promise<WorkloadResult> {
  const result: WorkloadResult = {
    user,
    scenario: workload.name,
    jobSequenceId: null,
    previewMs: 0,
    exportMs: null,
    downloadMs: null,
    bytes: 0,
    error: null,
  };
  try {
    const previewStarted = performance.now();
    for (const preview of workload.previews) {
      const response = await fetch(preview.url, {
        headers: preview.headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      await drain(response);
      if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}`);
    }
    result.previewMs = performance.now() - previewStarted;

    const exportStarted = performance.now();
    const response = await fetch(workload.exportCall.url, {
      method: 'POST',
      headers: workload.exportCall.headers,
      body: workload.exportCall.body ? Uint8Array.from(workload.exportCall.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await drain(response);
    if (!response.ok) throw new Error(`Export returned HTTP ${response.status}`);
    if (body.prefix.includes('"type":"inline"')) {
      result.exportMs = performance.now() - exportStarted;
      result.bytes = body.bytes;
      return result;
    }
    const data = trpcData(body.prefix);
    const jobSequenceId = z.string().parse(data.jobSequenceId);
    result.jobSequenceId = jobSequenceId;
    const statusUrl = new URL(workload.exportCall.url.replace('.pdf', '.status'));
    statusUrl.search = '';
    statusUrl.searchParams.set('input', JSON.stringify({ json: { jobSequenceId } }));
    let downloadUrl: URL | null = null;
    while (performance.now() - exportStarted < timeoutMs) {
      const statusResponse = await fetch(statusUrl, {
        headers: getHeaders(workload.exportCall.headers),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const status = trpcData((await drain(statusResponse)).prefix);
      if (status.status === 'Error' || status.status === 'Stopped') {
        throw new Error(
          z.string().safeParse(status.failureMessage).data ?? 'Background export failed',
        );
      }
      if (status.ready === true) {
        downloadUrl = new URL(
          workload.exportCall.url.replace(
            '/trpc/printableAssessmentExport.pdf',
            `/print_preparation/exports/${jobSequenceId}.pdf`,
          ),
        );
        downloadUrl.search = '';
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (!downloadUrl) throw new Error('Background export timed out');
    result.exportMs = performance.now() - exportStarted;
    const downloadStarted = performance.now();
    const download = await fetch(downloadUrl, {
      headers: getHeaders(workload.exportCall.headers),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const downloaded = await drain(download);
    if (!download.ok) throw new Error(`Download returned HTTP ${download.status}`);
    result.downloadMs = performance.now() - downloadStarted;
    result.bytes = downloaded.bytes;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1]);
}

async function main() {
  const configPath = argument('--config');
  const users = z.coerce.number().int().positive().parse(argument('--users', '200'));
  const timeoutMs = z.coerce.number().int().positive().parse(argument('--timeout-ms', '1200000'));
  const outputPath = argument('--output', '/tmp/print-preparation-load.json');
  const config = ConfigSchema.parse(JSON.parse(await fs.readFile(configPath, 'utf8')));
  if (config.targets?.peakRssBytes && !config.serverPid) {
    throw new Error('A memory target requires serverPid');
  }
  const allowRemote = process.argv.includes('--allow-remote');
  for (const scenario of config.scenarios) {
    const hostname = new URL(scenario.url).hostname;
    if (!allowRemote && !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      throw new Error('Remote load tests require --allow-remote');
    }
  }

  const browser = await chromium.launch({ headless: true });
  let workloads: Awaited<ReturnType<typeof captureScenario>>[];
  try {
    workloads = [];
    for (const scenario of config.scenarios) {
      workloads.push(await captureScenario(browser, config.storageState, scenario));
    }
  } finally {
    await browser.close();
  }

  const memory = { peakRssBytes: null as number | null };
  const sampler = config.serverPid
    ? setInterval(() => {
        try {
          const rssKb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(config.serverPid)]));
          memory.peakRssBytes = Math.max(memory.peakRssBytes ?? 0, rssKb * 1024);
        } catch {
          // The server may have exited during the test.
        }
      }, 500)
    : null;
  const startedAt = new Date().toISOString();
  const results = await Promise.all(
    Array.from({ length: users }, (_, index) =>
      runUser(index + 1, workloads[index % workloads.length], timeoutMs),
    ),
  );
  if (sampler) clearInterval(sampler);
  const summary = {
    startedAt,
    users,
    successes: results.filter((result) => !result.error).length,
    failures: results.filter((result) => result.error).length,
    peakRssBytes: memory.peakRssBytes,
    previewMs: {
      p50: percentile(
        results.map((result) => result.previewMs).filter((time) => time > 0),
        0.5,
      ),
      p95: percentile(
        results.map((result) => result.previewMs).filter((time) => time > 0),
        0.95,
      ),
    },
    exportMs: {
      p50: percentile(
        results.flatMap((result) => result.exportMs ?? []),
        0.5,
      ),
      p95: percentile(
        results.flatMap((result) => result.exportMs ?? []),
        0.95,
      ),
    },
    byScenario: Object.fromEntries(
      workloads.map((workload) => {
        const matching = results.filter((result) => result.scenario === workload.name);
        return [
          workload.name,
          {
            successes: matching.filter((result) => !result.error).length,
            failures: matching.filter((result) => result.error).length,
            previewP95Ms: percentile(
              matching.map((result) => result.previewMs).filter((time) => time > 0),
              0.95,
            ),
            exportP95Ms: percentile(
              matching.flatMap((result) => result.exportMs ?? []),
              0.95,
            ),
          },
        ];
      }),
    ),
    results,
  };
  const targetFailures = [
    config.targets?.maxFailures !== undefined && summary.failures > config.targets.maxFailures
      ? `Failures ${summary.failures} exceeded ${config.targets.maxFailures}`
      : null,
    config.targets?.previewP95Ms !== undefined &&
    summary.previewMs.p95 !== null &&
    summary.previewMs.p95 > config.targets.previewP95Ms
      ? `Preview p95 ${summary.previewMs.p95} ms exceeded ${config.targets.previewP95Ms} ms`
      : null,
    config.targets?.exportP95Ms !== undefined &&
    summary.exportMs.p95 !== null &&
    summary.exportMs.p95 > config.targets.exportP95Ms
      ? `Export p95 ${summary.exportMs.p95} ms exceeded ${config.targets.exportP95Ms} ms`
      : null,
    config.targets?.peakRssBytes !== undefined &&
    summary.peakRssBytes !== null &&
    summary.peakRssBytes > config.targets.peakRssBytes
      ? `Peak RSS ${summary.peakRssBytes} bytes exceeded ${config.targets.peakRssBytes} bytes`
      : null,
  ].filter((failure) => failure !== null);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ ...summary, targetFailures }, null, 2));
  process.stdout.write(
    `${JSON.stringify({ ...summary, targetFailures, results: undefined }, null, 2)}\n`,
  );
  if (targetFailures.length > 0) process.exitCode = 1;
}

await main();
