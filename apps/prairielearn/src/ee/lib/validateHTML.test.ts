import { assert, describe, it } from 'vitest';

import {
  extractMustacheTemplateNames,
  isValidMustacheTemplateName,
  validateHTML,
} from './validateHTML.js';

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

describe('validateHTML forbidden document tags', () => {
  it('rejects <html> tag', () => {
    const { errors } = validateHTML(
      '<html><pl-question-panel>Hello</pl-question-panel></html>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<html>');
  });

  it('rejects <body> tag', () => {
    const { errors } = validateHTML(
      '<body><pl-question-panel>Hello</pl-question-panel></body>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<body>');
  });

  it('rejects <head> tag', () => {
    const { errors } = validateHTML(
      '<head><meta charset="utf-8"></head><pl-question-panel>Hello</pl-question-panel>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<head>');
  });

  it('rejects <!DOCTYPE> declaration', () => {
    const { errors } = validateHTML(
      '<!DOCTYPE html>\n<pl-question-panel>Hello</pl-question-panel>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<!DOCTYPE>');
  });

  it('rejects case-insensitive variants', () => {
    const { errors } = validateHTML(
      '<HTML><BODY><pl-question-panel>Hello</pl-question-panel></BODY></HTML>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<html>');
  });

  it('accepts valid content without document tags', () => {
    const { errors } = validateHTML(
      '<pl-question-panel><p>What is 2+2?</p></pl-question-panel><pl-integer-input answers-name="ans" correct-answer="4"></pl-integer-input>',
      true,
    );
    assert.deepEqual(errors, []);
  });
});

describe('validateHTML integer attributes', () => {
  /** Test integer validation via pl-integer-input's weight attribute */
  function validateIntegerAttr(value: string): string[] {
    return validateHTML(
      `<pl-integer-input answers-name="x" weight="${value}"></pl-integer-input>`,
      true,
    ).errors;
  }

  it('accepts positive integers', () => {
    assert.deepEqual(validateIntegerAttr('1'), []);
    assert.deepEqual(validateIntegerAttr('42'), []);
    assert.deepEqual(validateIntegerAttr('12345'), []);
  });

  it('accepts zero', () => {
    assert.deepEqual(validateIntegerAttr('0'), []);
  });

  it('accepts negative integers', () => {
    assert.deepEqual(validateIntegerAttr('-1'), []);
    assert.deepEqual(validateIntegerAttr('-42'), []);
    assert.deepEqual(validateIntegerAttr('-12345'), []);
  });

  it('accepts mustache templates', () => {
    assert.deepEqual(validateIntegerAttr('{{weight}}'), []);
    assert.deepEqual(validateIntegerAttr('{{params.weight}}'), []);
  });

  it('rejects floating-point numbers', () => {
    const errors = validateIntegerAttr('1.5');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an integer')));
  });

  it('rejects scientific notation', () => {
    const errors = validateIntegerAttr('1e5');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an integer')));
  });

  it('rejects non-numeric strings', () => {
    const errors = validateIntegerAttr('abc');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an integer')));
  });

  it('rejects empty string', () => {
    const errors = validateIntegerAttr('');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an integer')));
  });
});

