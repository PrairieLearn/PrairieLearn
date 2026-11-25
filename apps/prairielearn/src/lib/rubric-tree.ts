/**
 * Helpers for hierarchical rubrics (#6861).
 *
 * A rubric is stored as a flat list of rows in depth-first (pre-order) order:
 * each group is immediately followed by its descendants. Each row carries its
 * depth (0 for top-level rows), so the tree can be recovered with one pass over
 * the list and a stack of open groups. Only leaves (non-group rows) can be
 * selected while grading; groups are headings with optional selection rules.
 */

/** Maximum number of nesting levels, counting the top level. */
export const RUBRIC_MAX_DEPTH = 3;

export interface RubricTreeNodeInput {
  /** 0 for top-level rows; a child's depth is its parent's depth + 1. */
  depth?: number | null;
  is_group?: boolean | null;
  points?: number | null;
  min_selections?: number | null;
  max_selections?: number | null;
}

export interface ResolvedRubricTree {
  /** For each row, the index of its parent group, or `null` at the top level. */
  parentIndex: (number | null)[];
  /**
   * For each row, its position among leaves (0-based), or `null` for groups.
   * For a rubric without groups this equals the row index, so leaf numbering
   * (key bindings, AI prompt numbers) is unchanged for flat rubrics.
   */
  leafIndex: (number | null)[];
  /** Number of direct children of each row (always 0 for leaves). */
  childCount: number[];
  leafCount: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Validates a pre-order list of rubric rows and recovers the tree structure.
 * Throws an `Error` with a user-facing message if the list does not describe
 * a valid rubric tree.
 *
 * Because parents are referenced by position (depth) rather than by ID, the
 * input cannot express cycles or a child whose parent is missing.
 */
export function resolveRubricTree(rows: RubricTreeNodeInput[]): ResolvedRubricTree {
  const parentIndex: (number | null)[] = [];
  const leafIndex: (number | null)[] = [];
  const childCount: number[] = rows.map(() => 0);
  const hasSubgroup: boolean[] = rows.map(() => false);
  /** Indices of the groups that are open at the current position. */
  const stack: number[] = [];
  let leafCount = 0;

  rows.forEach((row, i) => {
    const depth = row.depth ?? 0;
    if (!isNonNegativeInteger(depth)) {
      throw new Error('Rubric item depth must be a non-negative integer.');
    }
    if (depth >= RUBRIC_MAX_DEPTH) {
      throw new Error(`Rubric groups can be nested at most ${RUBRIC_MAX_DEPTH} levels deep.`);
    }

    // Close any groups that this row is not inside of.
    while (stack.length > depth) stack.pop();
    if (stack.length < depth) {
      throw new Error(
        'Rubric item is indented under something that is not a group. Only groups can contain items.',
      );
    }

    const parent = stack.at(-1) ?? null;
    parentIndex.push(parent);
    if (parent != null) childCount[parent]++;

    if (row.is_group) {
      if (parent != null) hasSubgroup[parent] = true;
      if (row.points != null && row.points !== 0) {
        throw new Error('Rubric groups cannot have points. Put points on the items inside.');
      }
      leafIndex.push(null);
      stack.push(i);
    } else {
      if (row.min_selections != null || row.max_selections != null) {
        throw new Error('Selection rules can only be set on rubric groups.');
      }
      leafIndex.push(leafCount++);
    }
  });

  // Selection rules depend on each group's children, so check them in a second
  // pass once the whole list has been walked. Both passes are O(n).
  rows.forEach((row, i) => {
    if (!row.is_group) return;
    const { min_selections: min, max_selections: max } = row;
    if (min == null && max == null) return;

    if (min != null && !isNonNegativeInteger(min)) {
      throw new Error("A group's minimum selections must be a non-negative integer.");
    }
    if (max != null && !(isNonNegativeInteger(max) && max >= 1)) {
      throw new Error("A group's maximum selections must be a positive integer.");
    }
    if (min != null && max != null && min > max) {
      throw new Error("A group's minimum selections cannot be more than its maximum.");
    }
    if (hasSubgroup[i]) {
      throw new Error(
        'Selection rules can only be set on groups that directly contain items, not other groups.',
      );
    }
    if (min != null && min > childCount[i]) {
      throw new Error(
        'A group requires more selections than it has items, so it could never be satisfied.',
      );
    }
  });

  return { parentIndex, leafIndex, childCount, leafCount };
}

export interface RubricTreeNode<T> {
  item: T;
  isGroup: boolean;
  children: RubricTreeNode<T>[];
}

/**
 * Builds the rubric tree from rows in depth-first order, which is the order
 * the server returns them in. Rows come from different sources (database rows,
 * grading panel props), so callers say how to read each row's ID, parent and kind.
 */
export function buildRubricTree<T>(
  items: T[],
  {
    id,
    parentId,
    isGroup,
  }: {
    id: (item: T) => string;
    parentId: (item: T) => string | null;
    isGroup: (item: T) => boolean;
  },
): RubricTreeNode<T>[] {
  const nodes = new Map<string, RubricTreeNode<T>>();
  const roots: RubricTreeNode<T>[] = [];
  for (const item of items) {
    const node: RubricTreeNode<T> = { item, isGroup: isGroup(item), children: [] };
    nodes.set(id(item), node);
    const parentKey = parentId(item);
    const parent = parentKey == null ? undefined : nodes.get(parentKey);
    (parent?.children ?? roots).push(node);
  }
  return roots;
}

/** The selectable items under a node, or the node itself if it is an item. */
export function leafItems<T>(node: RubricTreeNode<T>): T[] {
  if (!node.isGroup) return [node.item];
  return node.children.flatMap(leafItems);
}

/**
 * Describes a group's selection rule, e.g. "Select one" or "Select at least 2".
 * Returns null for groups without a rule.
 */
export function describeSelectionRule(
  minSelections: number | null,
  maxSelections: number | null,
): string | null {
  const min = minSelections ?? 0;
  const count = (n: number) => (n === 1 ? 'one' : `${n}`);
  if (maxSelections == null) return min > 0 ? `Select at least ${count(min)}` : null;
  if (min === maxSelections) return `Select ${count(min)}`;
  if (min === 0) return `Select up to ${count(maxSelections)}`;
  return `Select ${min}–${maxSelections}`;
}
