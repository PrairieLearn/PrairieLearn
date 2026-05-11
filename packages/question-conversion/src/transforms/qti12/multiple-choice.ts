import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const multipleChoiceHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'multiple_choice_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const responseLid = item.responseLids[0];
    if (!responseLid) {
      throw new Error(`multiple_choice_question "${item.ident}" has no response_lid`);
    }

    const correctIdents = new Set(
      item.correctConditions.filter((c) => !c.negate).map((c) => c.correctLabelIdent),
    );

    const choices = responseLid.labels.map((label) => ({
      id: label.ident,
      html: label.text,
      correct: correctIdents.has(label.ident),
    }));

    if (correctIdents.size === 0) {
      // Mark the first choice as correct so the element passes validation;
      // the question is Manual-graded so the marking is not used for scoring.
      if (choices.length > 0) {
        choices[0].correct = true;
      }
      return {
        body: { type: 'multiple-choice', choices },
        gradingMethod: 'Manual',
        warnings: [
          'No correct answer found. Set the correct answer in question.html, or leave as manually graded.',
        ],
      };
    }

    return { body: { type: 'multiple-choice', choices } };
  },
};
