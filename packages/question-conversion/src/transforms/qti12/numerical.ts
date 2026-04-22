import { ensureArray, textContent } from '../../parsers/qti12/xml-helpers.js';
import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

/**
 * Extract the numeric answer range from a QTI 1.2 resprocessing block.
 *
 * Canvas exports numerical questions with one of two patterns:
 *   - Exact match: <varequal respident="response1">10</varequal>
 *   - Range: <vargte>9.5</vargte> + <varlte>10.5</varlte> (inside and/or wrappers)
 *
 * Returns { exact } for an exact value or { lower, upper } for a range.
 */
function findNumericRange(resprocessing: unknown): {
  exact?: number;
  lower?: number;
  upper?: number;
} {
  if (resprocessing == null || typeof resprocessing !== 'object') return {};
  const rec = resprocessing as Record<string, unknown>;

  for (const cond of ensureArray(rec['respcondition'] as unknown)) {
    if (cond == null || typeof cond !== 'object') continue;
    const condRec = cond as Record<string, unknown>;

    // Only consider conditions that award a positive score
    const setvar = condRec['setvar'];
    if (setvar == null) continue;
    if (!(Number.parseFloat(textContent(setvar)) > 0)) continue;

    const conditionvar = condRec['conditionvar'] as Record<string, unknown> | undefined;
    if (!conditionvar) continue;

    // Pattern 1: direct <varequal>
    const varequals = ensureArray(conditionvar['varequal'] as unknown);
    if (varequals.length > 0) {
      const val = Number.parseFloat(textContent(varequals[0]));
      if (!Number.isNaN(val)) return { exact: val };
    }

    // Pattern 2: <vargte> / <varlte> — may be nested inside <or><and> or directly
    const parseRange = (
      container: Record<string, unknown>,
    ): { lower?: number; upper?: number } | null => {
      const gte = container['vargte'];
      const lte = container['varlte'];
      if (gte == null && lte == null) return null;
      return {
        lower: gte != null ? Number.parseFloat(textContent(gte)) : undefined,
        upper: lte != null ? Number.parseFloat(textContent(lte)) : undefined,
      };
    };

    const direct = parseRange(conditionvar);
    if (direct) return direct;

    for (const wrapper of ['or', 'and'] as const) {
      const wrapEl = conditionvar[wrapper] as Record<string, unknown> | undefined;
      if (!wrapEl) continue;
      const inWrapper = parseRange(wrapEl);
      if (inWrapper) return inWrapper;
      // One more level of nesting (e.g. <or><and>)
      for (const inner of ['or', 'and'] as const) {
        const innerEl = wrapEl[inner] as Record<string, unknown> | undefined;
        if (!innerEl) continue;
        const inInner = parseRange(innerEl);
        if (inInner) return inInner;
      }
    }
  }

  return {};
}

export const numericalHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'numerical_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const range = findNumericRange(item.rawItemEl?.['resprocessing']);

    if (range.exact !== undefined && !Number.isNaN(range.exact)) {
      if (Number.isInteger(range.exact)) {
        return { body: { type: 'integer', answer: { correctValue: range.exact } } };
      }
      return { body: { type: 'numeric', answer: { correctValue: range.exact } } };
    }

    if (
      range.lower !== undefined &&
      range.upper !== undefined &&
      !Number.isNaN(range.lower) &&
      !Number.isNaN(range.upper)
    ) {
      const correctValue = (range.lower + range.upper) / 2;
      const tolerance = (range.upper - range.lower) / 2;
      if (tolerance === 0 && Number.isInteger(correctValue)) {
        return { body: { type: 'integer', answer: { correctValue } } };
      }
      return {
        body: { type: 'numeric', answer: { correctValue, tolerance, toleranceType: 'absolute' } },
      };
    }

    // Fall back to correctConditions (varequal may have been captured as a string)
    const fallback = item.correctConditions[0]?.correctLabelIdent;
    if (fallback) {
      const val = Number.parseFloat(fallback);
      if (!Number.isNaN(val)) {
        if (Number.isInteger(val)) {
          return { body: { type: 'integer', answer: { correctValue: val } } };
        }
        return { body: { type: 'numeric', answer: { correctValue: val } } };
      }
    }

    throw new Error(
      `numerical_question "${item.ident}": could not determine correct answer from resprocessing`,
    );
  },
};
