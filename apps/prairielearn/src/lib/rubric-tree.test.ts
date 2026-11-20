import { assert, describe, it } from 'vitest';

import { RUBRIC_MAX_DEPTH, type RubricTreeNodeInput, resolveRubricTree } from './rubric-tree.js';

const leaf = (depth = 0, points = 1): RubricTreeNodeInput => ({ depth, points });
const group = (
  depth = 0,
  rule: Pick<RubricTreeNodeInput, 'min_selections' | 'max_selections'> = {},
): RubricTreeNodeInput => ({ depth, is_group: true, ...rule });

describe('resolveRubricTree', () => {
  it('treats a flat rubric as all top-level leaves numbered by position', () => {
    const tree = resolveRubricTree([leaf(), leaf(), leaf()]);
    assert.deepEqual(tree.parentIndex, [null, null, null]);
    assert.deepEqual(tree.leafIndex, [0, 1, 2]);
    assert.equal(tree.leafCount, 3);
  });

  it('treats a missing depth as top level', () => {
    const tree = resolveRubricTree([{ points: 1 }, { points: 2 }]);
    assert.deepEqual(tree.parentIndex, [null, null]);
  });

  it('recovers parents from a pre-order list with mixed items and groups', () => {
    // 0 item
    // 1 group
    //   2 item
    //   3 group
    //     4 item
    //     5 item
    //   6 item
    // 7 item
    const tree = resolveRubricTree([
      leaf(0),
      group(0),
      leaf(1),
      group(1),
      leaf(2),
      leaf(2),
      leaf(1),
      leaf(0),
    ]);
    assert.deepEqual(tree.parentIndex, [null, null, 1, 1, 3, 3, 1, null]);
    assert.deepEqual(tree.leafIndex, [0, null, 1, null, 2, 3, 4, 5]);
    assert.deepEqual(tree.childCount, [0, 3, 0, 2, 0, 0, 0, 0]);
    assert.equal(tree.leafCount, 6);
  });

  it('allows an empty group', () => {
    const tree = resolveRubricTree([group(0), leaf(0)]);
    assert.deepEqual(tree.childCount, [0, 0]);
  });

  it('rejects nesting deeper than the limit', () => {
    const rows = [group(0), group(1), group(2), leaf(3)];
    assert.equal(RUBRIC_MAX_DEPTH, 3);
    assert.throws(() => resolveRubricTree(rows), /at most 3 levels/);
  });

  it('rejects an item indented under a leaf', () => {
    assert.throws(() => resolveRubricTree([leaf(0), leaf(1)]), /not a group/);
  });

  it('rejects skipping a level', () => {
    assert.throws(() => resolveRubricTree([group(0), leaf(2)]), /not a group/);
  });

  it('rejects a first row that is not at the top level', () => {
    assert.throws(() => resolveRubricTree([leaf(1)]), /not a group/);
  });

  it('rejects negative or fractional depths', () => {
    assert.throws(() => resolveRubricTree([leaf(-1)]), /non-negative integer/);
    assert.throws(() => resolveRubricTree([leaf(0.5)]), /non-negative integer/);
  });

  it('rejects points on a group', () => {
    assert.throws(
      () => resolveRubricTree([{ ...group(0), points: 2 }, leaf(1)]),
      /cannot have points/,
    );
  });

  it('allows zero points on a group', () => {
    resolveRubricTree([{ ...group(0), points: 0 }, leaf(1)]);
  });

  it('accepts select-one, required and exactly-one rules on a group of items', () => {
    for (const rule of [
      { max_selections: 1 },
      { min_selections: 1 },
      { min_selections: 1, max_selections: 1 },
    ]) {
      resolveRubricTree([group(0, rule), leaf(1), leaf(1)]);
    }
  });

  it('rejects selection rules on leaves', () => {
    assert.throws(
      () => resolveRubricTree([{ ...leaf(0), max_selections: 1 }]),
      /only be set on rubric groups/,
    );
  });

  it('rejects selection rules on a group that contains groups', () => {
    assert.throws(
      () => resolveRubricTree([group(0, { max_selections: 1 }), group(1), leaf(2)]),
      /directly contain items/,
    );
  });

  it('rejects invalid selection ranges', () => {
    assert.throws(
      () => resolveRubricTree([group(0, { max_selections: 0 }), leaf(1)]),
      /positive integer/,
    );
    assert.throws(
      () => resolveRubricTree([group(0, { min_selections: -1 }), leaf(1)]),
      /non-negative integer/,
    );
    assert.throws(
      () =>
        resolveRubricTree([group(0, { min_selections: 2, max_selections: 1 }), leaf(1), leaf(1)]),
      /cannot be more than/,
    );
  });

  it('rejects a minimum that the group cannot satisfy', () => {
    assert.throws(
      () => resolveRubricTree([group(0, { min_selections: 2 }), leaf(1)]),
      /could never be satisfied/,
    );
  });
});
