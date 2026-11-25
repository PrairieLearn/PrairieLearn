import { run } from '@prairielearn/run';

import { RUBRIC_MAX_DEPTH } from '../lib/rubric-tree.js';

/**
 * Tree operations for the rubric editor. Rows are kept in depth-first
 * (pre-order) order with a depth on each row, matching what the server saves,
 * so every operation moves a row together with its descendants.
 */
export interface EditorTreeRow {
  depth: number;
  rubric_item: {
    is_group: boolean;
    points: number | null;
    min_selections: number | null;
    max_selections: number | null;
  };
}

/** Computes each row's depth from `parent_id`, for rows in depth-first order. */
export function depthsFromParents(rows: { id: string; parent_id: string | null }[]): number[] {
  const depthById = new Map<string, number>();
  return rows.map((row) => {
    const depth = row.parent_id == null ? 0 : (depthById.get(row.parent_id) ?? -1) + 1;
    depthById.set(row.id, depth);
    return depth;
  });
}

/** Index just past the last descendant of row `i`. */
export function subtreeEnd(rows: EditorTreeRow[], i: number): number {
  let end = i + 1;
  while (end < rows.length && rows[end].depth > rows[i].depth) end++;
  return end;
}

function nextSibling(rows: EditorTreeRow[], i: number): number | null {
  const end = subtreeEnd(rows, i);
  return end < rows.length && rows[end].depth === rows[i].depth ? end : null;
}

export function parentIndex(rows: EditorTreeRow[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].depth < rows[i].depth) return j;
  }
  return null;
}

/** Whether a group directly contains another group. */
export function hasSubgroup(rows: EditorTreeRow[], i: number): boolean {
  return rows
    .slice(i + 1, subtreeEnd(rows, i))
    .some((row) => row.depth === rows[i].depth + 1 && row.rubric_item.is_group);
}

function subtreeHeight(rows: EditorTreeRow[], i: number): number {
  const subtree = rows.slice(i, subtreeEnd(rows, i));
  return Math.max(...subtree.map((row) => row.depth)) - rows[i].depth;
}

function shiftDepth<T extends EditorTreeRow>(rows: T[], delta: number): T[] {
  return rows.map((row) => ({ ...row, depth: row.depth + delta }));
}

/**
 * How a row draws the tree's guide lines. `levels[L]` describes the line of
 * the group at depth `L` as it passes this row: `branch` connects this row to
 * that group, `end` does too but stops here because the row is the group's
 * last child, `pass` continues past the row to later children, and `none`
 * means the group has no more children.
 */
export type TreeGuide = 'branch' | 'end' | 'pass' | 'none';

export function treeGuides(rows: EditorTreeRow[]): TreeGuide[][] {
  const isLastChild = (i: number) => nextSibling(rows, i) == null;
  return rows.map((row, i) => {
    const levels: TreeGuide[] = [];
    let ancestor = i;
    for (let level = row.depth - 1; level >= 0; level--) {
      if (level === row.depth - 1) {
        levels[level] = isLastChild(i) ? 'end' : 'branch';
      } else {
        levels[level] = isLastChild(ancestor) ? 'none' : 'pass';
      }
      ancestor = parentIndex(rows, ancestor) ?? ancestor;
    }
    return levels;
  });
}

/** The direct children of row `i`, as `[start, end)` ranges that include their descendants. */
function childRanges(rows: EditorTreeRow[], i: number): [number, number][] {
  const ranges: [number, number][] = [];
  const end = subtreeEnd(rows, i);
  for (let child = i + 1; child < end; child = subtreeEnd(rows, child)) {
    ranges.push([child, subtreeEnd(rows, child)]);
  }
  return ranges;
}

/**
 * Orders a group's children by points, highest first or lowest first. Ties
 * keep their current order, and items without points yet go last.
 */
