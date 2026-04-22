import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const textOnlyHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'text_only_question',

  transform(_item: QTI12ParsedItem): TransformResult {
    return { body: { type: 'text-only' } };
  },
};
