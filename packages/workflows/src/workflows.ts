import crypto from 'node:crypto';

import { type PoolConfig } from 'pg';

import { logger } from '@prairielearn/logger';
import { type PoolClient, PostgresPool, loadSqlEquiv } from '@prairielearn/postgres';

import {
  type StepResult,
  type WorkflowDefinition,
  type WorkflowLogger,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowRunStatus,
} from './workflows.types.js';

/**
 * Thrown when an operation cannot proceed because the workflow run is not in
 * the expected status (e.g. attempting to continue a run that is not
 * `'waiting_for_input'`).
 */
export class WorkflowConflictError extends Error {
  constructor(
    message: string,
    public readonly runId: string,
  ) {
    super(message);
    this.name = 'WorkflowConflictError';
  }
}

const sql = loadSqlEquiv(import.meta.url);

const pool = new PostgresPool();

const registeredWorkflows = new Map<string, WorkflowDefinition<any>>();
// Unique identifier for this server process, used as the soft-lock owner
// in the `locked_by` column to prevent concurrent execution of the same run.
const serverUuid = crypto.randomUUID();

// How often the crash-recovery cron checks for abandoned workflow runs.
const DEFAULT_CRON_INTERVAL_MS = 60_000;

let cronInterval: NodeJS.Timeout | null = null;
let recoveryInProgress = false;

/**
 * Initializes the workflow engine by creating a dedicated database connection
 * pool. The `workflow_runs` table must already exist (created via a migration
 * in `apps/prairielearn/src/migrations/`). Must be called before any other
 * workflow functions.
 *
 * Uses a separate pool from the application's default pool to avoid deadlocks,
 * since workflows may hold soft locks for extended periods.
 *
 * @param pgConfig - Postgres connection configuration.
 * @param idleErrorHandler - Called when an idle client emits an error.
 */
export async function init(
  pgConfig: PoolConfig,
  idleErrorHandler: (error: Error, client: PoolClient) => void,
): Promise<void> {
  await pool.initAsync(pgConfig, idleErrorHandler);
}

/**
 * Shuts down the workflow engine by stopping the crash-recovery cron loop
 * (if running) and closing the database connection pool.
 */
export async function close(): Promise<void> {
  await stopCronLoop();
  await pool.closeAsync();
}

/**
 * Registers a workflow definition so the engine knows how to execute it.
 * Must be called at application startup before any runs of this type are
 * started or resumed. Each `type` can only be registered once.
 *
 * @param definition - The workflow definition including a unique `type` string
 * and a `takeStep` function that implements the workflow's domain logic.
 * Throws if a workflow with the same `type` is already registered.
 */
export function registerWorkflow<TState extends Record<string, unknown>>(
  definition: WorkflowDefinition<TState>,
): void {
  if (registeredWorkflows.has(definition.type)) {
    throw new Error(`Workflow type '${definition.type}' is already registered`);
  }
  registeredWorkflows.set(definition.type, definition);
}

/**
 * Creates a new workflow run and begins executing its step loop asynchronously.
 * Returns the newly created run immediately (with status `'running'`); the
 * step loop continues in the background.
 *
 * @param type - The registered workflow type identifier.
 * @param opts - Options for creating the workflow run.
 * @param opts.initialState - The starting state passed to the first `takeStep` call.
 * @param opts.context - Opaque domain-specific metadata (e.g. `{ assessment_question_id: 42 }`)
 * stored alongside the run for querying; the engine never inspects this value.
 * @param opts.phase - Optional initial phase label for display/debugging.
 * @returns The persisted workflow run record. Throws if no workflow is registered.
 */
export async function startWorkflow<TState extends Record<string, unknown>>(
  type: string,
  opts: {
    initialState: TState;
    context?: Record<string, unknown>;
    phase?: string;
  },
): Promise<WorkflowRun<TState>> {
  const definition = registeredWorkflows.get(type);
  if (!definition) {
    throw new Error(`No workflow registered for type '${type}'`);
  }

  const result = await pool.queryRow(
    sql.insert_run,
    {
      type,
      status: 'running',
      phase: opts.phase ?? null,
      state: JSON.stringify(opts.initialState),
      context: JSON.stringify(opts.context ?? {}),
    },
    WorkflowRunSchema,
  );

  const run = result as WorkflowRun<TState>;

  // Start executing the workflow asynchronously
  executeWorkflow(run.id, definition).catch((err) => {
    logger.error(`Failed to execute workflow ${run.id}`, err);
  });

  return run;
}

