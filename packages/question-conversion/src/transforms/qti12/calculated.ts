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
    const calcEl = getNestedValue(item.rawItemEl ?? {}, 'itemproc_extension', 'calculated') as
      | Record<string, unknown>
      | undefined;

    if (!calcEl) {
      throw new Error(
        `calculated_question "${item.ident}": missing <itemproc_extension><calculated> block`,
      );
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

    // Tolerance may be absolute ("0.01") or relative ("1%")
    const toleranceRaw = textContent(calcEl['answer_tolerance']).trim();
    const isRelative = toleranceRaw.endsWith('%');
    const tolerance = Number.parseFloat(toleranceRaw) || 0;

    // Parse variable definitions
    const varsContainer = calcEl['vars'];
    const varEls = ensureArray(
      varsContainer != null && typeof varsContainer === 'object'
        ? (varsContainer as Record<string, unknown>)['var']
        : undefined,
    );

    const vars: IRCalculatedVar[] = [];
    for (const varEl of varEls) {
      if (varEl == null || typeof varEl !== 'object') continue;
      const rec = varEl as Record<string, unknown>;
      const name = attr(rec, 'name');
      const scaleStr = attr(rec, 'scale');
      const decimalPlaces = scaleStr ? Number.parseInt(scaleStr, 10) : 2;
      const min = Number.parseFloat(textContent(rec['min']));
      const max = Number.parseFloat(textContent(rec['max']));
      if (name && !Number.isNaN(min) && !Number.isNaN(max)) {
        vars.push({
          name,
          min,
          max,
          decimalPlaces: Number.isNaN(decimalPlaces) ? 2 : decimalPlaces,
        });
      }
    }

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
    };
  },
};
