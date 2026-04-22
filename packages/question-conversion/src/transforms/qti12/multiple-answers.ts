import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const multipleAnswersHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'multiple_answers_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const responseLid = item.responseLids[0];
    if (!responseLid) {
      throw new Error(`multiple_answers_question "${item.ident}" has no response_lid`);
    }

    // In QTI 1.2, correct answers appear as non-negated varequal conditions,
    // and incorrect answers appear as negated conditions inside <not>.
    const correctIdents = new Set(
      item.correctConditions.filter((c) => !c.negate).map((c) => c.correctLabelIdent),
    );

    const choices = responseLid.labels.map((label) => ({
      id: label.ident,
      html: label.text,
      correct: correctIdents.has(label.ident),
    }));

    return { body: { type: 'checkbox', choices } };
  },
};
