import type { z } from 'zod';

import type { WorkflowRunRowSchema } from './workflow-run.js';

export type WorkflowRunStatus =
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'error'
  | 'canceled';

export type WorkflowRunRow = z.infer<typeof WorkflowRunRowSchema>;

export interface StepResult<TState> {
  state: TState;
  status: 'continue' | 'waiting_for_input' | 'completed' | 'error';
  phase?: string;
  error_message?: string;
}

export interface WorkflowLogger {
  info(msg: string): void;
  error(msg: string): void;
}

export interface WorkflowStepContext<TState> {
  run: WorkflowRunRow & { state: TState };
  logger: WorkflowLogger;
  signal: AbortSignal;
}

export interface WorkflowDefinition<TState> {
  type: string;
  takeStep(context: WorkflowStepContext<TState>): Promise<StepResult<TState>>;
}

export interface StartWorkflowOptions<TState> {
  initialState: TState;
  context?: Record<string, unknown>;
  phase?: string;
}

export interface CronLoopOptions {
  /** How often to scan for recoverable workflows, in ms. Default 60000. */
  intervalMs?: number;
}
