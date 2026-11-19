import type { GradingPanelRubricData } from '../components/InstanceQuestionGradingPanel.types.js';

export type GradingPanelRubricItem = GradingPanelRubricData['items'][number];

export interface RubricTreeNode {
  item: GradingPanelRubricItem;
  children: RubricTreeNode[];
}

/**
 * Builds the rubric tree from items in depth-first order, which is the order
 * the server returns them in.
 */
export function buildRubricTree(items: GradingPanelRubricItem[]): RubricTreeNode[] {
  const nodes = new Map<string, RubricTreeNode>();
  const roots: RubricTreeNode[] = [];
  for (const item of items) {
    const node: RubricTreeNode = { item, children: [] };
    nodes.set(item.id, node);
    const parent = item.parentId == null ? undefined : nodes.get(item.parentId);
    (parent?.children ?? roots).push(node);
  }
  return roots;
}

export function leafItems(node: RubricTreeNode): GradingPanelRubricItem[] {
  if (!node.item.isGroup) return [node.item];
  return node.children.flatMap(leafItems);
}

/**
 * Describes a group's selection rule, e.g. "Select one" or "Select at least 2".
 * Returns null for groups without a rule.
 */
export function describeSelectionRule({
  minSelections,
  maxSelections,
}: {
  minSelections: number | null;
  maxSelections: number | null;
}): string | null {
  const min = minSelections ?? 0;
  const count = (n: number) => (n === 1 ? 'one' : `${n}`);
  if (maxSelections == null) return min > 0 ? `Select at least ${count(min)}` : null;
  if (min === maxSelections) return `Select ${count(min)}`;
  if (min === 0) return `Select up to ${count(maxSelections)}`;
  return `Select ${min}–${maxSelections}`;
}

/**
 * Selecting an item in a group that allows only one selection replaces the
 * group's current selection, like a radio button that can still be cleared.
 * Groups that allow more than one selection refuse selections past the limit.
 */
export function toggleRubricItem(
  items: GradingPanelRubricItem[],
  selectedIds: Set<string>,
  id: string,
  selected: boolean,
): Set<string> {
  const next = new Set(selectedIds);
  if (!selected) {
    next.delete(id);
    return next;
  }

  const item = items.find((candidate) => candidate.id === id);
  const parent = items.find((candidate) => candidate.id === item?.parentId);
  if (parent?.maxSelections != null) {
    const siblingIds = items
      .filter((candidate) => candidate.parentId === parent.id && candidate.id !== id)
      .map((candidate) => candidate.id);
    if (parent.maxSelections === 1) {
      for (const siblingId of siblingIds) next.delete(siblingId);
    } else if (
      siblingIds.filter((siblingId) => next.has(siblingId)).length >= parent.maxSelections
    ) {
      return selectedIds;
    }
  }
  next.add(id);
  return next;
}
