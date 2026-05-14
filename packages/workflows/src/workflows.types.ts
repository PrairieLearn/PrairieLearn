// This package owns the Zod schemas for the `workflow_runs` table and its
// `enum_workflow_run_status` enum, rather than defining them in the app's
// centralized `db-types.ts`. This follows the same pattern as
// `@prairielearn/migrations` (which owns `batched_migrations` schemas).
//
// This is unusual for a "reusable" package — it can't stand alone because
// the table is created by a migration in `apps/prairielearn`. But keeping
// the schema here, next to the engine code that reads/writes the table,
// avoids duplication, keeps types close to their consumers, and ensures
// the correct dependency direction (app imports from package, not the
// other way around).

import { z } from 'zod';

import { DateFromISOString, IdSchema } from '@prairielearn/zod';

/** All possible statuses for a workflow run. */
export const WorkflowRunStatusSchema = z.enum([
  'running',
  'waiting',
  'completed',
  'error',
  'canceled',
]);

export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;
export type WorkflowContext = Record<string, string>;

/** Zod schema for validating rows from the `workflow_runs` table. */
export const WorkflowRunSchema = z.object({
  id: IdSchema,
  type: z.string(),
  status: WorkflowRunStatusSchema,
  state: z.record(z.unknown()),
  locked_by: z.string().nullable(),
  locked_at: DateFromISOString.nullable(),
  heartbeat_at: DateFromISOString.nullable(),
  context: z.record(z.string()),
  created_at: DateFromISOString,
  updated_at: DateFromISOString,
  completed_at: DateFromISOString.nullable(),
  error_message: z.string().nullable(),
  output: z.string(),
});

/**
 * A persisted workflow run record. Generic over `TState` so consumers get
 * type-safe access to their domain-specific state shape.
 */
export type WorkflowRun<TState = Record<string, unknown>> = Omit<
  z.infer<typeof WorkflowRunSchema>,
  'state'
> & {
  state: TState;
};

/**
 * Status values that a step function can return:
 * - `'continue'` — run the next step immediately.
 * - `'waiting'` — pause until {@link continueWorkflow} is called.
 * - `'completed'` — the workflow finished successfully.
 * - `'error'` — the workflow encountered a domain error.
 */
export type StepResultStatus = 'continue' | 'waiting' | 'completed' | 'error';

/**
 * The value returned by a `takeStep` call to signal the engine what to do next.
 *
 * @property state - The updated workflow state to persist.
 * @property status - Controls the engine's next action (see {@link StepResultStatus}).
 * @property error_message - Human-readable error description (only when `status` is `'error'`).
 */
export interface StepResult<TState extends Record<string, unknown>> {
  state: TState;
  status: StepResultStatus;
  error_message?: string;
}

/**
 * Logger provided to step functions. Messages are both forwarded to the
 * application logger and appended to the run's `output` column for
 * after-the-fact inspection.
 */
export interface WorkflowLogger {
  info(msg: string): void;
  error(msg: string): void;
}

/**
 * The context object passed to each `takeStep` invocation.
 *
 * @property run - The current workflow run record (state reflects the last persisted step).
 * @property logger - A logger that writes to both the application log and the run's `output` column.
 * @property signal - An `AbortSignal` that is aborted when the execution loop exits
 * (e.g. on cancellation or lock release). Step functions doing long-running I/O
 * should pass this signal to support cooperative cancellation.
 */
export interface WorkflowStepContext<TState extends Record<string, unknown>> {
  run: WorkflowRun<TState>;
  logger: WorkflowLogger;
  signal: AbortSignal;
}

/**
 * Defines a workflow type. Consumers register one of these per workflow kind
 * (e.g. `'ai_grading'`) at application startup via {@link registerWorkflow}.
 *
 * @property type - A unique string identifier for this workflow kind.
 * @property takeStep - The step function called repeatedly by the engine.
 * All domain logic — state transitions, LLM calls, pause decisions — lives
 * here. The engine is just a loop; the step function is the workflow.
 */
export interface WorkflowDefinition<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  type: string;
  takeStep(context: WorkflowStepContext<TState>): Promise<StepResult<TState>>;
}
