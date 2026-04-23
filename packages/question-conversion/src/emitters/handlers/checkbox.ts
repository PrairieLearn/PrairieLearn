import type { IRFeedback, IRQuestionBody } from '../../types/ir.js';
import type { BodyEmitHandler } from '../body-emit-handler.js';
import { appendGlobalFeedback, deduplicateChoices } from '../pl-emit-utils.js';

type CheckboxBody = Extract<IRQuestionBody, { type: 'checkbox' }>;

export const checkboxHandler: BodyEmitHandler = {
  bodyType: 'checkbox',

  renderHtml(body, shuffleAnswers) {
    const cb = body as CheckboxBody;
    const deduped = deduplicateChoices(cb.choices);
    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    const lines = [`<pl-checkbox answers-name="answer"${orderAttr}>`];
    for (const choice of deduped) {
      lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
    }
    lines.push('</pl-checkbox>');
    return lines.join('\n');
  },

  renderGradePy(_body: IRQuestionBody, feedback: IRFeedback | undefined) {
    const { correct, incorrect, perAnswer } = feedback ?? {};
    // Per-answer feedback is concatenated so all selected answers' messages show together
    // (matching Canvas behaviour). Without perAnswer there's nothing per-type to add.
    if (!perAnswer || Object.keys(perAnswer).length === 0) return '';

    const lines = ['def grade(data):', '    _feedback_map = {'];
    for (const [answer, fb] of Object.entries(perAnswer)) {
      lines.push(`        ${JSON.stringify(answer)}: ${JSON.stringify(fb)},`);
    }
    lines.push(
      '    }',
      '    _submitted = data["submitted_answers"].get("answer") or []',
      '    _messages = [f"<strong>{a}</strong>: {_feedback_map[a]}" for a in _submitted if a in _feedback_map]',
    );
    appendGlobalFeedback(lines, correct, incorrect);
    lines.push(
      '    if _messages:',
      '        data["feedback"]["general"] = "<br>".join(_messages)',
      '',
    );
    return lines.join('\n');
  },
};
