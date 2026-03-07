import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv } from '@prairielearn/postgres';

import { pool } from './init.js';
import type { CronLoopOptions } from './types.js';
import { resumeWorkflow } from './workflow-engine.js';
import { WorkflowRunRowSchema } from './workflow-run.js';

const sql = loadSqlEquiv(import.meta.filename);

const DEFAULT_INTERVAL_MS = 60_000;

let abortController: AbortController | null = null;
let running = false;

export function startCronLoop(opts: CronLoopOptions = {}): void {
  if (running) throw new Error('Workflow cron loop is already running');
  abortController = new AbortController();
  // Intentionally fire-and-forget; the loop runs until stopCronLoop() is called.
  void loop(opts);
}

async function loop(opts: CronLoopOptions): Promise<void> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  running = true;

  while (running) {
    if (abortController?.signal.aborted) {
      running = false;
      return;
    }

    try {
      await recoverStaleWorkflows();
    } catch (err) {
      logger.error('Error in workflow cron loop', err);
    }

    try {
      await sleep(intervalMs, null, { ref: false, signal: abortController!.signal });
    } catch {
      continue;
    }
  }
}

async function recoverStaleWorkflows(): Promise<void> {
  const staleRuns = await pool.queryRows(
    sql.select_stale_running_workflows,
    {},
    WorkflowRunRowSchema,
  );

  for (const run of staleRuns) {
    try {
      await resumeWorkflow(run.id);
    } catch (err) {
      logger.error(`Failed to resume stale workflow run ${run.id}`, err);
    }
  }
}

export async function stopCronLoop(): Promise<void> {
  if (!abortController) return;
  abortController.abort();

  while (running) {
    await sleep(100);
  }

  abortController = null;
}
