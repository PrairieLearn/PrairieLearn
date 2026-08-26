import type { IRQuestionBody } from '../types/ir.js';

export type FeedbackTrigger =
  | {
      /** Show feedback based on whether the question's final score is fully correct. */
      type: 'score';
      outcome: 'correct' | 'incorrect';
    }
  | {
      /** Show feedback when a particular checkbox answer is selected. */
      type: 'checkbox-answer-selected';
      answerHtml: string;
    }
  | {
      /** Show feedback when a particular fill-in-the-blank input is fully correct. */
      type: 'fill-in-the-blank-correct';
      answerName: string;
    };

export interface FeedbackMessage {
  html: string;
  trigger: FeedbackTrigger;
}

/**
 * Handler for emitting one question body type as PrairieLearn HTML and Python.
 * Register handlers in BodyEmitRegistry; PLEmitter delegates all per-type rendering here.
 * Adding a new question type only requires a new handler file + one registry.register() call.
 */
export interface BodyEmitHandler {
  readonly bodyType: string;

  /**
   * When true, the prompt HTML contains inline input elements (e.g. fill-in-blanks,
   * multiple-dropdowns) and must NOT be wrapped in `<pl-question-panel>`.
   */
  readonly inlineInputs?: boolean;

  /**
   * Optionally transform the prompt HTML before rendering.
   * Used by types that substitute placeholders in the prompt text
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

  /** Describe per-answer feedback that requires custom grade-time conditions. */
  renderFeedback?(
    body: IRQuestionBody,
    perAnswer: Record<string, string> | undefined,
  ): FeedbackMessage[];
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
