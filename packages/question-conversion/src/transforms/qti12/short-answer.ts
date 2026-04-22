import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const shortAnswerHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'short_answer_question',

  transform(item: QTI12ParsedItem): TransformResult {
    // Short answer uses response_str with render_fib.
    // The correct answer is in the correct conditions or feedback.
    const correctAnswer =
      item.correctConditions[0]?.correctLabelIdent ?? item.feedbacks.get('general_fb') ?? '';

    const numericValue = Number(correctAnswer.trim());
    if (correctAnswer.trim() !== '' && !Number.isNaN(numericValue)) {
      const isInteger = Number.isInteger(numericValue);
      return {
        body: {
          type: isInteger ? 'integer' : 'numeric',
          answer: { correctValue: numericValue },
        },
      };
    }

    return {
      body: {
        type: 'string-input',
        correctAnswer,
        ignoreCase: true,
      },
    };
  },
};
