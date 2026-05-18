import crypto from 'node:crypto';

import { type PoolConfig } from 'pg';

import { logger } from '@prairielearn/logger';
import { type PoolClient, PostgresPool, loadSqlEquiv } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import {
  type StepResult,
  type WorkflowContext,
  type WorkflowDefinition,
  type WorkflowLogger,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowRunStatus,
} from './workflows.types.js';

const sql = loadSqlEquiv(import.meta.url);

const pool = new PostgresPool();

const registeredWorkflows = new Map<string, WorkflowDefinition<any>>();
// Unique identifier for this server process, used as the soft-lock owner
// in the `locked_by` column to prevent concurrent execution of the same run.
const serverUuid = crypto.randomUUID();

// How often the recovery loop checks for abandoned workflow runs.
const DEFAULT_RECOVERY_INTERVAL_MS = 60_000;

// Cap on how many stale runs a single server processes in parallel per
// recovery tick. Each recovered run holds a soft lock and runs its step
// loop concurrently with the others, so this bounds the workflow load
// any one server imposes on itself during recovery.
const MAX_CONCURRENT_RECOVERY = 10;

let recoveryInterval: NodeJS.Timeout | null = null;
let recoveryInProgress = false;

/**
 * Initializes the workflow engine by creating a dedicated database connection
 * pool. The `workflow_runs` table must already exist (created via a migration
 * in `apps/prairielearn/src/migrations/`). Must be called before any other
 * workflow functions.
 *
 * Uses a separate pool from the application's default pool so that
 * long-running workflow connections don't starve request-serving queries.
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
 * Shuts down the workflow engine by stopping the crash-recovery loop
 * (if running) and closing the database connection pool.
 */
export async function close(): Promise<void> {
  await stopRecoveryLoop();
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
 * @param opts.context - Opaque domain-specific metadata (e.g. `{ assessment_question_id: '42' }`)
 * stored alongside the run for querying; the engine never inspects this value.
 * @returns The persisted workflow run record. Throws if no workflow is registered.
 */
export async function startWorkflow<TState extends Record<string, unknown>>(
  type: string,
  opts: {
    initialState: TState;
    context?: WorkflowContext;
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
      state: JSON.stringify(opts.initialState),
      context: JSON.stringify(opts.context ?? {}),
    },
    WorkflowRunSchema,
  );

  const run = result as WorkflowRun<TState>;

  // Start executing the workflow asynchronously
  executeWorkflow(run.id, definition).catch((err) => {
    logger.error(`Failed to execute workflow ${run.id}`, err);
    Sentry.captureException(err);
  });

  return run;
}

/**
 * Resumes execution of a workflow that is in `'running'` status but not
 * currently being executed (e.g. after a server crash). Acquires the soft
 * lock and re-enters the step loop from the last persisted state.
 *
 * Primarily used internally by the crash-recovery loop, but can be called
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
 * @param runId - The ID of the workflow run to cancel. Throws if the run
 * does not exist. No-ops if the run is already in a terminal state, for
 * idempotency.
 */
export async function cancelWorkflow(runId: string): Promise<void> {
  const rowCount = await pool.execute(sql.cancel_run, { id: runId });
  if (rowCount === 0) {
    // The SQL only skips terminal states, so rowCount=0 means either
    // the run doesn't exist or it's already terminated. Check which.
    const run = await pool.queryOptionalRow(sql.select_run_by_id, { id: runId }, WorkflowRunSchema);
    if (!run) {
      throw new Error(`Cannot cancel workflow ${runId}: not found`);
    }
    // Already in a terminal state — no-op for idempotency.
  }
}

/**
 * Provides human-in-the-loop input to a paused workflow. Merges `stateUpdate`
 * into the run's existing state (shallow JSON merge via `||` in Postgres),
 * transitions the status from `'waiting'` back to `'running'`, and
 * resumes the step loop asynchronously.
 *
 * @param runId - The ID of the workflow run to continue.
 * @param stateUpdate - Partial state to merge into the existing run state.
 * Typically contains user-provided input that the next `takeStep` call
 * will read (e.g. `{ approved_rubric: true }`). Throws if the run is not
 * found or not in `'waiting'` status.
 */
