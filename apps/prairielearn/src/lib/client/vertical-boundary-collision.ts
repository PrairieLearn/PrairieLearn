import type { CollisionDetection } from '@dnd-kit/core';

/**
 * Collision detection for vertical lists that uses item boundaries instead of
 * center distances. Unlike closestCenter, this works correctly for items of
 * different heights (e.g. a tall alt pool next to a short question row).
 */
export const verticalBoundaryCollision: CollisionDetection = (args) => {
  const { collisionRect, droppableContainers, droppableRects } = args;
  const centerY = collisionRect.top + collisionRect.height / 2;

  const items = droppableContainers
    .map((c) => {
      const rect = droppableRects.get(c.id);
      return rect ? { id: c.id, top: rect.top, bottom: rect.top + rect.height } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => a.top - b.top);

  if (items.length === 0) return [];

  // Use the midpoint between adjacent items as the boundary.
  for (let i = 0; i < items.length - 1; i++) {
    const boundary = (items[i].bottom + items[i + 1].top) / 2;
    if (centerY < boundary) {
      return [{ id: items[i].id }];
    }
  }

  return [{ id: items[items.length - 1].id }];
};
