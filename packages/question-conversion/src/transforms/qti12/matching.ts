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
    const matchedOptionIdents = new Set<string>();
    const pairs = item.responseLids.map((lid) => {
      const correctLabelIdent = correctMap.get(lid.ident);
      const optionHtml = correctLabelIdent ? (optionMap.get(correctLabelIdent) ?? '') : '';
      if (correctLabelIdent) {
        matchedOptionIdents.add(correctLabelIdent);
      }
      return {
        statementHtml: lid.materialText ?? lid.ident,
        optionHtml,
      };
    });

    // Options not used as correct answers become distractors
    const distractors = [...optionMap.entries()]
      .filter(([ident]) => !matchedOptionIdents.has(ident))
      .map(([, text]) => ({ optionHtml: text }));

    return { body: { type: 'matching', pairs, distractors } };
  },
};
