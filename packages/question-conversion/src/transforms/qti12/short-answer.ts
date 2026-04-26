import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const shortAnswerHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'short_answer_question',

  transform(item: QTI12ParsedItem): TransformResult {
    // Short answer uses response_str with render_fib.
    // The correct answer is normally in the correct conditions; some Canvas exports
    // omit it and place a hint in general_fb (which is technically feedback, not
    // an answer) — we accept that as a fallback but surface a warning. With
    // neither source available the question is emitted Manual-graded.
    const fromCondition = item.correctConditions[0]?.correctLabelIdent;
    const fromFeedback = item.feedbacks.get('general_fb');
    const warnings: string[] = [];
    let correctAnswer = '';
    let gradingMethod: 'Manual' | undefined;
    if (fromCondition != null && fromCondition !== '') {
      correctAnswer = fromCondition;
    } else if (fromFeedback != null && fromFeedback !== '') {
      correctAnswer = fromFeedback;
      warnings.push(
        `short_answer_question "${item.ident}" has no correct answer in <respcondition>; falling back to general_fb feedback text. Review the answer in info.json.`,
      );
    } else {
      gradingMethod = 'Manual';
      warnings.push(
        `short_answer_question "${item.ident}" has no correct answer; emitting as a manually-graded question.`,
      );
    }

    const trimmed = correctAnswer.trim();
    const numericValue = Number(trimmed);
    if (trimmed !== '' && !Number.isNaN(numericValue)) {
      // Treat as integer only when the source string is written as one.
      // "3.0" must stay numeric — pl-integer-input would reject it.
      const isInteger = /^[+-]?\d+$/.test(trimmed);
      return {
        body: {
          type: isInteger ? 'integer' : 'numeric',
          answer: { correctValue: numericValue },
        },
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(gradingMethod ? { gradingMethod } : {}),
      };
    }

    return {
      body: {
        type: 'string-input',
        correctAnswer,
        ignoreCase: true,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(gradingMethod ? { gradingMethod } : {}),
    };
  },
};
