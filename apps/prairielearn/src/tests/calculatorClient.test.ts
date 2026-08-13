// @vitest-environment jsdom

import { ComputeEngine } from '@cortex-js/compute-engine';
import { expect, test, vi } from 'vitest';

import {
  evaluateCalculatorAssignment,
  withCalculatorTimeLimit,
} from '../../assets/scripts/calculatorClient.js';

test('limits calculator evaluation callbacks', () => {
  const ce = new ComputeEngine();

  expect(() =>
    withCalculatorTimeLimit(ce, () => ce.parse('\\sum_{k=1}^{1000000}\\frac{1}{k}').evaluate().N()),
  ).toThrow(/Timeout exceeded/);
});

test('evaluates and formats assignments within the same time limit', () => {
  const ce = new ComputeEngine();
  const expression = ce.expr(3);
  const evaluated = ce.number(3);
  let timeLimitActive = false;

  vi.spyOn(ce, 'withTimeLimit').mockImplementation((_options, callback) => {
    timeLimitActive = true;
    try {
      return callback();
    } finally {
      timeLimitActive = false;
    }
  });
  vi.spyOn(ce, 'expr').mockReturnValue(expression);
  vi.spyOn(expression, 'evaluate').mockReturnValue(evaluated);
  vi.spyOn(evaluated, 'toLatex').mockImplementation(() => {
    expect(timeLimitActive).toBe(true);
    return '3';
  });

  expect(evaluateCalculatorAssignment(ce, 'x', 3)).toEqual({ name: 'x', value: '3' });
});
