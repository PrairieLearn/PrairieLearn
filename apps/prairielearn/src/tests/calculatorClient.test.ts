// @vitest-environment jsdom

import { ComputeEngine } from '@cortex-js/compute-engine';
import { expect, test } from 'vitest';

import { withCalculatorTimeLimit } from '../../assets/scripts/calculatorClient.js';

test('limits calculator evaluation callbacks', () => {
  const ce = new ComputeEngine();

  expect(() =>
    withCalculatorTimeLimit(ce, () => ce.parse('\\sum_{k=1}^{1000000}\\frac{1}{k}').evaluate().N()),
  ).toThrow(/Timeout exceeded/);
});
