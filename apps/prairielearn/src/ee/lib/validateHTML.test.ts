import { assert } from 'chai';

import { extractMustacheTemplateNames } from './validateHTML.js';

function assertExtractsNames(input: string, expectedNames: string[]) {
  assert.deepEqual(extractMustacheTemplateNames(input), new Set(expectedNames));
}

describe('extractMustacheTemplateNames', () => {
  it('handles string without Mustache tags', () => {
    assertExtractsNames('Hello, world!', []);
  });

  it('handles string with single Mustache tag', () => {
    assertExtractsNames('Hello, {{name}}!', ['name']);
  });

  it('handles string with multiple Mustache tags', () => {
    assertExtractsNames('Hello, {{name}}! Your score is {{score}}.', ['name', 'score']);
  });

  it('handles Mustache tags with spaces', () => {
    assertExtractsNames('Hello, {{ name }}!', ['name']);
  });

  it('handles triple-braced Mustache tags', () => {
    assertExtractsNames('Hello, {{{name}}}!', ['name']);
  });

  it('handles Mustache sections', () => {
    assertExtractsNames('Hello, {{#foo}}{{name}}{{/foo}}!', ['foo', 'name']);
  });

  it('handles Mustache sections with spaces', () => {
    assertExtractsNames('Hello, {{ # foo }}{{ name }}{{ / foo }}!', ['foo', 'name']);
  });

  it('handles inverted Mustache sections', () => {
    assertExtractsNames('Hello, {{^foo}}{{name}}{{/foo}}!', ['foo', 'name']);
  });

  it('handles inverted Mustache sections with spaces', () => {
    assertExtractsNames('Hello, {{ ^ foo }}{{ name }}{{ / foo }}!', ['foo', 'name']);
  });

  it('handles nested Mustache sections', () => {
    assertExtractsNames('Hello, {{#foo}}{{#bar}}{{name}}{{/bar}}{{/foo}}!', ['foo', 'bar', 'name']);
  });

  it('handles Mustache comments', () => {
    assertExtractsNames('Hello, {{! This is a comment }}{{name}}!', ['name']);
  });
});
