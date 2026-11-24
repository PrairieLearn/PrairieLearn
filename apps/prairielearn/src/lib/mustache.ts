import mustache, { type OpeningAndClosingTags } from 'mustache';

import { parseMustacheTemplate } from './mustache-parse.js';

// We replace mustache.js's parser with an equivalent one that is roughly 30x
// faster and whose output is a small fraction of the size (see
// `mustache-parse.ts`). Overriding `parse()` also bypasses mustache.js's
// template cache, which keeps every template it has seen forever. Our templates
// are course content, so that cache grew without bound in production. Parsing
// is now cheap enough that caching isn't worth the memory.
class FastWriter extends mustache.Writer {
  override parse(template: string, tags?: OpeningAndClosingTags) {
    return parseMustacheTemplate(template, tags);
  }
}
const writer = new FastWriter();

/**
 * Render a Mustache template. Use this instead of `mustache.render()`.
 */
export function renderMustache(template: string, view: unknown): string {
  // `Writer.render()` doesn't check this, unlike `mustache.render()`.
  if (typeof template !== 'string') {
    throw new TypeError(
      `Invalid template! Template should be a "string" but "${Array.isArray(template) ? 'array' : typeof template}" was given as the first argument for mustache#render(template, view, partials)`,
    );
  }
  return writer.render(template, view);
}

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
    return { rendered: renderMustache(template, params) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { rendered: template, error: message };
  }
}
