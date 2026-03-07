import { z } from 'zod';

import { loadSqlEquiv } from '@prairielearn/postgres';

import { pool } from './init.js';

const sql = loadSqlEquiv(import.meta.filename);

export const WorkflowRunStatusSchema = z.enum([
  'running',
  'waiting_for_input',
  'completed',
  'error',
  'canceled',
]);

export const WorkflowRunRowSchema = z.object({
  id: z.coerce.string(),
  type: z.string(),
  status: WorkflowRunStatusSchema,
  phase: z.string().nullable(),
  state: z.unknown(),
  locked_by: z.string().nullable(),
  locked_at: z.coerce.date().nullable(),
  heartbeat_at: z.coerce.date().nullable(),
  context: z.unknown(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
  error_message: z.string().nullable(),
  output: z.string(),
});

export async function insertWorkflowRun(params: {
  type: string;
  state: unknown;
  context: unknown;
  phase: string | null;
}) {
  return await pool.queryRow(
    sql.insert_workflow_run,
    {
      type: params.type,
      state: JSON.stringify(params.state),
      context: JSON.stringify(params.context),
      phase: params.phase,
    },
    WorkflowRunRowSchema,
  );
}

export async function selectWorkflowRun(id: string) {
  return await pool.queryRow(sql.select_workflow_run, { id }, WorkflowRunRowSchema);
}

export async function selectActiveWorkflowRun(
  type: string,
  contextFilter: Record<string, unknown>,
) {
  return await pool.queryOptionalRow(
    sql.select_active_workflow_run,
    { type, context_filter: JSON.stringify(contextFilter) },
    WorkflowRunRowSchema,
  );
}

export async function updateWorkflowRunAfterStep(
  id: string,
  params: {
    status: string;
    state: unknown;
    phase: string | null;
    error_message: string | null;
    output: string;
  },
) {
  return await pool.queryRow(
    sql.update_workflow_run_after_step,
    {
      id,
      status: params.status,
      state: JSON.stringify(params.state),
      phase: params.phase,
      error_message: params.error_message,
      output: params.output,
    },
    WorkflowRunRowSchema,
  );
}

export async function acquireLock(id: string, lockId: string) {
  return await pool.queryOptionalRow(
    sql.acquire_lock,
    { id, lock_id: lockId },
    WorkflowRunRowSchema,
  );
}

export async function releaseLock(id: string, lockId: string) {
  await pool.execute(sql.release_lock, { id, lock_id: lockId });
}

export async function updateHeartbeat(id: string, lockId: string) {
  await pool.execute(sql.update_heartbeat, { id, lock_id: lockId });
}

export async function cancelWorkflowRun(id: string) {
  return await pool.queryOptionalRow(sql.cancel_workflow_run, { id }, WorkflowRunRowSchema);
}

export async function continueWorkflowRun(id: string, stateUpdate: Record<string, unknown>) {
  return await pool.queryRow(
    sql.continue_workflow_run,
    { id, state_update: JSON.stringify(stateUpdate) },
    WorkflowRunRowSchema,
  );
}
