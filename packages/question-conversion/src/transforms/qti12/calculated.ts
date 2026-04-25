import { attr, ensureArray, getNestedValue, textContent } from '../../parsers/qti12/xml-helpers.js';
import type { IRCalculatedVar } from '../../types/ir.js';
import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { TransformHandler, TransformResult } from '../transform-registry.js';

/**
 * Canvas calculated questions store formula and variable data inside an
 * <itemproc_extension><calculated> block. Structure:
 *
 *   <calculated>
 *     <answer_tolerance>0.01</answer_tolerance>     <!-- or "1%" for relative -->
 *     <formula decimal_places="4">[a]+[b]</formula>
 *     <vars>
 *       <var name="a" scale="2"><min>1.0</min><max>10.0</max></var>
 *       ...
 *     </vars>
 *   </calculated>
 *
 * Variables in the formula are referenced as [varname].
 * The emitter generates a server.py that samples variables and evaluates the formula.
 */
export const calculatedHandler: TransformHandler<QTI12ParsedItem> = {
  questionType: 'calculated_question',

  transform(item: QTI12ParsedItem): TransformResult {
    const calcEl = item.calculatedBlock;

    if (!calcEl) {
      throw new Error(`calculated_question "${item.ident}": missing <calculated> block`);
    }

    // Canvas exports formula in one of two structures:
    //   - direct: <formula>[a]+[b]</formula>
    //   - wrapped: <formulas decimal_places="0"><formula>[a]+[b]</formula></formulas>
    const formula = (
      textContent(calcEl['formula']) || textContent(getNestedValue(calcEl, 'formulas', 'formula'))
    ).trim();
    if (!formula) {
      throw new Error(`calculated_question "${item.ident}": formula is empty`);
    }

    // Tolerance may be absolute ("0.01") or relative ("1%"). A missing or empty
    // element is ambiguous — Canvas itself falls back to its grading UI default,
    // but we can't reproduce that here, so warn the author rather than silently
    // emitting tolerance=0 (which would reject every non-exact student answer).
    const toleranceRaw = textContent(calcEl['answer_tolerance']).trim();
    const isRelative = toleranceRaw.endsWith('%');
    const parsedTolerance = Number.parseFloat(toleranceRaw);
    const tolerance = Number.isNaN(parsedTolerance) ? 0 : parsedTolerance;
    const warnings: string[] = [];
    if (toleranceRaw === '' || tolerance === 0) {
      warnings.push(
        `calculated_question "${item.ident}": answer_tolerance is ${toleranceRaw === '' ? 'missing' : 'zero'}; non-exact answers will be marked wrong. Review tolerance in info.json.`,
      );
    }

    // Parse variable definitions
    const varsContainer = calcEl['vars'];
    const varEls = ensureArray(
      varsContainer != null && typeof varsContainer === 'object'
        ? (varsContainer as Record<string, unknown>)['var']
        : undefined,
    );

    const vars: IRCalculatedVar[] = [];
    varEls.forEach((varEl, index) => {
      if (varEl == null || typeof varEl !== 'object') {
        throw new Error(
          `calculated_question "${item.ident}": <var> at index ${index} is not an element`,
        );
      }
      const rec = varEl as Record<string, unknown>;
      const name = attr(rec, 'name');
      const scaleStr = attr(rec, 'scale');
      const decimalPlaces = scaleStr ? Number.parseInt(scaleStr, 10) : 2;
      const min = Number.parseFloat(textContent(rec['min']));
      const max = Number.parseFloat(textContent(rec['max']));
      if (!name) {
        throw new Error(
          `calculated_question "${item.ident}": <var> at index ${index} is missing a name attribute`,
        );
      }
      if (Number.isNaN(min) || Number.isNaN(max)) {
        throw new Error(
          `calculated_question "${item.ident}": <var name="${name}"> has non-numeric min/max`,
        );
      }
      vars.push({
        name,
        min,
        max,
        decimalPlaces: Number.isNaN(decimalPlaces) ? 2 : decimalPlaces,
      });
    });

    if (vars.length === 0) {
      throw new Error(`calculated_question "${item.ident}": no variables found`);
    }

    return {
      body: {
        type: 'calculated',
        formula,
        vars,
        tolerance,
        toleranceType: isRelative ? 'relative' : 'absolute',
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};
