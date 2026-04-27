import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

export const matchingHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'matching_question',

  transform(item: QTI12ParsedItem): TransformResult {
    // Each response_lid represents one left-side statement to match.
    // The materialText is the statement, and labels are the shared option pool.
    // Correct conditions tell us which label each response_lid maps to.
    const correctMap = new Map(
      item.correctConditions
        .filter((c) => !c.negate)
        .map((c) => [c.responseIdent, c.correctLabelIdent]),
    );

    // Collect all unique option labels across all response_lids
    const optionMap = new Map<string, string>();
    for (const lid of item.responseLids) {
      for (const label of lid.labels) {
        optionMap.set(label.ident, label.text);
      }
    }

    // Build match pairs
    const warnings: string[] = [];
    const matchedOptionIdents = new Set<string>();
    const pairs = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const optionHtml = correctLabelIdent ? (optionMap.get(correctLabelIdent) ?? '') : '';
      if (correctLabelIdent) {
        matchedOptionIdents.add(correctLabelIdent);
      }
      const statementHtml = lid.materialText ?? '';
      if (!statementHtml) {
        warnings.push(
          `matching_question "${item.ident}": statement "${lid.ident}" has no display text. Review the source QTI.`,
        );
      }
      if (!optionHtml) {
        warnings.push(
          `matching_question "${item.ident}": statement "${statementHtml || lid.ident}" has no correct match. Review and edit info.json.`,
        );
      }
      return { statementHtml, optionHtml };
    });

    // If no pair has a correct match, the question can't be auto-graded.
    const allMissing = pairs.length > 0 && pairs.every((p) => !p.optionHtml);
    if (allMissing) {
      warnings.push(
        `matching_question "${item.ident}" has no correct matches for any statement; emitting as a manually-graded question.`,
      );
    }

    // Options not used as correct answers become distractors
    const distractors = [...optionMap.entries()]
      .filter(([ident]) => !matchedOptionIdents.has(ident))
      .map(([, text]) => ({ optionHtml: text }));

    return {
      body: { type: 'matching', pairs, distractors },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(allMissing ? { gradingMethod: 'Manual' as const } : {}),
    };
  },
};
