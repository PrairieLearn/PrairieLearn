import type { IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { deduplicateChoices } from '../pl-emit-utils.js';

type MCBody = Extract<IRQuestionBody, { type: 'multiple-choice' }>;

export const multipleChoiceHandler: BodyEmitHandler = {
  bodyType: 'multiple-choice',

  renderHtml(body, shuffleAnswers) {
    const mc = body as MCBody;
    const deduped = deduplicateChoices(mc.choices);
    const hasCorrect = deduped.some((c) => c.correct);
    const gradingAttr = hasCorrect ? '' : ' builtin-grading="false"';

    if (mc.display === 'dropdown') {
      const lines = [`<pl-multiple-choice answers-name="answer" display="dropdown"${gradingAttr}>`];
      for (const choice of deduped) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-multiple-choice>');
      return lines.join('\n');
    }

    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    const lines = [`<pl-multiple-choice answers-name="answer"${orderAttr}${gradingAttr}>`];
    for (const choice of deduped) {
      lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
    }
    lines.push('</pl-multiple-choice>');
    return lines.join('\n');
  },

  renderFeedback(body, feedback) {
    const mc = body as MCBody;
    const perChoice = feedback?.perChoice;
    if (mc.display === 'dropdown' || !perChoice) return [];

    const choices = deduplicateChoices(mc.choices);
    if (!choices.some((choice) => choice.correct)) return [];
    return choices.flatMap((choice) => {
      const html = perChoice.get(choice.id);
      return html == null
        ? []
        : [{ html, trigger: { type: 'answer-selected' as const, answerHtml: choice.html } }];
    });
  },
};
