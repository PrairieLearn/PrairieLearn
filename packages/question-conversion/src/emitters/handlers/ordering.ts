import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type OrderingBody = Extract<IRQuestionBody, { type: 'ordering' }>;

export const orderingHandler: BodyEmitHandler = {
  bodyType: 'ordering',

  renderHtml(body) {
    const o = body as OrderingBody;
    const lines = ['<pl-order-blocks answers-name="answer">'];
    for (const item of o.correctOrder) {
      lines.push(`  <pl-answer correct="true">${item.html}</pl-answer>`);
    }
    lines.push('</pl-order-blocks>');
    return lines.join('\n');
  },
};
