import type { AssetReference, IRQuestionBody } from '../types/ir.js';

/** Result of transforming a parsed item into IR. */
export interface TransformResult {
  body: IRQuestionBody;
  assets?: Map<string, AssetReference>;
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
 * Generic over the parsed item type so QTI 1.2 and QTI 2.1 can each
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
