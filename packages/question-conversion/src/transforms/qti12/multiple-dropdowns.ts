import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

/**
 * Multiple-dropdowns questions are structurally identical to fill-in-blanks
 * (each response_lid represents one inline blank), but the blanks use
 * dropdown selects instead of free-text inputs.
 *
 * Each response_lid carries:
 *   - materialText: the blank placeholder name (e.g. "color")
 *   - labels: all available choices for that dropdown
 *
 * The correct choice for each blank is identified via correctConditions.
 */
export const multipleDropdownsHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'multiple_dropdowns_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const correctMap = new Map(
      item.correctConditions
        .filter((c) => !c.negate)
        .map((c) => [c.responseIdent, c.correctLabelIdent]),
    );

    const blanks = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const choices = lid.labels.map((label) => ({
        id: label.ident,
        html: label.text,
        correct: label.ident === correctLabelIdent,
      }));
      return { id: lid.materialText ?? lid.ident, choices };
    });

    return { body: { type: 'multiple-dropdowns', blanks } };
  },
};
