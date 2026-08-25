import he from 'he';

import type { IRQuestionBody } from '../../types/ir.js';
import { CLIENT_FILES_QUESTION_URL, QUESTION_ASSET_URL_PREFIX } from '../../utils/html.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';

type MatchingBody = Extract<IRQuestionBody, { type: 'matching' }>;

export const matchingHandler: BodyEmitHandler = {
  bodyType: 'matching',

  renderHtml(body) {
    const m = body as MatchingBody;
    const lines = ['<pl-matching answers-name="answer">'];
    for (const pair of m.pairs) {
      const optionHtml = pair.optionHtml.replaceAll(
        QUESTION_ASSET_URL_PREFIX,
        `${CLIENT_FILES_QUESTION_URL}/`,
      );
      lines.push(
        `  <pl-statement match="${he.escape(optionHtml)}">${pair.statementHtml}</pl-statement>`,
      );
    }
    for (const distractor of m.distractors) {
      lines.push(`  <pl-option>${distractor.optionHtml}</pl-option>`);
    }
    lines.push('</pl-matching>');
    return lines.join('\n');
  },
};
