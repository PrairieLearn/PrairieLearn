import { assert, describe, it } from 'vitest';

import { safeMustacheRender } from './mustache.js';

describe('safeMustacheRender', () => {
  it('renders a valid template', () => {
    const result = safeMustacheRender('Hello, {{name}}!', { name: 'world' });
    assert.equal(result.rendered, 'Hello, world!');
    assert.isUndefined(result.error);
  });

  it('returns the original template and an error message on syntax error', () => {
    const template = 'Correct.   "HELLO". \\mathbb{{X+Y}/2}';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed tag/);
  });

  it('returns the original template on unclosed section', () => {
    const template = 'Full credit: {{#correct}}Bonus: 5 points';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed section/);
  });

  it('substitutes missing variables with the empty string (mustache default)', () => {
    // `\mathbb{{R}}` parses as the literal text `\mathbb` followed by the
    // mustache tag `{{R}}`; with `R` undefined, the tag renders as empty.
    const result = safeMustacheRender('Uses the set \\mathbb{{R}}', {});
    assert.equal(result.rendered, 'Uses the set \\mathbb');
    assert.isUndefined(result.error);
  });

  it('returns the original template on a mismatched section close', () => {
    const template = 'Partial credit {{#attempt}}for trying{{/answer}}';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed section|Unexpected/);
  });

  it('returns the original template when a triple-brace tag is missing its third closer', () => {
    const template = 'Final answer: {{{score}/2}}';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed tag/);
  });

  it('returns the original template on an unclosed inverted section', () => {
    const template = '{{^empty}}fallback content';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed section/);
  });

  it('returns the original template on an unclosed comment', () => {
    const template = 'Reminder: {{! TODO finish this comment';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.match(result.error ?? '', /Unclosed tag/);
  });

  it('substitutes nested dot-notation fields used by AI grading prompts', () => {
    const result = safeMustacheRender(
      'Expected {{correct_answers.x}} when params.n = {{params.n}}',
      {
        correct_answers: { x: 42 },
        params: { n: 3 },
      },
    );
    assert.equal(result.rendered, 'Expected 42 when params.n = 3');
    assert.isUndefined(result.error);
  });

  it('HTML-escapes substituted values by default (so <script> reaches downstream renderers as text)', () => {
    const result = safeMustacheRender('Submitted: {{answer}}', {
      answer: '<script>alert(1)</script>',
    });
    assert.equal(result.rendered, 'Submitted: &lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    assert.isUndefined(result.error);
  });

  it('renders an iterated section over an array', () => {
    const result = safeMustacheRender('Choices: {{#choices}}[{{label}}]{{/choices}}', {
      choices: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    });
    assert.equal(result.rendered, 'Choices: [A][B][C]');
    assert.isUndefined(result.error);
  });

  it('treats a falsy section as empty without rendering its body', () => {
    const result = safeMustacheRender('Hint: {{#show_hint}}always think first{{/show_hint}}done', {
      show_hint: false,
    });
    assert.equal(result.rendered, 'Hint: done');
    assert.isUndefined(result.error);
  });

  it('renders the empty string for an empty template', () => {
    const result = safeMustacheRender('', {});
    assert.equal(result.rendered, '');
    assert.isUndefined(result.error);
  });

  it('does not strip valid LaTeX with no mustache delimiters', () => {
    const template = 'Use the set $\\mathbb{R}^n$ and $\\frac{a}{b}$.';
    const result = safeMustacheRender(template, {});
    assert.equal(result.rendered, template);
    assert.isUndefined(result.error);
  });
});
