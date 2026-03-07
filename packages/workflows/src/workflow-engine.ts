import { randomUUID } from 'node:crypto';

import { logger } from '@prairielearn/logger';

import type {
  StartWorkflowOptions,
  StepResult,
  WorkflowLogger,
  WorkflowRunRow,
  WorkflowStepContext,
} from './types.js';
import { getWorkflowDefinition } from './workflow-registry.js';
import {
  acquireLock,
  cancelWorkflowRun,
  continueWorkflowRun,
  insertWorkflowRun,
  releaseLock,
  selectActiveWorkflowRun,
  selectWorkflowRun,
  updateHeartbeat,
  updateWorkflowRunAfterStep,
} from './workflow-run.js';

const DEFAULT_MAX_STEPS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export async function startWorkflow<TState>(
  type: string,
  opts: StartWorkflowOptions<TState>,
): Promise<WorkflowRunRow> {
  getWorkflowDefinition(type);

  const run = await insertWorkflowRun({
    type,
    state: opts.initialState,
    context: opts.context ?? {},
    phase: opts.phase ?? null,
  });

  // Fire-and-forget execution; errors are caught inside executeWorkflow.
  executeWorkflow(run.id).catch((err) => {
    logger.error(`Failed to execute workflow run ${run.id}`, err);
  });

  return run;
}

export async function resumeWorkflow(runId: string): Promise<void> {
  await executeWorkflow(runId);
}

export async function cancelWorkflow(runId: string): Promise<WorkflowRunRow | null> {
  return await cancelWorkflowRun(runId);
}

export async function continueWorkflow<TState>(
  runId: string,
  stateUpdate: Partial<TState>,
): Promise<void> {
  await continueWorkflowRun(runId, stateUpdate as Record<string, unknown>);

  // Fire-and-forget execution after continuing.
  executeWorkflow(runId).catch((err) => {
    logger.error(`Failed to execute workflow run ${runId} after continue`, err);
  });
}

export async function getWorkflowRun(runId: string): Promise<WorkflowRunRow> {
  return await selectWorkflowRun(runId);
}

export async function getActiveWorkflowRun(
  type: string,
  contextFilter: Record<string, unknown>,
): Promise<WorkflowRunRow | null> {
  return await selectActiveWorkflowRun(type, contextFilter);
}

async function executeWorkflow(runId: string, maxSteps: number = DEFAULT_MAX_STEPS): Promise<void> {
  const lockId = randomUUID();

  const lockedRun = await acquireLock(runId, lockId);
  if (!lockedRun) {
    return;
  }

  const heartbeatInterval = setInterval(() => {
    updateHeartbeat(runId, lockId).catch((err) => {
      logger.error(`Failed to update heartbeat for workflow run ${runId}`, err);
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    let stepCount = 0;

    while (stepCount < maxSteps) {
      const currentRun = await selectWorkflowRun(runId);
      if (currentRun.status !== 'running') break;

      const definition = getWorkflowDefinition(currentRun.type);

      let output = currentRun.output;
      const workflowLogger: WorkflowLogger = {
        info(msg: string) {
          output += `[INFO] ${msg}\n`;
        },
        error(msg: string) {
          output += `[ERROR] ${msg}\n`;
        },
      };

      const abortController = new AbortController();

      const context: WorkflowStepContext<unknown> = {
        run: currentRun as WorkflowRunRow & { state: unknown },
        logger: workflowLogger,
        signal: abortController.signal,
      };

      let stepResult: StepResult<unknown>;
      try {
        stepResult = await definition.takeStep(context);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        output += `[ERROR] Unhandled error: ${errorMessage}\n`;
        await updateWorkflowRunAfterStep(runId, {
          status: 'error',
          state: currentRun.state,
          phase: currentRun.phase,
          error_message: errorMessage,
          output,
        });
        return;
      }

      const dbStatus = stepResult.status === 'continue' ? 'running' : stepResult.status;

      await updateWorkflowRunAfterStep(runId, {
        status: dbStatus,
        state: stepResult.state,
        phase: stepResult.phase ?? null,
        error_message: stepResult.error_message ?? null,
        output,
      });

      if (stepResult.status !== 'continue') return;

      stepCount++;
    }

    if (stepCount >= maxSteps) {
      const currentRun = await selectWorkflowRun(runId);
      await updateWorkflowRunAfterStep(runId, {
        status: 'error',
        state: currentRun.state,
        phase: currentRun.phase,
        error_message: `Workflow exceeded maximum step limit of ${maxSteps}`,
        output: currentRun.output + `[ERROR] Exceeded maximum step limit of ${maxSteps}\n`,
      });
    }
  } finally {
    clearInterval(heartbeatInterval);
    try {
      await releaseLock(runId, lockId);
    } catch (err) {
      logger.error(`Failed to release lock for workflow run ${runId}`, err);
    }
  }
}
