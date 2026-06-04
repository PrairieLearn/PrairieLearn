import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const textOnlyHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'text_only_question',

  transform(_item: QTI12ParsedItem): TransformResult {
    // text_only_question renders only a prompt with no input; PL has nothing
    // to auto-grade. Mark as Manual so it isn't shown as scored 0.
    return { body: { type: 'text-only' }, gradingMethod: 'Manual' };
  },
};
