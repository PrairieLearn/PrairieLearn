import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { deduplicateChoices, escapeMustacheDelimiters } from '../pl-emit-utils.js';

type CheckboxBody = Extract<IRQuestionBody, { type: 'checkbox' }>;

export const checkboxHandler: BodyEmitHandler = {
  bodyType: 'checkbox',

  renderHtml(body, shuffleAnswers, perAnswer) {
    const cb = body as CheckboxBody;
    const deduped = deduplicateChoices(cb.choices);
    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    // Canvas grants partial credit on multiple-answer questions using a net-correct
    // strategy, so emit the matching pl-checkbox partial-credit mode.
    const lines = [`<pl-checkbox answers-name="answer" partial-credit="net-correct"${orderAttr}>`];
    for (const choice of deduped) {
      const feedback = perAnswer?.[choice.html];
      const feedbackAttr =
        feedback == null ? '' : ` feedback="${escapeMustacheDelimiters(he.escape(feedback))}"`;
      lines.push(
        `  <pl-answer correct="${choice.correct}"${feedbackAttr}>${choice.html}</pl-answer>`,
      );
    }
    lines.push('</pl-checkbox>');
    return lines.join('\n');
  },
};
