import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { deduplicateChoices } from '../pl-emit-utils.js';

type CheckboxBody = Extract<IRQuestionBody, { type: 'checkbox' }>;

export const checkboxHandler: BodyEmitHandler = {
  bodyType: 'checkbox',

  renderHtml(body, shuffleAnswers) {
    const cb = body as CheckboxBody;
    const deduped = deduplicateChoices(cb.choices);
    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    // Canvas grants partial credit on multiple-answer questions using a net-correct
    // strategy, so emit the matching pl-checkbox partial-credit mode.
    const lines = [`<pl-checkbox answers-name="answer" partial-credit="net-correct"${orderAttr}>`];
    for (const choice of deduped) {
      lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
    }
    lines.push('</pl-checkbox>');
    return lines.join('\n');
  },

  renderFeedback(body, feedback) {
    const perChoice = feedback?.perChoice;
    if (!perChoice) return [];

    const cb = body as CheckboxBody;
    return deduplicateChoices(cb.choices).flatMap((choice) => {
      const html = perChoice.get(choice.id);
      return html == null
        ? []
        : [
            {
              html: `<strong>${choice.html}</strong>: ${html}`,
              trigger: { type: 'answer-selected' as const, answerHtml: choice.html },
            },
          ];
    });
  },
};
