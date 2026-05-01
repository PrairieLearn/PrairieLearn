import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type SymbolicBody = Extract<IRQuestionBody, { type: 'symbolic' }>;

export const symbolicHandler: BodyEmitHandler = {
  bodyType: 'symbolic',

  renderHtml(body) {
    const symbolic = body as SymbolicBody;
    const attrs = [
      'answers-name="answer"',
      'label=""',
      `correct-answer="${he.escape(symbolic.correctAnswer)}"`,
    ];
    if (symbolic.variables.length > 0) {
      attrs.push(`variables="${he.escape(symbolic.variables.join(', '))}"`);
    }
    if (symbolic.allowSets) {
      attrs.push('allow-sets="true"');
    }
    return `<pl-symbolic-input ${attrs.join(' ')}></pl-symbolic-input>`;
  },
};
