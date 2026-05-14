import type { IRFeedback, IRQuestionBody } from '../types/ir.js';

/**
 * Handler for emitting one question body type as PrairieLearn HTML and Python.
 * Register handlers in BodyEmitRegistry; PLEmitter delegates all per-type rendering here.
 * Adding a new question type only requires a new handler file + one registry.register() call.
 */
export interface BodyEmitHandler {
  readonly bodyType: string;

  /**
   * Optionally transform the prompt HTML before it is wrapped in <pl-question-panel>.
   * Used by types that inline their interactive elements directly into the prompt text
   * (fill-in-blanks, multiple-dropdowns, calculated).
   */
  transformPrompt?(promptHtml: string, body: IRQuestionBody): string;

  /**
   * Render the interactive element(s) placed after <pl-question-panel>.
   * Return '' for types whose interaction lives inside the prompt (fill-in-blanks, text-only).
   */
  renderHtml(
    body: IRQuestionBody,
    shuffleAnswers?: boolean,
    perAnswer?: Record<string, string>,
  ): string;

  /** Render the generate(data) Python function. Return '' or omit if not needed. */
  renderGeneratePy?(body: IRQuestionBody): string;

  /**
   * Render the complete grade(data) Python function, covering both per-type and global feedback.
   * When absent, PLEmitter falls back to a default renderer that handles only global
   * correct/incorrect feedback.
   * Return '' or omit if no grade function is needed.
   */
  renderGradePy?(body: IRQuestionBody, feedback: IRFeedback | undefined): string;
}

export class BodyEmitRegistry {
  private readonly handlers = new Map<string, BodyEmitHandler>();

  register(handler: BodyEmitHandler): void {
    this.handlers.set(handler.bodyType, handler);
  }

  get(bodyType: string): BodyEmitHandler | undefined {
    return this.handlers.get(bodyType);
  }

  supportedTypes(): string[] {
    return [...this.handlers.keys()];
  }
}
