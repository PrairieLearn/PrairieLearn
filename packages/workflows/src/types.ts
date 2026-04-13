import z from 'zod';

// ---------------------------------------------------------------------------
// Database row schema
// ---------------------------------------------------------------------------

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflow_type: z.string(),
  status: z.enum(['pending', 'running', 'waiting_for_input', 'completed', 'failed', 'canceled']),
  phase: z.string(),
  state: z.record(z.unknown()),
  context: z.record(z.unknown()),
  output: z.string(),
  locked_at: z.date().nullable(),
  heartbeat_at: z.date().nullable(),
  error_message: z.string().nullable(),
  max_steps: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  completed_at: z.date().nullable(),
});

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export type WorkflowStatus = WorkflowRun['status'];

// ---------------------------------------------------------------------------
// Step function types
// ---------------------------------------------------------------------------

export interface StepResult {
  phase: string;
  state: Record<string, unknown>;
  status: 'running' | 'waiting_for_input' | 'completed' | 'failed';
  output?: string;
  error_message?: string;
}

export interface WorkflowLogger {
  info(msg: string): void;
  error(msg: string): void;
}

export interface WorkflowStepContext {
  run: WorkflowRun;
  logger: WorkflowLogger;
  signal: AbortSignal;
}

export type TakeStepFn = (context: WorkflowStepContext) => Promise<StepResult>;

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  type: string;
  takeStep: TakeStepFn;
}

// ---------------------------------------------------------------------------
// API option types
// ---------------------------------------------------------------------------

export interface StartWorkflowOptions {
  type: string;
  context?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  initialPhase?: string;
  maxSteps?: number;
}

export interface ContinueWorkflowOptions {
  replace?: boolean;
}
