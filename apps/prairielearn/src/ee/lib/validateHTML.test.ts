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
  it('rejects <html> tag', async () => {
    const { errors } = await validateHTML(
      '<html><pl-question-panel>Hello</pl-question-panel></html>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<html>');
  });

  it('rejects <body> tag', async () => {
    const { errors } = await validateHTML(
      '<body><pl-question-panel>Hello</pl-question-panel></body>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<body>');
  });

  it('rejects <head> tag', async () => {
    const { errors } = await validateHTML(
      '<head><meta charset="utf-8"></head><pl-question-panel>Hello</pl-question-panel>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<head>');
  });

  it('rejects <!DOCTYPE> declaration', async () => {
    const { errors } = await validateHTML(
      '<!DOCTYPE html>\n<pl-question-panel>Hello</pl-question-panel>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<!DOCTYPE>');
  });

  it('rejects case-insensitive variants', async () => {
    const { errors } = await validateHTML(
      '<HTML><BODY><pl-question-panel>Hello</pl-question-panel></BODY></HTML>',
      true,
    );
    assert.lengthOf(errors, 1);
    assert.include(errors[0], '<html>');
  });

  it('accepts valid content without document tags', async () => {
    const { errors } = await validateHTML(
      '<pl-question-panel><p>What is 2+2?</p></pl-question-panel><pl-integer-input answers-name="ans" correct-answer="4"></pl-integer-input>',
      true,
    );
    assert.deepEqual(errors, []);
  });
});

describe('validateHTML integer attributes', () => {
  /** Test integer validation via pl-integer-input's weight attribute */
  async function validateIntegerAttr(value: string): Promise<string[]> {
    return (
      await validateHTML(
        `<pl-integer-input answers-name="x" weight="${value}"></pl-integer-input>`,
        true,
      )
    ).errors;
  }

  it('accepts positive integers', async () => {
    assert.deepEqual(await validateIntegerAttr('1'), []);
    assert.deepEqual(await validateIntegerAttr('42'), []);
    assert.deepEqual(await validateIntegerAttr('12345'), []);
  });

  it('accepts zero', async () => {
    assert.deepEqual(await validateIntegerAttr('0'), []);
  });

  it('accepts negative integers', async () => {
    assert.deepEqual(await validateIntegerAttr('-1'), []);
    assert.deepEqual(await validateIntegerAttr('-42'), []);
    assert.deepEqual(await validateIntegerAttr('-12345'), []);
  });

  it('accepts mustache templates', async () => {
    assert.deepEqual(await validateIntegerAttr('{{weight}}'), []);
    assert.deepEqual(await validateIntegerAttr('{{params.weight}}'), []);
  });

  it('rejects floating-point numbers', async () => {
    const errors = await validateIntegerAttr('1.5');
    assert.isNotEmpty(errors);
  });

  it('rejects scientific notation', async () => {
    const errors = await validateIntegerAttr('1e5');
    assert.isNotEmpty(errors);
  });

  it('rejects non-numeric strings', async () => {
    const errors = await validateIntegerAttr('abc');
    assert.isNotEmpty(errors);
  });

  it('rejects empty string', async () => {
    const errors = await validateIntegerAttr('');
    assert.isNotEmpty(errors);
  });
});

