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

    const warnings: string[] = [];
    const blanks = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const correctLabel = lid.labels.find((l) => l.ident === correctLabelIdent);
      const correctText = correctLabel?.text ?? '';
      const id = lid.materialText ?? lid.ident;
      if (!correctText) {
        warnings.push(
          `fill_in_multiple_blanks_question "${item.ident}": blank "${id}" has no correct answer — the blank will accept any input. Review and edit info.json.`,
        );
      }
      return {
        id,
        correctText,
        ignoreCase: true,
      };
    });

    // If every blank lacks a correct answer there's nothing to auto-grade against;
    // surface as Manual so the question still appears, with a warning.
    const allMissing = blanks.length > 0 && blanks.every((b) => !b.correctText);
    if (allMissing) {
      warnings.push(
        `fill_in_multiple_blanks_question "${item.ident}" has no correct answers for any blank; emitting as a manually-graded question.`,
      );
    }

    return {
      body: { type: 'fill-in-blanks', blanks },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(allMissing ? { gradingMethod: 'Manual' as const } : {}),
    };
  },
};
