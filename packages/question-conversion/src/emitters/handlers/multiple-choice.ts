import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { deduplicateChoices } from '../pl-emit-utils.js';

type MCBody = Extract<IRQuestionBody, { type: 'multiple-choice' }>;

export const multipleChoiceHandler: BodyEmitHandler = {
  bodyType: 'multiple-choice',

  renderHtml(body, shuffleAnswers, perAnswer) {
    const mc = body as MCBody;
    const deduped = deduplicateChoices(mc.choices);

    if (mc.display === 'dropdown') {
      const lines = ['<pl-multiple-choice answers-name="answer" display="dropdown">'];
      for (const choice of deduped) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-multiple-choice>');
      return lines.join('\n');
    }

    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    const lines = [`<pl-multiple-choice answers-name="answer"${orderAttr}>`];
    for (const choice of deduped) {
      const fb = perAnswer?.[choice.html];
      const fbAttr = fb ? ` feedback="${he.escape(fb)}"` : '';
      lines.push(`  <pl-answer correct="${choice.correct}"${fbAttr}>${choice.html}</pl-answer>`);
    }
    lines.push('</pl-multiple-choice>');
    return lines.join('\n');
  },
};
