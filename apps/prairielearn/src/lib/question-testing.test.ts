import { assert, describe, it } from 'vitest';

import { buildVariantSeed } from './question-testing.js';

describe('buildVariantSeed', () => {
  /**
   * Seeds reach Python through `Number.parseInt(seed, 36)`, so the properties
   * that matter are about the parsed number, not the string.
   */
  function numericSeeds(prefix: string, count: number) {
    return Array.from({ length: count }, (_, iter) =>
      Number.parseInt(buildVariantSeed(prefix, iter), 36),
    );
  }

  const PREFIXES = ['smoke', 'loop-broken', 'loopgood', '---', '', 'Loop-Broken!', 'abcdefghij'];

  it('round-trips exactly through parseInt', () => {
    for (const prefix of PREFIXES) {
      for (let iter = 0; iter < 20; iter++) {
        const seed = buildVariantSeed(prefix, iter);
        assert.equal(Number.parseInt(seed, 36).toString(36), seed);
      }
    }
  });

  it('produces distinct numeric seeds for each iteration', () => {
    for (const prefix of PREFIXES) {
      const seeds = numericSeeds(prefix, 300);
      assert.equal(new Set(seeds).size, seeds.length, `collision for prefix "${prefix}"`);
    }
  });

  it('stays within the range numpy accepts for a seed', () => {
    // `np.random.seed` throws outside [0, 2**32 - 1], which kills the worker.
    for (const prefix of PREFIXES) {
      for (const seed of numericSeeds(prefix, 300)) {
        assert.isTrue(Number.isInteger(seed) && seed >= 0 && seed <= 2 ** 32 - 1, `${seed}`);
      }
    }
  });

  it('only emits base-36 characters', () => {
    assert.match(buildVariantSeed('Loop-Broken!', 41), /^[0-9a-z]+$/);
  });

  it('is deterministic', () => {
    assert.equal(buildVariantSeed('loop-broken', 7), buildVariantSeed('loop-broken', 7));
  });

  it('distinguishes different prefixes', () => {
    assert.notEqual(buildVariantSeed('alpha', 0), buildVariantSeed('beta', 0));
  });
});
