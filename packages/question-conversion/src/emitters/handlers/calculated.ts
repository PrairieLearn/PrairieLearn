import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { convertFormulaToPython } from '../pl-emit-utils.js';

type CalculatedBody = Extract<IRQuestionBody, { type: 'calculated' }>;

export const calculatedHandler: BodyEmitHandler = {
  bodyType: 'calculated',

  transformPrompt(promptHtml, body) {
    const c = body as CalculatedBody;
    let result = promptHtml;
    for (const v of c.vars) {
      result = result.replaceAll(`[${v.name}]`, `{{params.${v.name}}}`);
    }
    return result;
  },

  renderHtml(body) {
    const c = body as CalculatedBody;
    const tolAttr =
      c.tolerance > 0
        ? c.toleranceType === 'relative'
          ? ` rtol="${c.tolerance / 100}"`
          : ` atol="${c.tolerance}"`
        : '';
    return `<pl-number-input answers-name="answer"${tolAttr}></pl-number-input>`;
  },

  renderGeneratePy(body) {
    const c = body as CalculatedBody;
    const pyFormula = convertFormulaToPython(c.formula);
    const lines = ['import math', 'import random', '', 'def generate(data):'];
    for (const v of c.vars) {
      lines.push(`    ${v.name} = round(random.uniform(${v.min}, ${v.max}), ${v.decimalPlaces})`);
    }
    lines.push(`    answer = ${pyFormula}`, '');
    for (const v of c.vars) {
      lines.push(`    data["params"]["${v.name}"] = ${v.name}`);
    }
    // Pass tolerance to PL via correct_answers — PL uses the element attributes for
    // display tolerance, but we also record it in the server so the question is self-contained.
    const tolComment =
      c.tolerance > 0
        ? ` # tolerance: ${c.tolerance}${c.toleranceType === 'relative' ? '%' : ''}`
        : '';
    lines.push(`    data["correct_answers"]["answer"] = answer${tolComment}`, '');
    return lines.join('\n');
  },
};
