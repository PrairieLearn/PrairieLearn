import mustache from 'mustache';

/**
 * Render a Mustache template, returning the original template plus an
 * error message instead of throwing on syntax errors. Use this when
 * rendering user-authored templates (e.g. rubric item fields) where an
 * author's syntax error should not crash the surrounding render path
 * (page render, AI grading batch, etc.).
 *
 * @returns An object with `rendered` (the rendered template, or the original
 * template on error) and `error` (the error message if rendering failed,
 * otherwise undefined).
 */
export function safeMustacheRender(
  template: string,
  params: Record<string, unknown>,
): { rendered: string; error?: string } {
  try {
    return { rendered: mustache.render(template, params) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { rendered: template, error: message };
  }
}
