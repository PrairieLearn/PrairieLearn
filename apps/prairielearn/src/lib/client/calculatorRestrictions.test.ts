import { ComputeEngine } from '@cortex-js/compute-engine';
import { describe, expect, it } from 'vitest';

import {
  isSupportedCalculatorExpression,
  isSupportedCalculatorInput,
  parseCalculatorExpression,
} from './calculatorRestrictions.js';

describe.each(['basic', 'scientific'] as const)('%s calculator restrictions', (mode) => {
  it('allows arithmetic with fractions and percentages', () => {
    const latex = String.raw`\frac{12+34}{2}\times 15\%`;
    expect(isSupportedCalculatorInput(latex, mode)).toBe(true);
    expect(isSupportedCalculatorExpression(parseCalculatorExpression(latex, mode), mode)).toBe(
      true,
    );
  });

  it('allows the ans button output before and after MathLive adds a font wrapper', () => {
    for (const latex of [
      String.raw`\operatorname{ans}+1`,
      String.raw`\operatorname{\mathrm{ans}}+1`,
    ]) {
      expect(isSupportedCalculatorInput(latex, mode)).toBe(true);
      expect(isSupportedCalculatorExpression(parseCalculatorExpression(latex, mode), mode)).toBe(
        true,
      );
    }
  });

  it('allows unfinished input while editing', () => {
    expect(isSupportedCalculatorInput('1+', mode)).toBe(true);
  });

  it('rejects integrals for both display and evaluation', () => {
    const latex = String.raw`\int_0^1 x^2 dx`;
    expect(isSupportedCalculatorInput(latex, mode)).toBe(false);
    expect(isSupportedCalculatorExpression(parseCalculatorExpression(latex, mode), mode)).toBe(
      false,
    );
  });
});

it.each(['x', 'e', String.raw`\pi`])('basic rejects letters and constants: %s', (latex) => {
  expect(isSupportedCalculatorInput(latex, 'basic')).toBe(false);
  expect(isSupportedCalculatorExpression(parseCalculatorExpression(latex, 'basic'), 'basic')).toBe(
    false,
  );
});

it('scientific allows functions and constants', () => {
  const latex = String.raw`\sin(\pi/2)`;
  expect(isSupportedCalculatorInput(latex, 'scientific')).toBe(true);
  expect(
    isSupportedCalculatorExpression(parseCalculatorExpression(latex, 'scientific'), 'scientific'),
  ).toBe(true);
});

describe('Compute Engine parser compatibility', () => {
  it('restricts powers before canonicalization turns them into numbers', () => {
    const expression = parseCalculatorExpression('2^3', 'basic');
    expect(expression).toEqual(['Power', 2, 3]);
    expect(new ComputeEngine().parse('2^3').json).toBe(8);
    expect(isSupportedCalculatorInput('2^3', 'basic')).toBe(false);
    expect(isSupportedCalculatorExpression(expression, 'basic')).toBe(false);
    expect(isSupportedCalculatorInput('2^3', 'scientific')).toBe(true);
    expect(
      isSupportedCalculatorExpression(parseCalculatorExpression('2^3', 'scientific'), 'scientific'),
    ).toBe(true);
  });

  it('rejects nested forbidden operations even when evaluation would erase them', () => {
    const latex = String.raw`0\times\int_0^1 x^2 dx`;
    expect(new ComputeEngine().parse(latex).evaluate().json).toBe(0);
    expect(
      isSupportedCalculatorExpression(parseCalculatorExpression(latex, 'scientific'), 'scientific'),
    ).toBe(false);
  });

  it('accepts MathLive inverse-trigonometric notation', () => {
    const latex = String.raw`\sin^{-1}(1)`;
    expect(isSupportedCalculatorInput(latex, 'scientific')).toBe(true);
    expect(
      isSupportedCalculatorExpression(parseCalculatorExpression(latex, 'scientific'), 'scientific'),
    ).toBe(true);
    expect(new ComputeEngine().parse(latex).json).toEqual(['Arcsin', 1]);
  });
});
