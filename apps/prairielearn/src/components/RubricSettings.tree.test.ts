import { assert, describe, it } from 'vitest';

import {
  type EditorTreeRow,
  depthsFromParents,
  groupWarning,
  isSortedHighestFirst,
  projectDrop,
  removeSubtree,
  rubricPointRange,
  sortChildrenByPoints,
  subgroupBlocker,
  treeGuides,
} from './RubricSettings.tree.js';

type Row = EditorTreeRow & { name: string };

/** Builds rows from strings like "  G name" (group) or "  name:3" (item with points). */
function rows(...specs: string[]): Row[] {
  return specs.map((spec) => {
    const depth = (spec.length - spec.trimStart().length) / 2;
    const text = spec.trim();
    const isGroup = text.startsWith('G ');
    const [name, rule = ''] = (isGroup ? text.slice(2) : text).split(' ');
    const [label, points = '1'] = name.split(':');
    const [min, max] = rule.split('-').map((n) => (n === '' ? null : Number(n)));
    return {
      name: label,
      depth,
      rubric_item: {
        is_group: isGroup,
        points: isGroup ? 0 : Number(points),
        min_selections: rule ? min : null,
        max_selections: rule ? max : null,
      },
    };
  });
}

const shape = (list: Row[]) => list.map((row) => `${'  '.repeat(row.depth)}${row.name}`);

describe('depthsFromParents', () => {
  it('derives depths from parent ids', () => {
    assert.deepEqual(
      depthsFromParents([
        { id: '1', parent_id: null },
        { id: '2', parent_id: '1' },
        { id: '3', parent_id: '2' },
        { id: '4', parent_id: null },
      ]),
      [0, 1, 2, 0],
    );
  });
});

describe('sorting and removing rows', () => {
  const list = rows('a', 'G g', '  b', '  c', 'd');

  it('sorts only the items inside a group by points', () => {
    const group = rows('a:5', 'G g', '  b:1', '  c:3', '  d:-2', '  e:3', 'f:4');
    const highest = sortChildrenByPoints(group, 1, 'highest-first');
    assert.deepEqual(shape(highest), ['a', 'g', '  c', '  e', '  b', '  d', 'f']);
    assert.isFalse(isSortedHighestFirst(group, 1));
    assert.isTrue(isSortedHighestFirst(highest, 1));
    assert.deepEqual(shape(sortChildrenByPoints(group, 1, 'lowest-first')), [
      'a',
      'g',
      '  d',
      '  b',
      '  c',
      '  e',
      'f',
    ]);
  });

  it('removes a group with its children', () => {
    assert.deepEqual(shape(removeSubtree(list, 1)), ['a', 'd']);
  });
});

describe('rubricPointRange', () => {
  it('sums items without rules', () => {
    assert.deepEqual(rubricPointRange(rows('a:2', 'G g', '  b:3', '  c:-1')), { max: 5, min: -1 });
  });

  it('counts only the allowed number of items in a group with a rule', () => {
    assert.deepEqual(rubricPointRange(rows('G g 1-1', '  a:3', '  b:2', '  c:0')), {
      max: 3,
      min: 0,
    });
    assert.deepEqual(rubricPointRange(rows('G g -2', '  a:-1', '  b:-0.5', '  c:-2')), {
      max: 0,
      min: -3,
    });
  });
});

describe('treeGuides', () => {
  it('continues a group line past rows until its last child', () => {
    assert.deepEqual(treeGuides(rows('G g', '  G h', '    a', '    b', '  c', 'd')), [
      [],
      ['branch'],
      ['pass', 'branch'],
      ['pass', 'end'],
      ['end'],
      [],
    ]);
    assert.deepEqual(treeGuides(rows('G g', '  G h', '    a')), [[], ['end'], ['none', 'end']]);
  });
});

describe('subgroupBlocker', () => {
  it('allows a subgroup only in top-level groups without a selection rule', () => {
    const list = rows('G g', '  a', 'G r 1-1', '  b', 'G h', '  G i', '    c');
    assert.isNull(subgroupBlocker(list, 0));
    assert.match(subgroupBlocker(list, 2) ?? '', /selection rule/);
    assert.match(subgroupBlocker(list, 5) ?? '', /at most 3 levels/);
  });
});

describe('groupWarning', () => {
  it('flags empty groups and rules the items cannot meet', () => {
    const list = rows(
      'G empty',
      'G ok 1-1',
      '  a',
      '  b',
      'G short 3-',
      '  c',
      'G flipped 2-1',
      '  d',
    );
    assert.equal(groupWarning(list, 0)?.label, 'Empty group');
    assert.isNull(groupWarning(list, 1));
    assert.isNull(groupWarning(list, 2));
    assert.match(
      groupWarning(list, 4)?.body ?? '',
      /at least 3 selected, but the group has 1 item\./,
    );
    assert.equal(groupWarning(list, 6)?.label, 'Invalid rule');
  });
});

describe('projectDrop', () => {
  const none = () => false;
  const drop = (
    list: Row[],
    activeIdx: number,
    overIdx: number,
    depthOffset = 0,
    isCollapsed: (i: number) => boolean = none,
  ) => {
    const result = projectDrop(list, { activeIdx, overIdx, depthOffset, isCollapsed });
    return result && shape(result.rows);
  };

  it('reorders rows at their own depth', () => {
    const list = rows('a', 'b', 'c');
    assert.deepEqual(drop(list, 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(drop(list, 2, 0), ['c', 'a', 'b']);
  });

  it('moves a row into the group above when dragged right, and out when dragged left', () => {
    const list = rows('G g', '  a', 'b');
    assert.deepEqual(drop(list, 2, 2, 1), ['g', '  a', '  b']);
    assert.deepEqual(drop(list, 1, 1, -1), ['g', 'a', 'b']);
  });

  it('keeps a row inside a group when dropped between two of its items', () => {
    const list = rows('G g', '  a', '  b', 'c');
    assert.deepEqual(drop(list, 3, 2, -5), ['g', '  a', '  c', '  b']);
  });

  it('moves a group with its contents', () => {
    const list = rows('a', 'G g', '  b', 'c');
    assert.deepEqual(drop(list, 1, 3), ['a', 'c', 'g', '  b']);
  });

  it('respects the depth limit and selection rules', () => {
    const deep = rows('G g', '  G h', '    a', 'G i', '  b');
    // Inside `h`, the item in `i` would be 4 levels deep, so `i` stops in `g`.
    assert.deepEqual(drop(deep, 3, 3, 2), ['g', '  h', '    a', '  i', '    b']);
    assert.isNull(
      projectDrop(deep, { activeIdx: 3, overIdx: 2, depthOffset: 0, isCollapsed: none }),
    );
    const ruled = rows('G r 1-1', '  a', 'G g', '  b');
    assert.deepEqual(drop(ruled, 2, 2, 1), ['r', '  a', 'g', '  b']);
    assert.deepEqual(drop(rows('G r 1-1', '  a', 'b'), 2, 2, 1), ['r', '  a', '  b']);
  });

  it("doesn't drop into a collapsed group", () => {
    const list = rows('a', 'G g', '  b', 'c');
    assert.deepEqual(
      drop(list, 0, 1, 1, (i) => i === 1),
      ['g', '  b', 'a', 'c'],
    );
  });

  it('rejects dropping a row inside itself', () => {
    assert.isNull(
      projectDrop(rows('G g', '  a'), {
        activeIdx: 0,
        overIdx: 1,
        depthOffset: 0,
        isCollapsed: none,
      }),
    );
  });
});