describe('validateHTML float attributes', () => {
  // Test float validation via pl-number-input's rtol attribute
  /** (correct-answer specifically forbids mustache templates, so we use rtol instead) */
  async function validateFloatAttr(value: string): Promise<string[]> {
    return (
      await validateHTML(
        `<pl-number-input answers-name="x" rtol="${value}"></pl-number-input>`,
        true,
      )
    ).errors;
  }

  it('accepts positive integers', async () => {
    assert.deepEqual(await validateFloatAttr('1'), []);
    assert.deepEqual(await validateFloatAttr('42'), []);
  });

  it('accepts zero', async () => {
    assert.deepEqual(await validateFloatAttr('0'), []);
  });

  it('accepts negative integers', async () => {
    assert.deepEqual(await validateFloatAttr('-1'), []);
    assert.deepEqual(await validateFloatAttr('-42'), []);
  });

  it('accepts positive decimals', async () => {
    assert.deepEqual(await validateFloatAttr('1.5'), []);
    assert.deepEqual(await validateFloatAttr('3.14159'), []);
    assert.deepEqual(await validateFloatAttr('0.5'), []);
  });

  it('accepts negative decimals', async () => {
    assert.deepEqual(await validateFloatAttr('-1.5'), []);
    assert.deepEqual(await validateFloatAttr('-3.14159'), []);
    assert.deepEqual(await validateFloatAttr('-0.5'), []);
  });

  it('accepts numbers starting with decimal point', async () => {
    assert.deepEqual(await validateFloatAttr('.5'), []);
    assert.deepEqual(await validateFloatAttr('.123'), []);
    assert.deepEqual(await validateFloatAttr('-.5'), []);
  });

  it('accepts scientific notation with positive exponent', async () => {
    assert.deepEqual(await validateFloatAttr('1e5'), []);
    assert.deepEqual(await validateFloatAttr('1E5'), []);
    assert.deepEqual(await validateFloatAttr('1e+5'), []);
    assert.deepEqual(await validateFloatAttr('2.5e10'), []);
  });

  it('accepts scientific notation with negative exponent', async () => {
    assert.deepEqual(await validateFloatAttr('1e-5'), []);
    assert.deepEqual(await validateFloatAttr('1E-5'), []);
    assert.deepEqual(await validateFloatAttr('2.5e-10'), []);
  });

  it('accepts negative numbers with scientific notation', async () => {
    assert.deepEqual(await validateFloatAttr('-1e5'), []);
    assert.deepEqual(await validateFloatAttr('-2.5e-10'), []);
  });

  it('accepts mustache templates', async () => {
    assert.deepEqual(await validateFloatAttr('{{answer}}'), []);
    assert.deepEqual(await validateFloatAttr('{{params.answer}}'), []);
  });

  it('rejects non-numeric strings', async () => {
    const errors = await validateFloatAttr('abc');
    assert.isNotEmpty(errors);
  });

  it('rejects empty string', async () => {
    const errors = await validateFloatAttr('');
    assert.isNotEmpty(errors);
  });

  it('rejects malformed scientific notation', async () => {
    const errors1 = await validateFloatAttr('1e');
    assert.isNotEmpty(errors1);

    const errors2 = await validateFloatAttr('e5');
    assert.isNotEmpty(errors2);
  });
});

describe('validateHTML panel nesting', () => {
  it('warns about input element inside pl-submission-panel', async () => {
    const { warnings } = await validateHTML(
      '<pl-submission-panel><pl-string-input answers-name="ans" correct-answer="x"></pl-string-input></pl-submission-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-string-input') && w.includes('pl-submission-panel')),
    );
  });

  it('warns about input element inside pl-answer-panel', async () => {
    const { warnings } = await validateHTML(
      '<pl-answer-panel><pl-number-input answers-name="ans"></pl-number-input></pl-answer-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-number-input') && w.includes('pl-answer-panel')),
    );
  });

  it('warns about input element inside pl-question-panel', async () => {
    const { warnings } = await validateHTML(
      '<pl-question-panel><pl-integer-input answers-name="ans" correct-answer="42"></pl-integer-input></pl-question-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-integer-input') && w.includes('pl-question-panel')),
    );
  });

  it('accepts input element at top level', async () => {
    const { errors, warnings } = await validateHTML(
      '<pl-question-panel><p>Question</p></pl-question-panel>' +
        '<pl-string-input answers-name="ans" correct-answer="x"></pl-string-input>',
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('warns about input element deeply nested inside panel', async () => {
    const { warnings } = await validateHTML(
      '<pl-submission-panel><div><pl-string-input answers-name="ans" correct-answer="x"></pl-string-input></div></pl-submission-panel>',
      true,
    );
    assert.isTrue(
      warnings.some((w) => w.includes('pl-string-input') && w.includes('pl-submission-panel')),
    );
  });

  it('accepts non-input content inside pl-submission-panel', async () => {
    const { errors, warnings } = await validateHTML(
      '<pl-string-input answers-name="ans" correct-answer="x"></pl-string-input>' +
        '<pl-submission-panel><p>Your answer was submitted.</p></pl-submission-panel>',
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });
});

describe('validateHTML htmlmustache schema diagnostics', () => {
  it('surfaces pl-multiple-choice schema errors', async () => {
    const { errors } = await validateHTML(
      '<pl-multiple-choice answers-name="choice" bogus="true"><pl-answer>A</pl-answer></pl-multiple-choice>',
      true,
    );

    assert.isTrue(errors.some((error) => error.includes('bogus')));
  });

  it('does not surface non-schema htmlmustache diagnostics', async () => {
    const { errors, warnings } = await validateHTML(
      '<pl-question-panel><img src="foo.png"></pl-question-panel>',
      true,
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });
});
