import { assert, describe, it } from 'vitest';

import { extractMustacheTemplateNames, isValidMustacheTemplateName } from './validateHTML.js';

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

  it('handles Mustache tags with dots', () => {
    assertExtractsNames('Hello, {{foo.bar}}!', ['foo.bar']);
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

  it('handles Mustache sections with dots', () => {
    assertExtractsNames('Hello, {{#foo}}{{.}}{{/foo}}!', ['foo']);
  });

  it('handles nested Mustache sections', () => {
    assertExtractsNames('Hello, {{#foo}}{{#bar}}{{name}}{{/bar}}{{/foo}}!', ['foo', 'bar', 'name']);
  });

  it('handles Mustache comments', () => {
    assertExtractsNames('Hello, {{! This is a comment }}{{name}}!', ['name']);
  });
});

describe('isValidMustacheTemplateName', () => {
  it('validates simple name', () => {
    assert.isTrue(isValidMustacheTemplateName('name'));
  });

  it('validates name with dots', () => {
    assert.isTrue(isValidMustacheTemplateName('foo.bar'));
  });

  it('validates name with underscores', () => {
    assert.isTrue(isValidMustacheTemplateName('foo_bar'));
  });

  it('validates name with underscores and dots', () => {
    assert.isTrue(isValidMustacheTemplateName('foo.bar_baz'));
  });

  it('validates name with numbers', () => {
    assert.isTrue(isValidMustacheTemplateName('foo123'));
  });

  it('validates name with underscores, dots, and numbers', () => {
    assert.isTrue(isValidMustacheTemplateName('foo.123.bar_baz'));
  });

  it('rejects name with spaces', () => {
    assert.isFalse(isValidMustacheTemplateName('foo bar'));
  });

  it('rejects name with operators', () => {
    assert.isFalse(isValidMustacheTemplateName('foo+bar'));
    assert.isFalse(isValidMustacheTemplateName('foo==bar'));
  });

  it('rejects name with operators and spaces', () => {
    assert.isFalse(isValidMustacheTemplateName('foo + bar'));
    assert.isFalse(isValidMustacheTemplateName('foo == bar'));
  });
});
