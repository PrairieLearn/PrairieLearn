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

function previousSibling(rows: EditorTreeRow[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].depth === rows[i].depth) return j;
    if (rows[j].depth < rows[i].depth) return null;
  }
  return null;
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

/** A row can be indented into the group directly above it, if depth allows. */
export function canIndent(rows: EditorTreeRow[], i: number): boolean {
  const sibling = previousSibling(rows, i);
  return (
    sibling != null &&
    rows[sibling].rubric_item.is_group &&
    rows[i].depth + subtreeHeight(rows, i) + 1 < RUBRIC_MAX_DEPTH
  );
}

/** Moves a row into the group directly above it, as that group's last child. */
export function indent<T extends EditorTreeRow>(rows: T[], i: number): T[] {
  if (!canIndent(rows, i)) return rows;
  const end = subtreeEnd(rows, i);
  return [...rows.slice(0, i), ...shiftDepth(rows.slice(i, end), 1), ...rows.slice(end)];
}

/** Moves a row out of its group, placing it right after that group. */
export function outdent<T extends EditorTreeRow>(rows: T[], i: number): T[] {
  const parent = parentIndex(rows, i);
  if (parent == null) return rows;
  const end = subtreeEnd(rows, i);
  const moved = shiftDepth(rows.slice(i, end), -1);
  const rest = [...rows.slice(0, i), ...rows.slice(end)];
  const insertAt = subtreeEnd(rest, parent);
  return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
}

/** Swaps a row (and its descendants) with its previous or next sibling. */
export function moveAmongSiblings<T extends EditorTreeRow>(
  rows: T[],
  i: number,
  direction: -1 | 1,
): T[] {
  const sibling = direction === -1 ? previousSibling(rows, i) : nextSibling(rows, i);
  if (sibling == null) return rows;
  const [first, second] = direction === -1 ? [sibling, i] : [i, sibling];
  const secondEnd = subtreeEnd(rows, second);
  return [
    ...rows.slice(0, first),
    ...rows.slice(second, secondEnd),
    ...rows.slice(first, second),
    ...rows.slice(secondEnd),
  ];
}

/**
 * Moves row `from` to the position of its sibling `to`, for drag and drop.
 * Returns null if the rows are not siblings.
 */
export function moveToSibling<T extends EditorTreeRow>(
  rows: T[],
  from: number,
  to: number,
): { rows: T[]; index: number } | null {
  if (from === to || parentIndex(rows, from) !== parentIndex(rows, to)) return null;
  if (rows[from].depth !== rows[to].depth) return null;
  const end = subtreeEnd(rows, from);
  const moved = rows.slice(from, end);
  const rest = [...rows.slice(0, from), ...rows.slice(end)];
  const target = to < from ? to : to - moved.length;
  const insertAt = to < from ? target : subtreeEnd(rest, target);
  return {
    rows: [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)],
    index: insertAt,
  };
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