/**
 * Resumes execution of a workflow that is in `'running'` status but not
 * currently being executed (e.g. after a server crash). Acquires the soft
 * lock and re-enters the step loop from the last persisted state.
 *
 * Primarily used internally by the crash-recovery cron, but can be called
 * directly if needed.
 *
 * @param runId - The ID of the workflow run to resume. Throws if the run is not
 * in `'running'` status or no workflow is registered for its type.
 */
export async function resumeWorkflow(runId: string): Promise<void> {
  const run = await getWorkflowRun(runId);
  if (run.status !== 'running') {
    throw new Error(
      `Cannot resume workflow ${runId}: status is '${run.status}', expected 'running'`,
    );
  }

  const definition = registeredWorkflows.get(run.type);
  if (!definition) {
    throw new Error(`No workflow registered for type '${run.type}'`);
  }

  await executeWorkflow(runId, definition);
}

/**
 * Cancels a workflow run by setting its status to `'canceled'`, clearing any
 * soft lock, and recording `completed_at`. Has no effect on runs that are
 * already in a terminal state (`'completed'`, `'error'`, `'canceled'`).
 *
 * If the workflow is currently being executed by another server, the running
 * loop will observe the status change on its next iteration and exit.
 *
 * @param runId - The ID of the workflow run to cancel. Throws if the run is
 * not found or is already in a terminal state.
 */
export async function cancelWorkflow(runId: string): Promise<void> {
  const result = await pool.queryAsync(sql.cancel_run, { id: runId });
  if (result.rowCount === 0) {
    throw new Error(`Cannot cancel workflow ${runId}: not found or already in a terminal state`);
  }
}

/**
 * Provides human-in-the-loop input to a paused workflow. Merges `stateUpdate`
 * into the run's existing state (shallow JSON merge via `||` in Postgres),
 * transitions the status from `'waiting_for_input'` back to `'running'`, and
 * resumes the step loop asynchronously.
 *
 * @param runId - The ID of the workflow run to continue.
 * @param stateUpdate - Partial state to merge into the existing run state.
 * Typically contains user-provided input that the next `takeStep` call
 * will read (e.g. `{ approved_rubric: true }`). Throws if the run is not
 * found or not in `'waiting_for_input'` status.
 */
export async function continueWorkflow<TState extends Record<string, unknown>>(
  runId: string,
  stateUpdate: Partial<TState>,
): Promise<void> {
  // Verify the workflow definition exists before mutating DB state, so we
  // don't move the run out of 'waiting_for_input' only to fail on a missing
  // registration (e.g. deploy mismatch or retired type).
  //
  // Note: if a type is permanently retired and no server registers it, the
  // run will sit in its current status indefinitely (the cron also skips
  // unknown types). TODO: add an admin query or cron job to auto-cancel
  // runs whose types are no longer registered.
  const run = await getWorkflowRun(runId);
  const definition = registeredWorkflows.get(run.type);
  if (!definition) {
    throw new Error(`No workflow registered for type '${run.type}'`);
  }

  const result = await pool.queryAsync(sql.continue_run, {
    id: runId,
    state_update: JSON.stringify(stateUpdate),
  });

  if (result.rowCount === 0) {
    throw new WorkflowConflictError(
      `Cannot continue workflow ${runId}: not found or not in 'waiting_for_input' status`,
      runId,
    );
  }

  // Resume execution asynchronously
  executeWorkflow(runId, definition).catch((err) => {
    logger.error(`Failed to resume workflow ${runId} after continue`, err);
  });
}

/**
 * Fetches a workflow run by its ID.
 *
 * @param runId - The ID of the workflow run.
 * @returns The full workflow run record with state cast to `TState`. Throws
 * if no run exists with the given ID.
 */
export async function getWorkflowRun<TState extends Record<string, unknown>>(
  runId: string,
): Promise<WorkflowRun<TState>> {
  return (await pool.queryRow(
    sql.select_run_by_id,
    { id: runId },
    WorkflowRunSchema,
  )) as WorkflowRun<TState>;
}