describe('validateHTML float attributes', () => {
  // Test float validation via pl-number-input's rtol attribute
  /** (correct-answer specifically forbids mustache templates, so we use rtol instead) */
  function validateFloatAttr(value: string): string[] {
    return validateHTML(
      `<pl-number-input answers-name="x" rtol="${value}"></pl-number-input>`,
      true,
    ).errors;
  }

  it('accepts positive integers', () => {
    assert.deepEqual(validateFloatAttr('1'), []);
    assert.deepEqual(validateFloatAttr('42'), []);
  });

  it('accepts zero', () => {
    assert.deepEqual(validateFloatAttr('0'), []);
  });

  it('accepts negative integers', () => {
    assert.deepEqual(validateFloatAttr('-1'), []);
    assert.deepEqual(validateFloatAttr('-42'), []);
  });

  it('accepts positive decimals', () => {
    assert.deepEqual(validateFloatAttr('1.5'), []);
    assert.deepEqual(validateFloatAttr('3.14159'), []);
    assert.deepEqual(validateFloatAttr('0.5'), []);
  });

  it('accepts negative decimals', () => {
    assert.deepEqual(validateFloatAttr('-1.5'), []);
    assert.deepEqual(validateFloatAttr('-3.14159'), []);
    assert.deepEqual(validateFloatAttr('-0.5'), []);
  });

  it('accepts numbers starting with decimal point', () => {
    assert.deepEqual(validateFloatAttr('.5'), []);
    assert.deepEqual(validateFloatAttr('.123'), []);
    assert.deepEqual(validateFloatAttr('-.5'), []);
  });

  it('accepts scientific notation with positive exponent', () => {
    assert.deepEqual(validateFloatAttr('1e5'), []);
    assert.deepEqual(validateFloatAttr('1E5'), []);
    assert.deepEqual(validateFloatAttr('1e+5'), []);
    assert.deepEqual(validateFloatAttr('2.5e10'), []);
  });

  it('accepts scientific notation with negative exponent', () => {
    assert.deepEqual(validateFloatAttr('1e-5'), []);
    assert.deepEqual(validateFloatAttr('1E-5'), []);
    assert.deepEqual(validateFloatAttr('2.5e-10'), []);
  });

  it('accepts negative numbers with scientific notation', () => {
    assert.deepEqual(validateFloatAttr('-1e5'), []);
    assert.deepEqual(validateFloatAttr('-2.5e-10'), []);
  });

  it('accepts mustache templates', () => {
    assert.deepEqual(validateFloatAttr('{{answer}}'), []);
    assert.deepEqual(validateFloatAttr('{{params.answer}}'), []);
  });

  it('rejects non-numeric strings', () => {
    const errors = validateFloatAttr('abc');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an floating-point number')));
  });

  it('rejects empty string', () => {
    const errors = validateFloatAttr('');
    assert.isNotEmpty(errors);
    assert.isTrue(errors.some((e) => e.includes('must be an floating-point number')));
  });

  it('rejects malformed scientific notation', () => {
    const errors1 = validateFloatAttr('1e');
    assert.isNotEmpty(errors1);
    assert.isTrue(errors1.some((e) => e.includes('must be an floating-point number')));

    const errors2 = validateFloatAttr('e5');
    assert.isNotEmpty(errors2);
    assert.isTrue(errors2.some((e) => e.includes('must be an floating-point number')));
  });
});

describe('validateHTML panel nesting', () => {
  it('warns about input element inside pl-submission-panel', () => {
    const { warnings } = validateHTML(
      '<pl-submission-panel><pl-string-input answers-name="ans" correct-answer="x"></pl-string-input></pl-submission-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-string-input') && w.includes('pl-submission-panel')),
    );
  });

  it('warns about input element inside pl-answer-panel', () => {
    const { warnings } = validateHTML(
      '<pl-answer-panel><pl-number-input answers-name="ans"></pl-number-input></pl-answer-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-number-input') && w.includes('pl-answer-panel')),
    );
  });

  it('warns about input element inside pl-question-panel', () => {
    const { warnings } = validateHTML(
      '<pl-question-panel><pl-integer-input answers-name="ans" correct-answer="42"></pl-integer-input></pl-question-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-integer-input') && w.includes('pl-question-panel')),
    );
  });

  it('accepts input element at top level', () => {
    const { errors, warnings } = validateHTML(
      '<pl-question-panel><p>Question</p></pl-question-panel>' +
        '<pl-string-input answers-name="ans" correct-answer="x"></pl-string-input>',
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('warns about input element deeply nested inside panel', () => {
    const { warnings } = validateHTML(
      '<pl-submission-panel><div><pl-string-input answers-name="ans" correct-answer="x"></pl-string-input></div></pl-submission-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-string-input') && w.includes('pl-submission-panel')),
    );
  });

  it('accepts non-input content inside pl-submission-panel', () => {
    const { errors, warnings } = validateHTML(
      '<pl-string-input answers-name="ans" correct-answer="x"></pl-string-input>' +
        '<pl-submission-panel><p>Your answer was submitted.</p></pl-submission-panel>',
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });
});
