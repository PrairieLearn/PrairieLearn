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

    // pl-checkbox stores submitted answers as auto-assigned keys ("a", "b", ...),
    // not as the choice html. Resolve each submitted key back to its html via
    // data["params"]["answer"] (a list of {"key", "html"} dicts), then look up
    // the feedback by html.
    const lines = ['def grade(data):', '    _feedback_map = {'];
    for (const [answer, fb] of Object.entries(perAnswer)) {
      lines.push(`        ${JSON.stringify(answer)}: ${JSON.stringify(fb)},`);
    }
    lines.push(
      '    }',
      '    _key_to_html = {a["key"]: a["html"] for a in data["params"].get("answer") or []}',
      '    _submitted = data["submitted_answers"].get("answer") or []',
      '    if isinstance(_submitted, str):',
      '        _submitted = [_submitted]',
      '    _messages = []',
      '    for _key in _submitted:',
      '        _html = _key_to_html.get(_key)',
      '        if _html in _feedback_map:',
      '            _messages.append(f"<strong>{_html}</strong>: {_feedback_map[_html]}")',
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
