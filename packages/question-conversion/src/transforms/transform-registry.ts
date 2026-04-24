import type { AssetReference, IRQuestionBody, IRQuestionGradingMethod } from '../types/ir.js';

/** Result of transforming a parsed item into IR. */
export interface TransformResult {
  body: IRQuestionBody;
  assets?: Map<string, AssetReference>;
  /**
   * Transform-level warnings to surface to the user. Use this for situations
   * where the question can still be emitted but the conversion is ambiguous
   * (e.g. a missing tolerance, a half-bounded range, or an un-gradable blank).
   * Throw an Error instead when the transform cannot produce any output.
   */
  warnings?: string[];
  /**
   * Override the question's grading method. Use 'Manual' when the source QTI
   * lacks the data needed to auto-grade (e.g. no correct answer marked) but
   * the question itself is still presentable. When omitted, the parser picks
   * a default based on the body type.
   */
  gradingMethod?: IRQuestionGradingMethod;
}

/**
 * A handler that converts a parsed item of type T into an IR question body.
 * Each handler is responsible for one question type string.
 */
export interface TransformHandler<TParsedItem> {
  readonly questionType: string;
  transform(item: TParsedItem): TransformResult;
}

/**
 * Registry mapping question type strings to their transform handlers.
 * Generic over the parsed item type so future input formats can each
 * have their own registry with their own item shape.
 */
export class TransformRegistry<TParsedItem> {
  private handlers = new Map<string, TransformHandler<TParsedItem>>();

  register(handler: TransformHandler<TParsedItem>): void {
    this.handlers.set(handler.questionType, handler);
  }

  get(questionType: string): TransformHandler<TParsedItem> | undefined {
    return this.handlers.get(questionType);
  }

  has(questionType: string): boolean {
    return this.handlers.has(questionType);
  }

  supportedTypes(): string[] {
    return [...this.handlers.keys()];
  }
}
