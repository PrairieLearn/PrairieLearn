import { assert, describe, it } from 'vitest';

import { calculatedHandler } from './calculated.js';

const baseBody = {
  type: 'calculated' as const,
  formula: '[x] + [y]',
  vars: [
    { name: 'x', min: 1, max: 10, decimalPlaces: 2 },
    { name: 'y', min: 0, max: 5, decimalPlaces: 1 },
  ],
  tolerance: 0,
  toleranceType: 'absolute' as const,
};

describe('calculatedHandler.transformPrompt', () => {
  it('replaces [varname] references with {{params.varname}}', () => {
    const prompt = calculatedHandler.transformPrompt!('Find [x] plus [y]', baseBody);
    assert.equal(prompt, 'Find {{params.x}} plus {{params.y}}');
  });

  it('leaves unrelated brackets untouched', () => {
    const prompt = calculatedHandler.transformPrompt!('Find [x] and [z]', baseBody);
    assert.include(prompt, '{{params.x}}');
    assert.include(prompt, '[z]');
  });

  it('handles repeated variable references', () => {
    const prompt = calculatedHandler.transformPrompt!('[x] times [x]', baseBody);
    assert.equal(prompt, '{{params.x}} times {{params.x}}');
  });
});

describe('calculatedHandler.renderHtml', () => {
  it('renders pl-number-input without tolerance when tolerance is 0', () => {
    const html = calculatedHandler.renderHtml(baseBody);
    assert.equal(html, '<pl-number-input answers-name="answer"></pl-number-input>');
  });

  it('adds atol for absolute tolerance', () => {
    const html = calculatedHandler.renderHtml({
      ...baseBody,
      tolerance: 0.5,
      toleranceType: 'absolute',
    });
    assert.include(html, 'atol="0.5"');
    assert.notInclude(html, 'rtol=');
  });

  it('adds rtol for relative tolerance (divides by 100)', () => {
    const html = calculatedHandler.renderHtml({
      ...baseBody,
      tolerance: 10,
      toleranceType: 'relative',
    });
    assert.include(html, 'rtol="0.1"');
    assert.notInclude(html, 'atol=');
  });
});

describe('calculatedHandler.renderGeneratePy', () => {
  it('imports math and random, defines generate(data)', () => {
    const py = calculatedHandler.renderGeneratePy!(baseBody);
    assert.include(py, 'import math');
    assert.include(py, 'import random');
    assert.include(py, 'def generate(data):');
  });

  it('generates random.uniform calls for each variable', () => {
    const py = calculatedHandler.renderGeneratePy!(baseBody);
    assert.include(py, 'x = round(random.uniform(1, 10), 2)');
    assert.include(py, 'y = round(random.uniform(0, 5), 1)');
  });

  it('assigns params for each variable', () => {
    const py = calculatedHandler.renderGeneratePy!(baseBody);
    assert.include(py, 'data["params"]["x"] = x');
    assert.include(py, 'data["params"]["y"] = y');
  });

  it('assigns correct_answers', () => {
    const py = calculatedHandler.renderGeneratePy!(baseBody);
    assert.include(py, 'data["correct_answers"]["answer"]');
  });

  it('converts Canvas formula syntax to Python', () => {
    const py = calculatedHandler.renderGeneratePy!({
      ...baseBody,
      formula: 'sqrt([x]) + log([y])',
      vars: [
        { name: 'x', min: 1, max: 100, decimalPlaces: 0 },
        { name: 'y', min: 1, max: 10, decimalPlaces: 0 },
      ],
    });
    assert.include(py, 'math.sqrt(x)');
    assert.include(py, 'math.log10(y)');
  });

  it('converts exponentiation ^ to **', () => {
    const py = calculatedHandler.renderGeneratePy!({
      ...baseBody,
      formula: '[x]^2',
    });
    assert.include(py, 'x**2');
  });

  it('includes tolerance comment in correct_answers line when tolerance > 0', () => {
    const py = calculatedHandler.renderGeneratePy!({
      ...baseBody,
      tolerance: 5,
      toleranceType: 'relative',
    });
    assert.include(py, '# tolerance: 5%');
  });

  it('omits tolerance comment when tolerance is 0', () => {
    const py = calculatedHandler.renderGeneratePy!(baseBody);
    assert.notInclude(py, '# tolerance');
  });
});
