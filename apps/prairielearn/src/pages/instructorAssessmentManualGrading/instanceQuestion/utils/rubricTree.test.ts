import { assert, describe, it } from 'vitest';

import {
  type GradingPanelRubricItem,
  buildRubricTree,
  describeSelectionRule,
  toggleRubricItem,
} from './rubricTree.js';

function item(id: string, extra: Partial<GradingPanelRubricItem> = {}): GradingPanelRubricItem {
  return {
    descriptionRendered: id,
    explanationRendered: '',
    graderNoteRendered: '',
    id,
    isGroup: false,
    keyBinding: null,
    maxSelections: null,
    minSelections: null,
    parentId: null,
    points: 1,
    ...extra,
  };
}

const items = [
  item('correct'),
  item('one', { isGroup: true, points: 0, maxSelections: 1, minSelections: 1 }),
  item('a', { parentId: 'one' }),
  item('b', { parentId: 'one' }),
  item('two', { isGroup: true, points: 0, maxSelections: 2 }),
  item('c', { parentId: 'two' }),
  item('d', { parentId: 'two' }),
  item('e', { parentId: 'two' }),
];

describe('buildRubricTree', () => {
  it('nests items under their groups in order', () => {
    const tree = buildRubricTree(items);
    assert.deepEqual(
      tree.map((node) => [node.item.id, node.children.map((child) => child.item.id)]),
      [
        ['correct', []],
        ['one', ['a', 'b']],
        ['two', ['c', 'd', 'e']],
      ],
    );
  });
});

describe('toggleRubricItem', () => {
  it('replaces the selection in a select-one group', () => {
    const selected = toggleRubricItem(items, new Set(['correct', 'a']), 'b', true);
    assert.sameMembers([...selected], ['correct', 'b']);
  });

  it('refuses selections past a group limit', () => {
    const before = new Set(['c', 'd']);
    assert.strictEqual(toggleRubricItem(items, before, 'e', true), before);
    assert.sameMembers([...toggleRubricItem(items, before, 'd', false)], ['c']);
  });
});

describe('describeSelectionRule', () => {
  it.each([
    [null, null, null],
    [1, 1, 'Select one'],
    [null, 1, 'Select up to one'],
    [2, null, 'Select at least 2'],
    [1, 3, 'Select 1–3'],
  ])('min %s, max %s', (minSelections, maxSelections, expected) => {
    assert.equal(describeSelectionRule({ minSelections, maxSelections }), expected);
  });
});