export async function continueWorkflow<TState extends Record<string, unknown>>(
  runId: string,
  stateUpdate: Partial<TState>,
): Promise<void> {
  // Verify the workflow definition exists before mutating DB state, so we
  // don't move the run out of 'waiting' only to fail on a missing
  // registration (e.g. deploy mismatch or retired type).
  //
  // Note: if a type is permanently retired and no server registers it, the
  // run will sit in its current status indefinitely (the recovery loop also
  // skips unknown types). TODO: add an admin query or scheduled job to auto-cancel
  // runs whose types are no longer registered.
  const run = await getWorkflowRun(runId);
  const definition = registeredWorkflows.get(run.type);
  if (!definition) {
    throw new Error(`No workflow registered for type '${run.type}'`);
  }

  const rowCount = await pool.execute(sql.continue_run, {
    id: runId,
    state_update: JSON.stringify(stateUpdate),
  });

  if (rowCount === 0) {
    throw new Error(`Cannot continue workflow ${runId}: not found or not in 'waiting' status`);
  }

  // Resume execution asynchronously
  executeWorkflow(runId, definition).catch((err) => {
    logger.error(`Failed to resume workflow ${runId} after continue`, err);
    Sentry.captureException(err);
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
 * `'waiting'`) that matches the given type and whose `context`
 * contains all key-value pairs in `contextFilter` (uses Postgres `@>`
 * containment).
 *
 * Useful for checking whether a workflow is already in progress for a
 * particular entity before starting a new one.
 *
 * @param type - The registered workflow type identifier.
 * @param contextFilter - Key-value pairs that must be present in the run's
 * `context` column (e.g. `{ assessment_question_id: '42' }`).
 * @returns The matching run, or `null` if none is active.
 */
export async function getActiveWorkflowRun<TState extends Record<string, unknown>>(
  type: string,
  contextFilter: WorkflowContext,
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
  await pool.execute(sql.append_output, { id: runId, text });
}

async function executeWorkflow<TState extends Record<string, unknown>>(
  runId: string,
  definition: WorkflowDefinition<TState>,
): Promise<void> {
  // Acquire lock
  const lockRowCount = await pool.execute(sql.acquire_lock, {
    id: runId,
    locked_by: serverUuid,
  });

  if (lockRowCount === 0) {
    logger.info(`Could not acquire lock for workflow ${runId}, skipping`);
    return;
  }

  const abortController = new AbortController();

  // Start heartbeat
  const heartbeatInterval = setInterval(async () => {
    try {
      const rowCount = await pool.execute(sql.update_heartbeat, {
        id: runId,
        locked_by: serverUuid,
      });
      if (rowCount === 0) {
        logger.warn(`Lost lock ownership for workflow ${runId}, aborting`);
        abortController.abort();
        clearInterval(heartbeatInterval);
      }
    } catch (err) {
      logger.error(`Failed to update heartbeat for workflow ${runId}`, err);
      Sentry.captureException(err);
    }
  }, 30_000);

  // The try-finally ensures cleanup (heartbeat, abort signal, DB lock) runs
  // regardless of how the loop exits. Step errors are caught inside the loop
  // and persisted to the DB; unexpected errors (e.g. persistStep failure)
  // propagate to the caller and the crash-recovery loop picks up the run.
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
    await pool.execute(sql.release_lock, { id: runId, locked_by: serverUuid }).catch((err) => {
      logger.error(`Failed to release lock for workflow ${runId}`, err);
      Sentry.captureException(err);
    });
  }
}

async function persistStep<TState extends Record<string, unknown>>(
  runId: string,
  lockedBy: string,
  result: {
    state: TState;
    status: WorkflowRunStatus;
    error_message?: string;
  },
): Promise<boolean> {
  const rowCount = await pool.execute(sql.update_step, {
    id: runId,
    locked_by: lockedBy,
    state: JSON.stringify(result.state),
    status: result.status,
    error_message: result.error_message ?? null,
  });
  // Returns false if the row was not updated (e.g. run was canceled or lock was lost)
  return rowCount > 0;
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
      buffer.push(`[INFO] ${msg}\n`);
    },
    error(msg: string) {
      buffer.push(`[ERROR] ${msg}\n`);
    },
    async flush() {
      if (buffer.length === 0) return;
      // Drain the buffer and concatenate in one step.
      const drained = buffer.splice(0);
      const text = drained.join('');
      try {
        await pool.execute(sql.append_output, { id: runId, text });
      } catch (err) {
        // Restore drained logs so they can be retried on the next flush.
        buffer.unshift(...drained);
        logger.error(`Failed to append log output for workflow ${runId}`, err);
        Sentry.captureException(err);
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
 * (defaults to 60,000). Throws if the recovery loop is already running.
 */
export function startRecoveryLoop(opts?: { intervalMs?: number }): void {
  const intervalMs = opts?.intervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS;

  if (recoveryInterval) {
    throw new Error('Recovery loop is already running');
  }

  recoveryInterval = setInterval(async () => {
    if (recoveryInProgress) return;
    recoveryInProgress = true;
    try {
      await recoverStaleRuns();
    } catch (err) {
      logger.error('Failed to recover stale workflow runs', err);
      Sentry.captureException(err);
    } finally {
      recoveryInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stops the crash-recovery loop started by {@link startRecoveryLoop}.
 * Safe to call even if the loop is not running (no-op in that case).
 */
export async function stopRecoveryLoop(): Promise<void> {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
}

async function recoverStaleRuns(): Promise<void> {
  // Find runs with stale heartbeats (locked but heartbeat > 2 minutes ago)
  // and runs that are 'running' but have no lock (e.g. server crashed before
  // it ever wrote a heartbeat). Both queries order by `created_at ASC` so
  // older runs are recovered first if more runs are stale than this server
  // can process in a single tick.
  const [staleRuns, unlockedRuns] = await Promise.all([
    pool.queryRows(sql.select_stale_runs, {}, WorkflowRunSchema),
    pool.queryRows(sql.select_unlocked_running_runs, {}, WorkflowRunSchema),
  ]);

  // Filter out runs whose type isn't registered on this server. During rolling
  // deploys, a server running old code may not have a newly-added workflow
  // type yet; silently skip so a server with the updated code handles it.
  const candidates = [...staleRuns, ...unlockedRuns].filter((run) =>
    registeredWorkflows.has(run.type),
  );

  // Bound parallelism so a backlog of stale runs can't pin every CPU on a
  // single server. Locks (`acquire_lock` filters to free / stale-heartbeat
  // rows) prevent two servers from picking up the same run.
  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT_RECOVERY) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT_RECOVERY);
    await Promise.all(
      batch.map(async (run) => {
        const definition = registeredWorkflows.get(run.type);
        if (!definition) return;
        logger.info(`Recovering workflow run ${run.id} (type: ${run.type})`);
        try {
          await executeWorkflow(run.id, definition);
        } catch (err) {
          logger.error(`Failed to recover workflow ${run.id}`, err);
          Sentry.captureException(err);
        }
      }),
    );
  }
}
