import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { PostgresPool, loadSqlEquiv, makePostgresTestUtils } from '@prairielearn/postgres';

import {
  cancelWorkflow,
  close,
  continueWorkflow,
  getActiveWorkflowRun,
  getWorkflowRun,
  init,
  registerWorkflow,
  resumeWorkflow,
  startWorkflow,
} from './workflows.js';
import type { StepResult, WorkflowStepContext } from './workflows.types.js';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_workflows',
});

// Track registered types so we can use unique types per test
let typeCounter = 0;

function uniqueType(base: string): string {
  return `${base}_${typeCounter++}`;
}

// A separate pool for directly manipulating the DB in tests (e.g. simulating crashes).
const testPool = new PostgresPool();

const sql = loadSqlEquiv(import.meta.url);

describe('@prairielearn/workflows', () => {
  beforeAll(async () => {
    const pgConfig = await postgresTestUtils.createDatabase();
    await init(pgConfig, (err) => {
      throw err;
    });
    await testPool.initAsync(pgConfig, (err) => {
      throw err;
    });
    // Create the table manually since migrations don't run in package tests.
    await testPool.execute(sql.create_workflow_run_status_enum);
    await testPool.execute(sql.create_workflow_runs_table);
    await testPool.execute(sql.create_type_status_index);
    await testPool.execute(sql.create_status_running_index);
    await testPool.execute(sql.create_context_index);
  });

  afterAll(async () => {
    await testPool.closeAsync();
    await close();
    await postgresTestUtils.dropDatabase();
  });

  describe('normal completion', () => {
    it('runs a workflow to completion', async () => {
      const type = uniqueType('complete');
      registerWorkflow<{ step: number }>({
        type,
        async takeStep({
          run,
        }: WorkflowStepContext<{ step: number }>): Promise<StepResult<{ step: number }>> {
          if (run.state.step >= 3) {
            return { state: run.state, status: 'completed' };
          }
          return {
            state: { step: run.state.step + 1 },
            status: 'continue',
          };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { step: 0 },
        context: { test: 'true' },
      });

      assert.equal(run.type, type);
      assert.equal(run.status, 'running');

      // Wait for async execution to complete
      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun<{ step: number }>(run.id);
      assert.equal(finalRun.status, 'completed');
      assert.equal(finalRun.state.step, 3);
      assert.isNotNull(finalRun.completed_at);
    });
  });

  describe('pause and resume', () => {
    it('pauses for input and resumes with continueWorkflow', async () => {
      const type = uniqueType('pause_resume');
      registerWorkflow<{ stage: string; input?: string }>({
        type,
        async takeStep({
          run,
        }: WorkflowStepContext<{ stage: string; input?: string }>): Promise<
          StepResult<{ stage: string; input?: string }>
        > {
          if (run.state.stage === 'init') {
            return {
              state: { stage: 'waiting' },
              status: 'waiting',
            };
          }
          if (run.state.stage === 'waiting' && run.state.input) {
            return {
              state: { stage: 'done', input: run.state.input },
              status: 'completed',
            };
          }
          return {
            state: run.state,
            status: 'error',
            error_message: 'unexpected state',
          };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { stage: 'init' },
      });

      await waitForStatus(run.id, 'waiting');

      const pausedRun = await getWorkflowRun<{ stage: string; input?: string }>(run.id);
      assert.equal(pausedRun.status, 'waiting');
      assert.equal(pausedRun.state.stage, 'waiting');

      await continueWorkflow(run.id, { input: 'hello' });

      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun<{ stage: string; input?: string }>(run.id);
      assert.equal(finalRun.status, 'completed');
      assert.equal(finalRun.state.input, 'hello');
    });
  });

  describe('error handling', () => {
    it('catches step errors and sets error status', async () => {
      const type = uniqueType('error');
      registerWorkflow({
        type,
        async takeStep(): Promise<StepResult<Record<string, unknown>>> {
          throw new Error('step failed');
        },
      });

      const run = await startWorkflow(type, { initialState: {} });

      await waitForStatus(run.id, 'error');

      const errorRun = await getWorkflowRun(run.id);
      assert.equal(errorRun.status, 'error');
      assert.equal(errorRun.error_message, 'step failed');
    });

    it('handles step returning error status', async () => {
      const type = uniqueType('error_status');
      registerWorkflow({
        type,
        async takeStep(): Promise<StepResult<Record<string, unknown>>> {
          return {
            state: {},
            status: 'error',
            error_message: 'intentional error',
          };
        },
      });

      const run = await startWorkflow(type, { initialState: {} });

      await waitForStatus(run.id, 'error');

      const errorRun = await getWorkflowRun(run.id);
      assert.equal(errorRun.status, 'error');
      assert.equal(errorRun.error_message, 'intentional error');
    });
  });

  describe('cancelWorkflow', () => {
    it('cancels a running workflow', async () => {
      const type = uniqueType('cancel');
      registerWorkflow<{ waiting: boolean }>({
        type,
        async takeStep(): Promise<StepResult<{ waiting: boolean }>> {
          return {
            state: { waiting: true },
            status: 'waiting',
          };
        },
      });

      const run = await startWorkflow(type, { initialState: { waiting: false } });

      await waitForStatus(run.id, 'waiting');

      await cancelWorkflow(run.id);

      const canceledRun = await getWorkflowRun(run.id);
      assert.equal(canceledRun.status, 'canceled');
      assert.isNotNull(canceledRun.completed_at);
    });

    it('no-ops when canceling a completed workflow', async () => {
      const type = uniqueType('cancel_completed');
      registerWorkflow({
        type,
        async takeStep(): Promise<StepResult<Record<string, unknown>>> {
          return { state: {}, status: 'completed' };
        },
      });

      const run = await startWorkflow(type, { initialState: {} });
      await waitForStatus(run.id, 'completed');

      // Should not throw — idempotent no-op for already-terminal runs.
      await cancelWorkflow(run.id);

      const finalRun = await getWorkflowRun(run.id);
      assert.equal(finalRun.status, 'completed');
    });
  });

  describe('getActiveWorkflowRun', () => {
    it('finds an active run by type and context', async () => {
      const type = uniqueType('active');
      registerWorkflow<{ x: number }>({
        type,
        async takeStep(): Promise<StepResult<{ x: number }>> {
          return { state: { x: 1 }, status: 'waiting' };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { x: 0 },
        context: { entity_id: '42' },
      });

      await waitForStatus(run.id, 'waiting');

      const found = await getActiveWorkflowRun(type, { entity_id: '42' });
      assert.isNotNull(found);
      assert.equal(found!.id, run.id);

      const notFound = await getActiveWorkflowRun(type, { entity_id: '999' });
      assert.isNull(notFound);
    });
  });

  describe('workflow logger', () => {
    it('appends log output to the run', async () => {
      const type = uniqueType('logger');
      registerWorkflow({
        type,
        async takeStep({
          logger,
        }: WorkflowStepContext<Record<string, unknown>>): Promise<
          StepResult<Record<string, unknown>>
        > {
          logger.info('test message');
          logger.error('error message');
          return { state: {}, status: 'completed' };
        },
      });

      const run = await startWorkflow(type, { initialState: {} });
      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun(run.id);
      assert.include(finalRun.output, '[INFO] test message');
      assert.include(finalRun.output, '[ERROR] error message');
    });
  });

  describe('context preservation', () => {
    it('preserves context across the workflow lifecycle', async () => {
      const type = uniqueType('context');
      registerWorkflow({
        type,
        async takeStep(): Promise<StepResult<Record<string, unknown>>> {
          return { state: {}, status: 'completed' };
        },
      });

      const ctx = { course_id: '1', assessment_id: '2', name: 'test' };
      const run = await startWorkflow(type, {
        initialState: {},
        context: ctx,
      });

      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun(run.id);
      assert.deepEqual(finalRun.context, ctx);
    });
  });

  describe('crash recovery', () => {
    it('resumes a run with a stale lock left by a crashed worker', async () => {
      const type = uniqueType('crash_recovery');
      registerWorkflow<{ step: number }>({
        type,
        async takeStep({
          run,
        }: WorkflowStepContext<{ step: number }>): Promise<StepResult<{ step: number }>> {
          if (run.state.step >= 2) {
            return { state: run.state, status: 'completed' };
          }
          return { state: { step: run.state.step + 1 }, status: 'continue' };
        },
      });

      const row = await testPool.queryRow(
        sql.insert_run_with_stale_lock,
        { type, state: JSON.stringify({ step: 1 }) },
        z.object({ id: z.coerce.string() }),
      );
      const runId = row.id;

      // The stale lock (heartbeat > 2 min ago) should be treated as
      // abandoned. resumeWorkflow acquires a fresh lock and finishes.
      await resumeWorkflow(runId);

      await waitForStatus(runId, 'completed');

      const recovered = await getWorkflowRun<{ step: number }>(runId);
      assert.equal(recovered.status, 'completed');
      assert.equal(recovered.state.step, 2);
      assert.isNull(recovered.locked_by);
      assert.isNotNull(recovered.completed_at);
    });

    it('does not resume a run whose lock is still fresh', async () => {
      const type = uniqueType('fresh_lock');
      registerWorkflow<{ v: number }>({
        type,
        async takeStep(): Promise<StepResult<{ v: number }>> {
          return { state: { v: 99 }, status: 'completed' };
        },
      });

      const row = await testPool.queryRow(
        sql.insert_run_with_fresh_lock,
        { type, state: JSON.stringify({ v: 0 }) },
        z.object({ id: z.coerce.string() }),
      );
      const runId = row.id;

      // resumeWorkflow should fail to acquire the lock and return without
      // modifying the run (the other worker still "owns" it).
      await resumeWorkflow(runId);

      const run = await getWorkflowRun<{ v: number }>(runId);
      assert.equal(run.status, 'running');
      assert.equal(run.state.v, 0);
      assert.equal(run.locked_by, 'other-worker');
    });
  });
});

async function waitForStatus(runId: string, status: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await getWorkflowRun(runId);
    if (run.status === status) return;
    await sleep(50);
  }
  const run = await getWorkflowRun(runId);
  throw new Error(`Timeout waiting for status '${status}', current status: '${run.status}'`);
}
