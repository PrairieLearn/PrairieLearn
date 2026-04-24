import { assert, describe, it } from 'vitest';

import { checkboxHandler } from './checkbox.js';

const choices = [
  { id: 'a', html: 'Apple', correct: true },
  { id: 'b', html: 'Banana', correct: false },
  { id: 'c', html: 'Cherry', correct: true },
];

describe('checkboxHandler.renderHtml', () => {
  it('renders basic checkbox list', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices });
    assert.include(html, '<pl-checkbox answers-name="answer">');
    assert.include(html, '<pl-answer correct="true">Apple</pl-answer>');
    assert.include(html, '<pl-answer correct="false">Banana</pl-answer>');
    assert.include(html, '</pl-checkbox>');
  });

  it('adds order="fixed" when shuffleAnswers is false', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, false);
    assert.include(html, 'order="fixed"');
  });

  it('omits order attribute when shuffleAnswers is undefined', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined);
    assert.notInclude(html, 'order=');
  });

  it('does not include feedback attributes in HTML (per-answer handled in grade())', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined, {
      Apple: 'Correct!',
    });
    assert.notInclude(html, 'feedback=');
  });
});

describe('checkboxHandler.renderGradePy', () => {
  it('returns empty string when no perAnswer feedback', () => {
    const py = checkboxHandler.renderGradePy!({ type: 'checkbox', choices }, undefined);
    assert.equal(py, '');
  });

  it('returns empty string when perAnswer is empty', () => {
    const py = checkboxHandler.renderGradePy!({ type: 'checkbox', choices }, { perAnswer: {} });
    assert.equal(py, '');
  });

  it('generates grade function with feedback map and key-to-html lookup', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { perAnswer: { Apple: 'Good choice', Banana: 'Not a fruit salad item' } },
    );
    assert.equal(
      py,
      `def grade(data):
    _feedback_map = {
        "Apple": "Good choice",
        "Banana": "Not a fruit salad item",
    }
    _key_to_html = {a["key"]: a["html"] for a in data["params"].get("answer") or []}
    _submitted = data["submitted_answers"].get("answer") or []
    if isinstance(_submitted, str):
        _submitted = [_submitted]
    _messages = []
    for _key in _submitted:
        _html = _key_to_html.get(_key)
        if _html in _feedback_map:
            _messages.append(f"<strong>{_html}</strong>: {_feedback_map[_html]}")
    if _messages:
        data["feedback"]["general"] = "<br>".join(_messages)
`,
    );
  });

  it('appends global correct feedback', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { correct: 'Well done!', perAnswer: { Apple: 'Yes' } },
    );
    assert.equal(
      py,
      `def grade(data):
    _feedback_map = {
        "Apple": "Yes",
    }
    _key_to_html = {a["key"]: a["html"] for a in data["params"].get("answer") or []}
    _submitted = data["submitted_answers"].get("answer") or []
    if isinstance(_submitted, str):
        _submitted = [_submitted]
    _messages = []
    for _key in _submitted:
        _html = _key_to_html.get(_key)
        if _html in _feedback_map:
            _messages.append(f"<strong>{_html}</strong>: {_feedback_map[_html]}")
    if data["score"] >= 1.0:
        _messages.append("Well done!")
    if _messages:
        data["feedback"]["general"] = "<br>".join(_messages)
`,
    );
  });

  it('appends global incorrect feedback', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { incorrect: 'Try again', perAnswer: { Apple: 'Yes' } },
    );
    assert.equal(
      py,
      `def grade(data):
    _feedback_map = {
        "Apple": "Yes",
    }
    _key_to_html = {a["key"]: a["html"] for a in data["params"].get("answer") or []}
    _submitted = data["submitted_answers"].get("answer") or []
    if isinstance(_submitted, str):
        _submitted = [_submitted]
    _messages = []
    for _key in _submitted:
        _html = _key_to_html.get(_key)
        if _html in _feedback_map:
            _messages.append(f"<strong>{_html}</strong>: {_feedback_map[_html]}")
    if data["score"] < 1.0:
        _messages.append("Try again")
    if _messages:
        data["feedback"]["general"] = "<br>".join(_messages)
`,
    );
  });
});
