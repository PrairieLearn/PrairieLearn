import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const trueFalseHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'true_false_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const responseLid = item.responseLids[0];
    if (!responseLid) {
      throw new Error(`true_false_question "${item.ident}" has no response_lid`);
    }

    const correctIdents = new Set(
      item.correctConditions.filter((c) => !c.negate).map((c) => c.correctLabelIdent),
    );

    // Normalize to always have True first, False second
    const trueLabel = responseLid.labels.find((l) => l.text.toLowerCase() === 'true');
    const falseLabel = responseLid.labels.find((l) => l.text.toLowerCase() === 'false');

    if (!trueLabel || !falseLabel) {
      throw new Error(`true_false_question "${item.ident}" missing True/False labels`);
    }

    const choices = [
      { id: trueLabel.ident, html: 'True', correct: correctIdents.has(trueLabel.ident) },
      { id: falseLabel.ident, html: 'False', correct: correctIdents.has(falseLabel.ident) },
    ];

    return { body: { type: 'multiple-choice', choices } };
  },
};