export function sortChildrenByPoints<T extends EditorTreeRow>(
  rows: T[],
  i: number,
  order: 'highest-first' | 'lowest-first',
): T[] {
  const sign = order === 'highest-first' ? -1 : 1;
  const children = childRanges(rows, i)
    .map(([start, end]) => rows.slice(start, end))
    .sort((a, b) => {
      const [pointsA, pointsB] = [a[0].rubric_item.points, b[0].rubric_item.points];
      if (pointsA == null || pointsB == null) {
        return (pointsA == null ? 1 : 0) - (pointsB == null ? 1 : 0);
      }
      return sign * (pointsA - pointsB);
    });
  return [...rows.slice(0, i + 1), ...children.flat(), ...rows.slice(subtreeEnd(rows, i))];
}

/** Whether a group's children are already ordered from highest to lowest points. */
export function isSortedHighestFirst(rows: EditorTreeRow[], i: number): boolean {
  const points = childRanges(rows, i).map(([start]) => rows[start].rubric_item.points ?? -Infinity);
  return points.every((value, index) => index === 0 || points[index - 1] >= value);
}

/**
 * Why a new subgroup can't be added to group `i`, or null if it can. A new
 * subgroup comes with an item inside it, so it needs two more levels.
 */
export function subgroupBlocker(rows: EditorTreeRow[], i: number): string | null {
  const { min_selections, max_selections } = rows[i].rubric_item;
  if (min_selections != null || max_selections != null) {
    return 'Groups with a selection rule can only contain items.';
  }
  if (rows[i].depth + 2 >= RUBRIC_MAX_DEPTH) {
    return `Groups can be nested at most ${RUBRIC_MAX_DEPTH} levels deep.`;
  }
  return null;
}

export function removeSubtree<T extends EditorTreeRow>(rows: T[], i: number): T[] {
  return [...rows.slice(0, i), ...rows.slice(subtreeEnd(rows, i))];
}

/**
 * The highest and lowest total that selecting items could add, taking group
 * selection rules into account. Unfinished point values count as 0.
 */
export function rubricPointRange(rows: EditorTreeRow[]): { max: number; min: number } {
  const range = (start: number, end: number, depth: number): { max: number; min: number } => {
    let max = 0;
    let min = 0;
    let i = start;
    while (i < end) {
      const row = rows[i];
      const rowEnd = subtreeEnd(rows, i);
      if (row.depth !== depth) {
        i = rowEnd;
        continue;
      }
      if (!row.rubric_item.is_group) {
        const points = row.rubric_item.points ?? 0;
        max += Math.max(points, 0);
        min += Math.min(points, 0);
      } else if (row.rubric_item.min_selections == null && row.rubric_item.max_selections == null) {
        const inner = range(i + 1, rowEnd, depth + 1);
        max += inner.max;
        min += inner.min;
      } else {
        const points = rows
          .slice(i + 1, rowEnd)
          .filter((child) => child.depth === depth + 1 && !child.rubric_item.is_group)
          .map((child) => child.rubric_item.points ?? 0);
        const required = Math.min(row.rubric_item.min_selections ?? 0, points.length);
        const allowed = Math.min(row.rubric_item.max_selections ?? points.length, points.length);
        const pick = (sorted: number[], keep: (points: number) => boolean) =>
          sorted.reduce(
            (sum, value, index) =>
              index < required || (index < allowed && keep(value)) ? sum + value : sum,
            0,
          );
        max += pick(
          [...points].sort((a, b) => b - a),
          (value) => value > 0,
        );
        min += pick(
          [...points].sort((a, b) => a - b),
          (value) => value < 0,
        );
      }
      i = rowEnd;
    }
    return { max, min };
  };
  return range(0, rows.length, 0);
}

/**
 * A problem with group `i` that the editor flags on its row, or null. Saving
 * is still allowed: graders see the same problem as an unmet rule.
 */
