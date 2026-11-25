import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import mustache from 'mustache';
import { assert, describe, it } from 'vitest';

import { parseMustacheTemplate } from './mustache-parse.js';
import { MustacheRenderLimitError, renderMustache, safeMustacheRender } from './mustache.js';
import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from './paths.js';

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

/**
 * Builds a view in which every name the template uses is defined, so that
 * sections iterate and variables render. Variables get `value`, and sections
 * get `section`.
 */
function viewForTemplate(template: string, value: unknown, section: unknown) {
  const view: Record<string, any> = {};
  const define = (name: string, leaf: unknown) => {
    if (name === '.') return;
    const segments = name.split('.');
    let object = view;
    for (const segment of segments.slice(0, -1)) {
      if (typeof object[segment] !== 'object' || Array.isArray(object[segment])) {
        object[segment] = {};
      }
      object = object[segment];
    }
    const last = segments.at(-1)!;
    if (typeof object[last] !== 'object' || Array.isArray(object[last])) object[last] = leaf;
  };
  const visit = (tokens: any[]) => {
    for (const token of tokens) {
      if (token[0] === 'name' || token[0] === '&') define(token[1], value);
      if (token[0] === '#' || token[0] === '^') {
        define(token[1], section);
        visit(token[4]);
      }
    }
  };
  visit(parseMustacheTemplate(template));
  return view;
}

describe('renderMustache', () => {
  it('matches mustache.js for templates in the example course and test course', async () => {
    let count = 0;
    for (const root of [EXAMPLE_COURSE_PATH, TEST_COURSE_PATH]) {
      for (const file of await fs.readdir(root, { recursive: true })) {
        if (!file.endsWith('question.html')) continue;
        const template = await fs.readFile(path.join(root, file), 'utf8');
        for (const view of [
          {},
          viewForTemplate(template, '<b>"&\'</b>', [{ i: 1 }, { i: 2 }]),
          viewForTemplate(template, ['a<', 2, [3, '&']], 'section'),
        ]) {
          assert.equal(renderMustache(template, view), mustache.render(template, view), file);
        }
        count++;
      }
    }
    assert.isAbove(count, 200);
  });

  it('limits sections nested inside loops', () => {
    const template = '{{#a}}'.repeat(6) + 'x' + '{{/a}}'.repeat(6);
    assert.throws(
      () => renderMustache(template, { a: Array.from({ length: 20 }, (_, i) => i) }),
      MustacheRenderLimitError,
      /work limit/,
    );
  });

  it('limits section nesting depth', () => {
    const template = '{{^a}}'.repeat(1000) + 'x' + '{{/a}}'.repeat(1000);
    assert.throws(() => renderMustache(template, {}), MustacheRenderLimitError, /nested/);
  });

  it('limits output length', () => {
    assert.throws(
      () =>
        renderMustache('{{#a}}{{{big}}}{{/a}}', {
          a: Array.from({ length: 100 }, (_, i) => i),
          big: 'x'.repeat(1_000_000),
        }),
      MustacheRenderLimitError,
      /output limit/,
    );
  });

  it('limits calls to built-in methods on large views', () => {
    assert.throws(
      () =>
        renderMustache('{{#r}}{{#w}}{{^join}}{{/join}}{{/w}}{{/r}}', {
          r: Array.from({ length: 10_000 }, (_, i) => i),
          w: [Array.from({ length: 100_000 }, (_, i) => i)],
        }),
      MustacheRenderLimitError,
      /work limit/,
    );
  });
});
