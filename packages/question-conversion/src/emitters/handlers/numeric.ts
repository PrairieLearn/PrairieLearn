import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type NumericBody = Extract<IRQuestionBody, { type: 'numeric' }>;

export const numericHandler: BodyEmitHandler = {
  bodyType: 'numeric',

  renderHtml(body) {
    const n = body as NumericBody;
    const tolAttr = n.answer.tolerance != null ? ` atol="${n.answer.tolerance}"` : '';
    return `<pl-number-input answers-name="answer" correct-answer="${n.answer.correctValue}"${tolAttr}></pl-number-input>`;
  },
};
