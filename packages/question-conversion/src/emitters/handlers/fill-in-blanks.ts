import he from 'he';

import type { IRFeedback, IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { appendGlobalFeedback } from '../pl-emit-utils.js';

type FIBBody = Extract<IRQuestionBody, { type: 'fill-in-blanks' }>;

export const fillInBlanksHandler: BodyEmitHandler = {
  bodyType: 'fill-in-blanks',

  transformPrompt(promptHtml, body) {
    const fib = body as FIBBody;
    let result = promptHtml;
    for (const blank of fib.blanks) {
      const input = `<pl-string-input answers-name="${he.escape(blank.id)}" correct-answer="${he.escape(blank.correctText)}" remove-leading-trailing="true"${blank.ignoreCase ? ' ignore-case="true"' : ''}></pl-string-input>`;
      result = result.replaceAll(`[${blank.id}]`, input);
    }
    return result;
  },

  // Inputs are inlined in the prompt via transformPrompt; nothing goes below pl-question-panel.
  renderHtml() {
    return '';
  },

  renderGradePy(body: IRQuestionBody, feedback: IRFeedback | undefined) {
    const fib = body as FIBBody;
    const { correct, incorrect, perAnswer } = feedback ?? {};
    // Per-blank feedback checks partial_scores; global feedback appended after.
    const blanksWithFeedback = fib.blanks.filter(
      (b) => b.correctText && perAnswer?.[b.correctText] != null,
    );
    if (blanksWithFeedback.length === 0 && !correct && !incorrect) return '';

    const lines = ['def grade(data):', '    _messages = []'];
    for (const blank of blanksWithFeedback) {
      const fb = perAnswer![blank.correctText];
      const prefix = `<strong>${he.escape(blank.correctText)}</strong>: `;
      lines.push(
        `    if data["partial_scores"].get(${JSON.stringify(blank.id)}, {}).get("score", 0) >= 1:`,
        `        _messages.append(${JSON.stringify(prefix + fb)})`,
      );
    }
    appendGlobalFeedback(lines, correct, incorrect);
    lines.push(
      '    if _messages:',
      '        data["feedback"]["general"] = "<br>".join(_messages)',
      '',
    );
    return lines.join('\n');
  },
};
