import { z } from 'zod';

/** All possible statuses for a workflow run. */
export const WorkflowRunStatusSchema = z.enum([
  'running',
  'waiting_for_input',
  'completed',
  'error',
  'canceled',
]);

export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

/** Zod schema for validating rows from the `workflow_runs` table. */
export const WorkflowRunSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: WorkflowRunStatusSchema,
  phase: z.string().nullable(),
  state: z.record(z.unknown()),
  locked_by: z.string().nullable(),
  locked_at: z.date().nullable(),
  heartbeat_at: z.date().nullable(),
  context: z.record(z.unknown()),
  created_at: z.date(),
  updated_at: z.date(),
  completed_at: z.date().nullable(),
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
 * - `'waiting_for_input'` — pause until {@link continueWorkflow} is called.
 * - `'completed'` — the workflow finished successfully.
 * - `'error'` — the workflow encountered a domain error.
 */
export type StepResultStatus = 'continue' | 'waiting_for_input' | 'completed' | 'error';

/**
 * The value returned by a `takeStep` call to signal the engine what to do next.
 *
 * @property state - The updated workflow state to persist.
 * @property status - Controls the engine's next action (see {@link StepResultStatus}).
 * @property phase - Optional label for the current phase (for display/debugging).
 * @property error_message - Human-readable error description (only when `status` is `'error'`).
 */
export interface StepResult<TState extends Record<string, unknown>> {
  state: TState;
  status: StepResultStatus;
  phase?: string;
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
 * All domain logic — phase transitions, LLM calls, pause decisions — lives
 * here. The engine is just a loop; the step function is the workflow.
 */
export interface WorkflowDefinition<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  type: string;
  takeStep(context: WorkflowStepContext<TState>): Promise<StepResult<TState>>;
}
