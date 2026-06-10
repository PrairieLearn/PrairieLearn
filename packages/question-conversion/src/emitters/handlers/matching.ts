import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type MatchingBody = Extract<IRQuestionBody, { type: 'matching' }>;

export const matchingHandler: BodyEmitHandler = {
  bodyType: 'matching',

  renderHtml(body) {
    const m = body as MatchingBody;
    const lines = ['<pl-matching answers-name="answer">'];
    for (const pair of m.pairs) {
      lines.push(
        `  <pl-statement match="${he.escape(pair.optionHtml)}">${pair.statementHtml}</pl-statement>`,
      );
    }
    for (const distractor of m.distractors) {
      lines.push(`  <pl-option>${distractor.optionHtml}</pl-option>`);
    }
    lines.push('</pl-matching>');
    return lines.join('\n');
  },
};
