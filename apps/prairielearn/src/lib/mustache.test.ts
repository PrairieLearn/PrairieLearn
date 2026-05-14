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
});
