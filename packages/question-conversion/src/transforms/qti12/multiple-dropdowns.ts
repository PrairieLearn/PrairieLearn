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

    const warnings: string[] = [];
    const blanks = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const blankId = lid.materialText ?? lid.ident;
      if (!correctLabelIdent) {
        warnings.push(
          `multiple_dropdowns_question "${item.ident}": blank "${blankId}" has no correct answer marked. Review and edit info.json.`,
        );
      }
      const choices = lid.labels.map((label) => ({
        id: label.ident,
        html: label.text,
        correct: label.ident === correctLabelIdent,
      }));
      return { id: blankId, choices };
    });

    // If no blank has a correct answer, the question can't be auto-graded.
    const gradingMethod = correctMap.size === 0 ? ('Manual' as const) : undefined;
    if (gradingMethod === 'Manual') {
      warnings.push(
        `multiple_dropdowns_question "${item.ident}" has no correct answers for any blank; emitting as a manually-graded question.`,
      );
    }

    return {
      body: { type: 'multiple-dropdowns', blanks },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(gradingMethod ? { gradingMethod } : {}),
    };
  },
};