/**
 * Finds the most recent active workflow run (status `'running'` or
 * `'waiting_for_input'`) that matches the given type and whose `context`
 * contains all key-value pairs in `contextFilter` (uses Postgres `@>`
 * containment).
 *
 * Useful for checking whether a workflow is already in progress for a
 * particular entity before starting a new one.
 *
 * @param type - The registered workflow type identifier.
 * @param contextFilter - Key-value pairs that must be present in the run's
 * `context` column (e.g. `{ assessment_question_id: 42 }`).
 * @returns The matching run, or `null` if none is active.
 */
export async function getActiveWorkflowRun<TState extends Record<string, unknown>>(
  type: string,
  contextFilter: Record<string, unknown>,
): Promise<WorkflowRun<TState> | null> {
  return (await pool.queryOptionalRow(
    sql.select_active_run,
    {
      type,
      context_filter: JSON.stringify(contextFilter),
    },
    WorkflowRunSchema,
  )) as WorkflowRun<TState> | null;
}

/**
 * Appends text to a workflow run's `output` column. This can be called from
 * outside the workflow execution loop (e.g., from a route handler) to write
 * logs to the workflow run without holding the execution lock.
 */
export async function appendWorkflowOutput(runId: string, text: string): Promise<void> {
  await pool.queryAsync(sql.append_output, { id: runId, text });
}

async function executeWorkflow<TState extends Record<string, unknown>>(
  runId: string,
  definition: WorkflowDefinition<TState>,
): Promise<void> {
  // Acquire lock
  const lockResult = await pool.queryAsync(sql.acquire_lock, {
    id: runId,
    locked_by: serverUuid,
  });

  if (lockResult.rowCount === 0) {
    logger.info(`Could not acquire lock for workflow ${runId}, skipping`);
    return;
  }

  const abortController = new AbortController();

  // Start heartbeat
  const heartbeatInterval = setInterval(async () => {
    try {
      const result = await pool.queryAsync(sql.update_heartbeat, {
        id: runId,
        locked_by: serverUuid,
      });
      if (result.rowCount === 0) {
        logger.warn(`Lost lock ownership for workflow ${runId}, aborting`);
        abortController.abort();
        clearInterval(heartbeatInterval);
      }
    } catch (err) {
      logger.error(`Failed to update heartbeat for workflow ${runId}`, err);
    }
  }, 30_000);

  // The try-finally ensures cleanup (heartbeat, abort signal, DB lock) runs
  // regardless of how the loop exits. Step errors are caught inside the loop
  // and persisted to the DB; unexpected errors (e.g. persistStep failure)
  // propagate to the caller and the crash-recovery cron picks up the run.
  try {
    while (true) {
      // Read current run state from DB
      const currentRun = await getWorkflowRun<TState>(runId);

      if (currentRun.status !== 'running') {
        break;
      }

      const workflowLogger = createLogger(runId);

      let stepResult: StepResult<TState>;
      try {
        stepResult = await definition.takeStep({
          run: currentRun,
          logger: workflowLogger,
          signal: abortController.signal,
        });
      } catch (err) {
        // Flush any logs the step produced before recording the error.
        await workflowLogger.flush();
        const errorMessage = err instanceof Error ? err.message : String(err);
        await persistStep(runId, serverUuid, {
          state: currentRun.state,
          status: 'error',
          error_message: errorMessage,
        });
        break;
      }

      // Flush buffered log lines before persisting step state, while we
      // still hold the lock so the write is guaranteed to succeed.
      await workflowLogger.flush();

      // Map 'continue' to 'running' for DB storage
      const dbStatus: WorkflowRunStatus =
        stepResult.status === 'continue' ? 'running' : stepResult.status;

      const updated = await persistStep(runId, serverUuid, {
        state: stepResult.state,
        status: dbStatus,
        phase: stepResult.phase,
        error_message: stepResult.error_message,
      });

      if (!updated || stepResult.status !== 'continue') {
        break;
      }
    }
  } finally {
    // Stop heartbeat and release lock
    clearInterval(heartbeatInterval);
    abortController.abort();
    await pool.queryAsync(sql.release_lock, { id: runId, locked_by: serverUuid }).catch((err) => {
      logger.error(`Failed to release lock for workflow ${runId}`, err);
    });
  }
}