export function groupWarning(
  rows: EditorTreeRow[],
  i: number,
): { label: string; body: string } | null {
  const { is_group, min_selections, max_selections } = rows[i].rubric_item;
  if (!is_group) return null;
  const end = subtreeEnd(rows, i);
  if (end === i + 1) {
    return { label: 'Empty group', body: 'Add items to this group, or delete it.' };
  }
  if (min_selections != null && max_selections != null && min_selections > max_selections) {
    return {
      label: 'Invalid rule',
      body: `The minimum (${min_selections}) is more than the maximum (${max_selections}).`,
    };
  }
  const itemCount = rows
    .slice(i + 1, end)
    .filter((row) => row.depth === rows[i].depth + 1 && !row.rubric_item.is_group).length;
  if (min_selections != null && min_selections > itemCount) {
    return {
      label: 'Not enough items',
      body: `The rule asks for at least ${min_selections} selected, but the group has ${itemCount} item${itemCount === 1 ? '' : 's'}.`,
    };
  }
  return null;
}

/**
 * Where a dragged row lands, for drag and drop that can also move rows into
 * and out of groups. The row (with its contents) goes before or after the
 * visible row `overIdx`, following dnd-kit's sortable order, at the depth
 * closest to its own depth plus `depthOffset` that the rows around it allow.
 * Rows inside collapsed groups are hidden, so nothing is dropped into those.
 * Returns null if the row can't go there at any depth.
 */
export function projectDrop<T extends EditorTreeRow>(
  rows: T[],
  {
    activeIdx,
    overIdx,
    depthOffset,
    isCollapsed,
  }: {
    activeIdx: number;
    overIdx: number;
    depthOffset: number;
    isCollapsed: (i: number) => boolean;
  },
): { rows: T[]; depth: number } | null {
  const activeEnd = subtreeEnd(rows, activeIdx);
  if (overIdx > activeIdx && overIdx < activeEnd) return null;
  const moved = rows.slice(activeIdx, activeEnd);
  const rest = [...rows.slice(0, activeIdx), ...rows.slice(activeEnd)];
  const toRest = (i: number) => (i < activeIdx ? i : i - moved.length);
  const restCollapsed = (i: number) => isCollapsed(i < activeIdx ? i : i + moved.length);

  const insertAt = run(() => {
    if (overIdx === activeIdx) return activeIdx;
    const over = toRest(overIdx);
    if (overIdx < activeIdx) return over;
    return restCollapsed(over) ? subtreeEnd(rest, over) : over + 1;
  });

  // The visible rows just above and below the drop position.
  let prev: number | null = null;
  for (let i = insertAt - 1; i >= 0; i--) {
    const parent = parentIndex(rest, i);
    let hidden = false;
    for (let a = parent; a != null; a = parentIndex(rest, a)) {
      if (restCollapsed(a)) hidden = true;
    }
    if (!hidden) {
      prev = i;
      break;
    }
  }
  const next = insertAt < rest.length ? insertAt : null;
  const maxDepth =
    prev == null
      ? 0
      : rest[prev].depth + (rest[prev].rubric_item.is_group && !restCollapsed(prev) ? 1 : 0);
  const minDepth = next == null ? 0 : rest[next].depth;

  const activeRow = rows[activeIdx];
  const height = subtreeHeight(rows, activeIdx);
  const fits = (depth: number) => {
    if (depth + height >= RUBRIC_MAX_DEPTH) return false;
    if (!activeRow.rubric_item.is_group || depth === 0) return true;
    // A group can't go inside a group with a selection rule.
    let parent = insertAt - 1;
    while (rest[parent].depth >= depth) parent--;
    const { min_selections, max_selections } = rest[parent].rubric_item;
    return min_selections == null && max_selections == null;
  };
  const wanted = Math.min(Math.max(activeRow.depth + depthOffset, minDepth), maxDepth);
  const candidates = [
    ...Array.from({ length: wanted - minDepth + 1 }, (_, k) => wanted - k),
    ...Array.from({ length: maxDepth - wanted }, (_, k) => wanted + k + 1),
  ];
  const depth = candidates.find(fits);
  if (depth == null) return null;
  return {
    rows: [
      ...rest.slice(0, insertAt),
      ...shiftDepth(moved, depth - activeRow.depth),
      ...rest.slice(insertAt),
    ],
    depth,
  };
}
