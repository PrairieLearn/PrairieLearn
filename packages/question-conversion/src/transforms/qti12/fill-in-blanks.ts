import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const fillInBlanksHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'fill_in_multiple_blanks_question',

  transform(item: QTI12ParsedItem): TransformResult {
    // Each response_lid represents one blank.
    // The materialText is the blank identifier (e.g., "capital1").
    // The correct label is identified by the correct condition.
    const correctMap = new Map(
      item.correctConditions
        .filter((c) => !c.negate)
        .map((c) => [c.responseIdent, c.correctLabelIdent]),
    );

    const blanks = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const correctLabel = lid.labels.find((l) => l.ident === correctLabelIdent);

      return {
        id: lid.materialText ?? lid.ident,
        correctText: correctLabel?.text ?? '',
        ignoreCase: true,
      };
    });

    return { body: { type: 'fill-in-blanks', blanks } };
  },
};
