import type { GradingPanelRubricData } from '../components/InstanceQuestionGradingPanel.types.js';

export type GradingPanelRubricItem = GradingPanelRubricData['items'][number];

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
