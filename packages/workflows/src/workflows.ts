import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import {
  type ContinueWorkflowOptions,
  type StartWorkflowOptions,
  type StepResult,
  type WorkflowDefinition,
  type WorkflowLogger,
  type WorkflowRun,
  WorkflowRunSchema,
} from './types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, WorkflowDefinition>();

// Track active abort controllers for running workflows so cancelWorkflow can
// signal them.
const activeControllers = new Map<string, AbortController>();

export function registerWorkflow(definition: WorkflowDefinition): void {
  if (registry.has(definition.type)) {
    throw new Error(`Workflow type "${definition.type}" is already registered`);
  }
  registry.set(definition.type, definition);
}

function getDefinition(type: string): WorkflowDefinition {
  const def = registry.get(type);
  if (!def) {
    throw new Error(`No workflow registered for type "${type}"`);
  }
  return def;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function init(): Promise<void> {
  await sqldb.execute(sql.create_table, {});
  await sqldb.execute(sql.create_indexes, {});
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startWorkflow(opts: StartWorkflowOptions): Promise<WorkflowRun> {
  const { type, context = {}, initialState = {}, initialPhase = 'initial', maxSteps = 1000 } = opts;

  // Verify the workflow type is registered.
  getDefinition(type);

  const run = await sqldb.queryRow(
    sql.insert_workflow_run,
    {
      workflow_type: type,
      phase: initialPhase,
      state: JSON.stringify(initialState),
      context: JSON.stringify(context),
      max_steps: maxSteps,
    },
    WorkflowRunSchema,
  );

  // Begin the step loop asynchronously — don't block the caller.
  executeStepLoop(run.id).catch((err) => {
    logger.error(`Workflow ${run.id} step loop failed unexpectedly`, err);
  });

  return run;
}

export async function resumeWorkflow(
  id: string,
  input?: Record<string, unknown>,
): Promise<WorkflowRun> {
  const run = await getWorkflowRun(id);
  if (run.status !== 'waiting_for_input') {
    throw new Error(
      `Cannot resume workflow ${id}: status is "${run.status}", expected "waiting_for_input"`,
    );
  }

  const newState = input ? { ...run.state, ...input } : run.state;

  const updated = await sqldb.queryOptionalRow(
    sql.set_running,
    {
      id,
      state: JSON.stringify(newState),
    },
    WorkflowRunSchema,
  );

  if (!updated) {
    throw new Error(`Failed to resume workflow ${id}: concurrent modification`);
  }

  // Begin the step loop asynchronously.
  executeStepLoop(id).catch((err) => {
    logger.error(`Workflow ${id} step loop failed unexpectedly`, err);
  });

  return updated;
}

export async function cancelWorkflow(id: string): Promise<WorkflowRun | null> {
  // If the workflow is currently executing, signal the abort controller.
  const controller = activeControllers.get(id);
  if (controller) {
    controller.abort();
  }

  return await sqldb.queryOptionalRow(sql.cancel_workflow, { id }, WorkflowRunSchema);
}

export async function continueWorkflow(
  id: string,
  stateUpdate: Record<string, unknown>,
  opts?: ContinueWorkflowOptions,
): Promise<WorkflowRun> {
  const run = await getWorkflowRun(id);
  if (run.status !== 'waiting_for_input') {
    throw new Error(
      `Cannot continue workflow ${id}: status is "${run.status}", expected "waiting_for_input"`,
    );
  }

  const newState = opts?.replace ? stateUpdate : { ...run.state, ...stateUpdate };

  const updated = await sqldb.queryOptionalRow(
    sql.set_running,
    {
      id,
      state: JSON.stringify(newState),
    },
    WorkflowRunSchema,
  );

  if (!updated) {
    throw new Error(`Failed to continue workflow ${id}: concurrent modification`);
  }

  executeStepLoop(id).catch((err) => {
    logger.error(`Workflow ${id} step loop failed unexpectedly`, err);
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getWorkflowRun(id: string): Promise<WorkflowRun> {
  return await sqldb.queryRow(sql.select_workflow_run, { id }, WorkflowRunSchema);
}

export async function getActiveWorkflowRun(
  type: string,
  contextFilter: Record<string, unknown>,
): Promise<WorkflowRun | null> {
  return await sqldb.queryOptionalRow(
    sql.select_active_workflow_run,
    {
      workflow_type: type,
      context: JSON.stringify(contextFilter),
    },
    WorkflowRunSchema,
  );
}

// ---------------------------------------------------------------------------
// Step loop
// ---------------------------------------------------------------------------

async function executeStepLoop(runId: string): Promise<void> {
  // Try to acquire the soft lock.
  const locked = await sqldb.queryOptionalRow(
    sql.acquire_soft_lock,
    { id: runId },
    WorkflowRunSchema,
  );

  if (!locked) {
    logger.info(`Workflow ${runId}: could not acquire lock, skipping`);
    return;
  }

  const controller = new AbortController();
  activeControllers.set(runId, controller);

  // Start heartbeat.
  const heartbeatInterval = setInterval(async () => {
    try {
      await sqldb.execute(sql.update_heartbeat, { id: runId });
    } catch (err) {
      logger.error(`Workflow ${runId}: heartbeat failed`, err);
    }
  }, 30_000);

  try {
    let stepCount = 0;
    let currentRun = locked;

    while (currentRun.status === 'running') {
      // Check max steps.
      stepCount++;
      if (stepCount > currentRun.max_steps) {
        await persistStepResult(runId, {
          phase: currentRun.phase,
          state: currentRun.state,
          status: 'failed',
          error_message: `Workflow exceeded max_steps limit of ${currentRun.max_steps}`,
        });
        break;
      }

      // Check abort signal.
      if (controller.signal.aborted) {
        break;
      }

      const definition = getDefinition(currentRun.workflow_type);

      // Build the logger.
      const outputLines: string[] = [];
      const workflowLogger: WorkflowLogger = {
        info(msg: string) {
          outputLines.push(`[INFO] ${msg}`);
        },
        error(msg: string) {
          outputLines.push(`[ERROR] ${msg}`);
        },
      };

      let result: StepResult;
      try {
        result = await definition.takeStep({
          run: currentRun,
          logger: workflowLogger,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const output = currentRun.output + outputLines.join('\n') + '\n';
        await persistStepResult(runId, {
          phase: currentRun.phase,
          state: currentRun.state,
          status: 'failed',
          output,
          error_message: errorMessage,
        });
        break;
      }

      // Append logger output.
      const newOutput =
        outputLines.length > 0
          ? currentRun.output + outputLines.join('\n') + '\n'
          : currentRun.output;

      const finalOutput = result.output ?? newOutput;

      currentRun = await persistStepResult(runId, {
        phase: result.phase,
        state: result.state,
        status: result.status,
        output: finalOutput,
        error_message: result.error_message ?? null,
      });

      // If the step returned a non-running status, exit the loop.
      if (result.status !== 'running') {
        break;
      }
    }
  } finally {
    clearInterval(heartbeatInterval);
    activeControllers.delete(runId);

    // Release the soft lock.
    try {
      await sqldb.execute(sql.release_soft_lock, { id: runId });
    } catch (err) {
      logger.error(`Workflow ${runId}: failed to release soft lock`, err);
    }
  }
}

async function persistStepResult(
  runId: string,
  result: {
    phase: string;
    state: Record<string, unknown>;
    status: string;
    output?: string;
    error_message?: string | null;
  },
): Promise<WorkflowRun> {
  return await sqldb.queryRow(
    sql.persist_step_result,
    {
      id: runId,
      status: result.status,
      phase: result.phase,
      state: JSON.stringify(result.state),
      output: result.output ?? '',
      error_message: result.error_message ?? null,
    },
    WorkflowRunSchema,
  );
}
