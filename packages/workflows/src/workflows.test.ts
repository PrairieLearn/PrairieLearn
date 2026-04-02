import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { PostgresPool, makePostgresTestUtils } from '@prairielearn/postgres';

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
    await testPool.queryAsync(
      `CREATE TABLE IF NOT EXISTS workflow_runs (
        id bigserial PRIMARY KEY,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'running' CHECK (
          status IN ('running', 'waiting_for_input', 'completed', 'error', 'canceled')
        ),
        phase text,
        state jsonb NOT NULL DEFAULT '{}'::jsonb,
        locked_by text,
        locked_at timestamptz,
        heartbeat_at timestamptz,
        context jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        error_message text,
        output text NOT NULL DEFAULT ''
      )`,
      {},
    );
    await testPool.queryAsync(
      'CREATE INDEX IF NOT EXISTS workflow_runs_type_status_idx ON workflow_runs (type, status)',
      {},
    );
    await testPool.queryAsync(
      "CREATE INDEX IF NOT EXISTS workflow_runs_status_running_idx ON workflow_runs (status, heartbeat_at) WHERE status = 'running'",
      {},
    );
    await testPool.queryAsync(
      'CREATE INDEX IF NOT EXISTS workflow_runs_context_idx ON workflow_runs USING gin (context)',
      {},
    );
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
            return { state: run.state, status: 'completed', phase: 'done' };
          }
          return {
            state: { step: run.state.step + 1 },
            status: 'continue',
            phase: `step-${run.state.step + 1}`,
          };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { step: 0 },
        context: { test: true },
      });

      assert.equal(run.type, type);
      assert.equal(run.status, 'running');

      // Wait for async execution to complete
      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun<{ step: number }>(run.id);
      assert.equal(finalRun.status, 'completed');
      assert.equal(finalRun.state.step, 3);
      assert.equal(finalRun.phase, 'done');
      assert.isNotNull(finalRun.completed_at);
    });
  });

  describe('pause and resume', () => {
    it('pauses for input and resumes with continueWorkflow', async () => {
      const type = uniqueType('pause_resume');
      registerWorkflow<{ phase: string; input?: string }>({
        type,
        async takeStep({
          run,
        }: WorkflowStepContext<{ phase: string; input?: string }>): Promise<
          StepResult<{ phase: string; input?: string }>
        > {
          if (run.state.phase === 'init') {
            return {
              state: { phase: 'waiting' },
              status: 'waiting_for_input',
              phase: 'awaiting-input',
            };
          }
          if (run.state.phase === 'waiting' && run.state.input) {
            return {
              state: { phase: 'done', input: run.state.input },
              status: 'completed',
              phase: 'finished',
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
        initialState: { phase: 'init' },
      });

      await waitForStatus(run.id, 'waiting_for_input');

      const pausedRun = await getWorkflowRun<{ phase: string; input?: string }>(run.id);
      assert.equal(pausedRun.status, 'waiting_for_input');
      assert.equal(pausedRun.state.phase, 'waiting');

      await continueWorkflow(run.id, { input: 'hello' });

      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun<{ phase: string; input?: string }>(run.id);
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
            status: 'waiting_for_input',
            phase: 'waiting',
          };
        },
      });

      const run = await startWorkflow(type, { initialState: { waiting: false } });

      await waitForStatus(run.id, 'waiting_for_input');

      await cancelWorkflow(run.id);

      const canceledRun = await getWorkflowRun(run.id);
      assert.equal(canceledRun.status, 'canceled');
      assert.isNotNull(canceledRun.completed_at);
    });

    it('throws when canceling a completed workflow', async () => {
      const type = uniqueType('cancel_completed');
      registerWorkflow({
        type,
        async takeStep(): Promise<StepResult<Record<string, unknown>>> {
          return { state: {}, status: 'completed' };
        },
      });

      const run = await startWorkflow(type, { initialState: {} });
      await waitForStatus(run.id, 'completed');

      try {
        await cancelWorkflow(run.id);
        assert.fail('should have thrown');
      } catch (err) {
        assert.include((err as Error).message, 'Cannot cancel');
      }
    });
  });

  describe('getActiveWorkflowRun', () => {
    it('finds an active run by type and context', async () => {
      const type = uniqueType('active');
      registerWorkflow<{ x: number }>({
        type,
        async takeStep(): Promise<StepResult<{ x: number }>> {
          return { state: { x: 1 }, status: 'waiting_for_input' };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { x: 0 },
        context: { entity_id: 42 },
      });

      await waitForStatus(run.id, 'waiting_for_input');

      const found = await getActiveWorkflowRun(type, { entity_id: 42 });
      assert.isNotNull(found);
      assert.equal(found!.id, run.id);

      const notFound = await getActiveWorkflowRun(type, { entity_id: 999 });
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

  describe('phase tracking', () => {
    it('tracks phase changes through steps', async () => {
      const type = uniqueType('phases');
      registerWorkflow<{ n: number }>({
        type,
        async takeStep({
          run,
        }: WorkflowStepContext<{ n: number }>): Promise<StepResult<{ n: number }>> {
          if (run.state.n === 0) {
            return { state: { n: 1 }, status: 'continue', phase: 'phase-a' };
          }
          return { state: { n: 2 }, status: 'completed', phase: 'phase-b' };
        },
      });

      const run = await startWorkflow(type, {
        initialState: { n: 0 },
        phase: 'init',
      });

      await waitForStatus(run.id, 'completed');

      const finalRun = await getWorkflowRun(run.id);
      assert.equal(finalRun.phase, 'phase-b');
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

      const ctx = { course_id: 1, assessment_id: 2, name: 'test' };
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
            return { state: run.state, status: 'completed', phase: 'done' };
          }
          return { state: { step: run.state.step + 1 }, status: 'continue' };
        },
      });

      // Manually insert a run that looks like it was mid-execution when
      // a worker crashed: status is 'running', it has a lock, but the
      // heartbeat is 5 minutes stale.
      const result = await testPool.queryAsync(
        `INSERT INTO workflow_runs (type, status, state, locked_by, locked_at, heartbeat_at)
         VALUES ($type, 'running', $state::jsonb, 'dead-worker', now() - interval '10 minutes', now() - interval '5 minutes')
         RETURNING id`,
        { type, state: JSON.stringify({ step: 1 }) },
      );
      const runId = String(result.rows[0].id);

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

      // Insert a run with a fresh heartbeat (another worker is actively running it).
      const result = await testPool.queryAsync(
        `INSERT INTO workflow_runs (type, status, state, locked_by, locked_at, heartbeat_at)
         VALUES ($type, 'running', $state::jsonb, 'other-worker', now(), now())
         RETURNING id`,
        { type, state: JSON.stringify({ v: 0 }) },
      );
      const runId = String(result.rows[0].id);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
