import { afterAll, afterEach, assert, beforeAll, describe, it } from 'vitest';

import { makePostgresTestUtils } from '@prairielearn/postgres';

import { close, init, pool } from './init.js';
import { startCronLoop, stopCronLoop } from './workflow-cron.js';
import {
  cancelWorkflow,
  continueWorkflow,
  getActiveWorkflowRun,
  getWorkflowRun,
  resumeWorkflow,
  startWorkflow,
} from './workflow-engine.js';
import { clearRegistry, registerWorkflow } from './workflow-registry.js';
import { WorkflowRunRowSchema } from './workflow-run.js';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_workflows',
});

beforeAll(async () => {
  const pgConfig = await postgresTestUtils.createDatabase();
  await init(pgConfig, (err) => {
    throw err;
  });
});

afterEach(() => {
  clearRegistry();
});

afterAll(async () => {
  await close();
  await postgresTestUtils.dropDatabase();
});

describe('workflow engine', () => {
  it('completes a multi-step workflow', async () => {
    let stepCount = 0;

    registerWorkflow<{ count: number }>({
      type: 'test_complete',
      async takeStep() {
        stepCount++;
        if (stepCount >= 3) {
          return { state: { count: stepCount }, status: 'completed' };
        }
        return { state: { count: stepCount }, status: 'continue' };
      },
    });

    const run = await startWorkflow('test_complete', {
      initialState: { count: 0 },
    });

    // Wait for async execution to complete.
    await waitForTerminalStatus(run.id);

    const result = await getWorkflowRun(run.id);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.state, { count: 3 });
    assert.isNotNull(result.completed_at);
  });

  it('pauses for input and resumes', async () => {
    let step = 0;

    registerWorkflow<{ phase: string; feedback?: string }>({
      type: 'test_pause',
      async takeStep(ctx) {
        step++;
        const state = ctx.run.state;
        if (step === 1) {
          return {
            state: { ...state, phase: 'waiting' },
            status: 'waiting_for_input',
            phase: 'review',
          };
        }
        return {
          state: { ...state, phase: 'done' },
          status: 'completed',
        };
      },
    });

    const run = await startWorkflow('test_pause', {
      initialState: { phase: 'start' },
    });

    await waitForStatus(run.id, 'waiting_for_input');

    const paused = await getWorkflowRun(run.id);
    assert.equal(paused.status, 'waiting_for_input');
    assert.equal(paused.phase, 'review');

    await continueWorkflow(run.id, { feedback: 'approved' });

    await waitForTerminalStatus(run.id);

    const completed = await getWorkflowRun(run.id);
    assert.equal(completed.status, 'completed');
    const state = completed.state as Record<string, unknown>;
    assert.equal(state.feedback, 'approved');
    assert.equal(state.phase, 'done');
  });

  it('handles unhandled errors in takeStep', async () => {
    registerWorkflow<Record<string, never>>({
      type: 'test_throw',
      async takeStep() {
        throw new Error('Something went wrong');
      },
    });

    const run = await startWorkflow('test_throw', {
      initialState: {},
    });

    await waitForTerminalStatus(run.id);

    const result = await getWorkflowRun(run.id);
    assert.equal(result.status, 'error');
    assert.equal(result.error_message, 'Something went wrong');
    assert.include(result.output, '[ERROR] Unhandled error: Something went wrong');
  });

  it('handles explicit error status', async () => {
    registerWorkflow<Record<string, never>>({
      type: 'test_explicit_error',
      async takeStep() {
        return {
          state: {},
          status: 'error',
          error_message: 'Explicit failure',
        };
      },
    });

    const run = await startWorkflow('test_explicit_error', {
      initialState: {},
    });

    await waitForTerminalStatus(run.id);

    const result = await getWorkflowRun(run.id);
    assert.equal(result.status, 'error');
    assert.equal(result.error_message, 'Explicit failure');
    assert.isNotNull(result.completed_at);
  });

  it('cancels a workflow', async () => {
    registerWorkflow<Record<string, never>>({
      type: 'test_cancel',
      async takeStep() {
        return {
          state: {},
          status: 'waiting_for_input',
        };
      },
    });

    const run = await startWorkflow('test_cancel', {
      initialState: {},
    });

    await waitForStatus(run.id, 'waiting_for_input');

    await cancelWorkflow(run.id);

    const result = await getWorkflowRun(run.id);
    assert.equal(result.status, 'canceled');
    assert.isNotNull(result.completed_at);
  });

  it('filters active workflows by type and context', async () => {
    registerWorkflow<Record<string, never>>({
      type: 'test_filter',
      async takeStep() {
        return { state: {}, status: 'waiting_for_input' };
      },
    });

    const run1 = await startWorkflow('test_filter', {
      initialState: {},
      context: { assessment_id: '100' },
    });

    const run2 = await startWorkflow('test_filter', {
      initialState: {},
      context: { assessment_id: '200' },
    });

    await waitForStatus(run1.id, 'waiting_for_input');
    await waitForStatus(run2.id, 'waiting_for_input');

    const found = await getActiveWorkflowRun('test_filter', { assessment_id: '100' });
    assert.isNotNull(found);
    assert.equal(found!.id, run1.id);

    const notFound = await getActiveWorkflowRun('test_filter', { assessment_id: '999' });
    assert.isNull(notFound);

    // Clean up
    await cancelWorkflow(run1.id);
    await cancelWorkflow(run2.id);
  });

  it('captures logger output', async () => {
    registerWorkflow<Record<string, never>>({
      type: 'test_logger',
      async takeStep(ctx) {
        ctx.logger.info('Processing step');
        ctx.logger.error('Something is off');
        return { state: {}, status: 'completed' };
      },
    });

    const run = await startWorkflow('test_logger', {
      initialState: {},
    });

    await waitForTerminalStatus(run.id);

    const result = await getWorkflowRun(run.id);
    assert.include(result.output, '[INFO] Processing step');
    assert.include(result.output, '[ERROR] Something is off');
  });

  it('tracks phase updates', async () => {
    let step = 0;

    registerWorkflow<Record<string, never>>({
      type: 'test_phase',
      async takeStep() {
        step++;
        if (step === 1) {
          return { state: {}, status: 'continue', phase: 'initializing' };
        }
        return { state: {}, status: 'completed', phase: 'done' };
      },
    });

    const run = await startWorkflow('test_phase', {
      initialState: {},
    });

    await waitForTerminalStatus(run.id);

    const result = await getWorkflowRun(run.id);
    assert.equal(result.phase, 'done');
  });

  it('prevents concurrent execution via soft lock', async () => {
    let started = false;
    registerWorkflow<Record<string, never>>({
      type: 'test_lock',
      async takeStep() {
        started = true;
        return { state: {}, status: 'waiting_for_input' };
      },
    });

    const run = await startWorkflow('test_lock', {
      initialState: {},
    });

    await waitForStatus(run.id, 'waiting_for_input');

    // Manually set the run back to 'running' with a valid lock to simulate contention.
    await pool.execute(
      `UPDATE workflow_runs
       SET status = 'running', locked_by = 'other-server', locked_at = now(), heartbeat_at = now()
       WHERE id = $id`,
      { id: run.id },
    );

    started = false;
    await resumeWorkflow(run.id);

    // The step function should not have been called because the lock is held.
    assert.isFalse(started);

    // Clean up
    await pool.execute(
      "UPDATE workflow_runs SET status = 'canceled', locked_by = NULL WHERE id = $id",
      { id: run.id },
    );
  });

  it('throws when starting workflow with unregistered type', async () => {
    try {
      await startWorkflow('nonexistent', { initialState: {} });
      assert.fail('Expected an error');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.include((err as Error).message, 'No workflow registered');
    }
  });

  it('throws when registering duplicate type', () => {
    registerWorkflow({
      type: 'dup',
      async takeStep() {
        return { state: {}, status: 'completed' };
      },
    });
    try {
      registerWorkflow({
        type: 'dup',
        async takeStep() {
          return { state: {}, status: 'completed' };
        },
      });
      assert.fail('Expected an error');
    } catch (err) {
      assert.include((err as Error).message, 'already registered');
    }
  });
});

