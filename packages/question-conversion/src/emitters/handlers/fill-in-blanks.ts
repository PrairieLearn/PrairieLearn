import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type FIBBody = Extract<IRQuestionBody, { type: 'fill-in-blanks' }>;

export const fillInBlanksHandler: BodyEmitHandler = {
  bodyType: 'fill-in-blanks',
  inlineInputs: true,

  transformPrompt(promptHtml, body) {
    const fib = body as FIBBody;
    let result = promptHtml;
    for (const blank of fib.blanks) {
      const input = `<pl-string-input answers-name="${he.escape(blank.id)}" correct-answer="${he.escape(blank.correctText)}" remove-leading-trailing="true"${blank.ignoreCase ? ' ignore-case="true"' : ''}></pl-string-input>`;
      result = result.replaceAll(`[${blank.id}]`, input);
    }
    return result;
  },

  // Inputs are inlined in the prompt via transformPrompt; no separate body HTML needed.
  renderHtml() {
    return '';
  },

  renderFeedback(body, perAnswer) {
    const fib = body as FIBBody;
    if (!perAnswer) return [];

    return fib.blanks.flatMap((blank) => {
      const feedback = perAnswer[blank.correctText];
      if (!blank.correctText || feedback == null) return [];

      return [
        {
          html: `<strong>${he.escape(blank.correctText)}</strong>: ${feedback}`,
          trigger: { type: 'blank-correct' as const, answerName: blank.id },
        },
      ];
    });
  },
};
