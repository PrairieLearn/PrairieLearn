import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type MDBody = Extract<IRQuestionBody, { type: 'multiple-dropdowns' }>;

export const multipleDropdownsHandler: BodyEmitHandler = {
  bodyType: 'multiple-dropdowns',
  inlineInputs: true,

  transformPrompt(promptHtml, body) {
    const md = body as MDBody;
    let result = promptHtml;
    for (const blank of md.blanks) {
      const hasCorrect = blank.choices.some((c) => c.correct);
      const gradingAttr = hasCorrect ? '' : ' builtin-grading="false"';
      const lines = [
        `<pl-multiple-choice answers-name="${he.escape(blank.id)}" display="dropdown"${gradingAttr}>`,
      ];
      for (const choice of blank.choices) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-multiple-choice>');
      result = result.replaceAll(`[${blank.id}]`, lines.join('\n'));
    }
    return result;
  },

  // Dropdowns are inlined in the prompt via transformPrompt; no separate body HTML needed.
  renderHtml() {
    return '';
  },
};
