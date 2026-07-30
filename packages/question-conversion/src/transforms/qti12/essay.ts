import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const essayHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'essay_question',

  transform(_item: QTI12ParsedItem): TransformResult {
    return { body: { type: 'rich-text', gradingMethod: 'Manual' } };
  },
};
