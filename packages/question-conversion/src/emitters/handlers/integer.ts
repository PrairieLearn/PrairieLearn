import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type IntegerBody = Extract<IRQuestionBody, { type: 'integer' }>;

export const integerHandler: BodyEmitHandler = {
  bodyType: 'integer',

  renderHtml(body) {
    const i = body as IntegerBody;
    return `<pl-integer-input answers-name="answer" correct-answer="${i.answer.correctValue}"></pl-integer-input>`;
  },
};