describe('workflow cron recovery', () => {
  it('recovers stale workflows', async () => {
    let recovered = false;

    registerWorkflow<Record<string, never>>({
      type: 'test_recover',
      async takeStep() {
        recovered = true;
        return { state: {}, status: 'completed' };
      },
    });

    // Insert a run that looks stale: running, locked, but heartbeat is old.
    const [row] = await pool.queryRows(
      `INSERT INTO workflow_runs (type, status, state, context, locked_by, locked_at, heartbeat_at)
       VALUES ('test_recover', 'running', '{}'::jsonb, '{}'::jsonb, 'dead-server', now() - interval '5 minutes', now() - interval '5 minutes')
       RETURNING *`,
      {},
      WorkflowRunRowSchema,
    );

    startCronLoop({ intervalMs: 100 });

    // Wait for recovery.
    const startTime = Date.now();
    while (!recovered && Date.now() - startTime < 5000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    await stopCronLoop();

    assert.isTrue(recovered);

    const result = await getWorkflowRun(row.id);
    assert.equal(result.status, 'completed');
  });
});

async function waitForStatus(runId: string, status: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await getWorkflowRun(runId);
    if (run.status === status) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const run = await getWorkflowRun(runId);
  throw new Error(`Timed out waiting for status '${status}', current status: '${run.status}'`);
}

async function waitForTerminalStatus(runId: string, timeoutMs = 5000): Promise<void> {
  const terminal = new Set(['completed', 'error', 'canceled']);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await getWorkflowRun(runId);
    if (terminal.has(run.status)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const run = await getWorkflowRun(runId);
  throw new Error(`Timed out waiting for terminal status, current status: '${run.status}'`);
}
