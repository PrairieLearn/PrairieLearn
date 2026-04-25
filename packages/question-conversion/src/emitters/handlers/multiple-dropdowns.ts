import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type MDBody = Extract<IRQuestionBody, { type: 'multiple-dropdowns' }>;

export const multipleDropdownsHandler: BodyEmitHandler = {
  bodyType: 'multiple-dropdowns',

  transformPrompt(promptHtml, body) {
    const md = body as MDBody;
    let result = promptHtml;
    for (const blank of md.blanks) {
      const lines = [
        `<pl-multiple-choice answers-name="${he.escape(blank.id)}" display="dropdown">`,
      ];
      for (const choice of blank.choices) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-multiple-choice>');
      result = result.replaceAll(`[${blank.id}]`, lines.join('\n'));
    }
    return result;
  },

  // Dropdowns are inlined in the prompt via transformPrompt; nothing goes below pl-question-panel.
  renderHtml() {
    return '';
  },
};
