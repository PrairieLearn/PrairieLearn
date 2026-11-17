import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type StringInputBody = Extract<IRQuestionBody, { type: 'string-input' }>;

export const stringInputHandler: BodyEmitHandler = {
  bodyType: 'string-input',

  renderHtml(body) {
    const s = body as StringInputBody;
    return `<pl-string-input answers-name="answer" correct-answer="${he.escape(s.correctAnswer)}" remove-leading-trailing="true"${s.ignoreCase ? ' ignore-case="true"' : ''}></pl-string-input>`;
  },
};
