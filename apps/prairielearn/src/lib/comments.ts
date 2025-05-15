export function isRenderableComment(comment) {
  if (
    !comment ||
    (typeof comment === 'string' && comment.trim() === '') ||
    (Array.isArray(comment) && comment.length === 0) ||
    (typeof comment === 'object' && Object.keys(comment).length === 0)
  ) {
    return false;
  }
  return true;
}
