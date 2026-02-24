/**
 * Returns a boolean indicating that the comment is not null or empty and should be rendered.
 *
 * @param comment - the comment being assessed
 */
export function isRenderableComment(
  comment: string | string[] | Record<string, any> | null | undefined,
) {
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