async function persistStep<TState extends Record<string, unknown>>(
  runId: string,
  lockedBy: string,
  result: {
    state: TState;
    status: WorkflowRunStatus;
    phase?: string;
    error_message?: string;
  },
): Promise<boolean> {
  const updateResult = await pool.queryAsync(sql.update_step, {
    id: runId,
    locked_by: lockedBy,
    state: JSON.stringify(result.state),
    status: result.status,
    phase: result.phase ?? null,
    error_message: result.error_message ?? null,
  });
  // Returns false if the row was not updated (e.g. run was canceled or lock was lost)
  return (updateResult.rowCount ?? 0) > 0;
}

/**
 * Creates a workflow logger that buffers log lines in memory and flushes
 * them to the database synchronously within the step loop (before lock
 * release). This avoids the race where async fire-and-forget writes land
 * after the lock is released and get silently dropped.
 */
function createLogger(runId: string): WorkflowLogger & { flush(): Promise<void> } {
  const buffer: string[] = [];

  return {
    info(msg: string) {
      logger.info(`Workflow ${runId}: ${msg}`);
      buffer.push(`[INFO] ${msg}\n`);
    },
    error(msg: string) {
      logger.error(`Workflow ${runId}: ${msg}`);
      buffer.push(`[ERROR] ${msg}\n`);
    },
    async flush() {
      if (buffer.length === 0) return;
      // Drain the buffer and concatenate in one step.
      const drained = buffer.splice(0);
      const text = drained.join('');
      try {
        await pool.queryAsync(sql.append_output, { id: runId, text });
      } catch (err) {
        // Restore drained logs so they can be retried on the next flush.
        buffer.unshift(...drained);
        logger.error(`Failed to append log output for workflow ${runId}`, err);
      }
    },
  };
}

/**
 * Starts a periodic background loop that recovers abandoned workflow runs.
 * On each tick it finds runs that are `'running'` but have either a stale
 * heartbeat (> 2 minutes old, indicating the executing server crashed) or
 * no lock at all, and calls {@link resumeWorkflow} on each.
 *
 * Should be called once at application startup, after {@link init}.
 *
 * @param opts - Options.
 * @param opts.intervalMs - How often to check for stale runs, in milliseconds
 * (defaults to 60,000). Throws if the cron loop is already running.
 */
export function startCronLoop(opts?: { intervalMs?: number }): void {
  const intervalMs = opts?.intervalMs ?? DEFAULT_CRON_INTERVAL_MS;

  if (cronInterval) {
    throw new Error('Cron loop is already running');
  }

  cronInterval = setInterval(async () => {
    if (recoveryInProgress) return;
    recoveryInProgress = true;
    try {
      await recoverStaleRuns();
    } catch (err) {
      logger.error('Failed to recover stale workflow runs', err);
    } finally {
      recoveryInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stops the crash-recovery cron loop started by {@link startCronLoop}.
 * Safe to call even if the loop is not running (no-op in that case).
 */
export async function stopCronLoop(): Promise<void> {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

async function recoverStaleRuns(): Promise<void> {
  // Find runs with stale heartbeats (locked but heartbeat > 2 minutes ago)
  const staleRuns = await pool.queryRows(sql.select_stale_runs, {}, WorkflowRunSchema);

  for (const run of staleRuns) {
    logger.info(`Recovering stale workflow run ${run.id} (type: ${run.type})`);
    try {
      await resumeWorkflow(run.id);
    } catch (err) {
      logger.error(`Failed to recover workflow ${run.id}`, err);
    }
  }

  // Also pick up runs that are 'running' but have no lock (e.g., server crashed before locking)
  const unlockedRuns = await pool.queryRows(
    sql.select_unlocked_running_runs,
    {},
    WorkflowRunSchema,
  );

  for (const run of unlockedRuns) {
    const definition = registeredWorkflows.get(run.type);
    if (!definition) continue;

    logger.info(`Resuming unlocked workflow run ${run.id} (type: ${run.type})`);
    try {
      await executeWorkflow(run.id, definition);
    } catch (err) {
      logger.error(`Failed to resume unlocked workflow ${run.id}`, err);
    }
  }
}
