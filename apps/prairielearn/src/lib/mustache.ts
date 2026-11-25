import mustache, { type OpeningAndClosingTags } from 'mustache';

import { parseMustacheTemplate } from './mustache-parse.js';

// We replace mustache.js's parser with an equivalent one that is roughly 30x
// faster and whose output is a small fraction of the size (see
// `mustache-parse.ts`). Overriding `parse()` also bypasses mustache.js's
// template cache, which keeps every template it has seen forever. Our templates
// are course content, so that cache grew without bound in production. Parsing
// is now cheap enough that caching isn't worth the memory.
//
// Rendering itself is still done by mustache.js, synchronously on the event
// loop. Course authors control both the template and the view (via
// `server.py`), and rendering cost is not linear in their size: nested sections
// over arrays multiply, every lookup walks the whole context stack, and lookups
// that resolve to built-in methods (e.g. `{{join}}` inside an array section)
// call those methods on the current view. We therefore charge each render for
// the work it does and stop it once it exceeds a fixed budget. The limits are
// far above what real templates need, and output is unchanged below them.

const MAX_SECTION_DEPTH = 100;
const MAX_WORK = 20_000_000;
const MAX_OUTPUT_LENGTH = 32 * 1024 * 1024;

export class MustacheRenderLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MustacheRenderLimitError';
  }
}

class RenderBudget {
  private work = 0;
  private outputLength = 0;
  private sectionDepth = 0;
  private readonly sizes = new WeakMap<object, number>();

  charge(units: number) {
    this.work += units;
    if (this.work > MAX_WORK) {
      throw new MustacheRenderLimitError(
        'Template rendering exceeded the work limit. Check for sections nested inside loops over large arrays.',
      );
    }
  }

  chargeOutput(length: number) {
    this.outputLength += length;
    if (this.outputLength > MAX_OUTPUT_LENGTH) {
      throw new MustacheRenderLimitError(
        `Template rendering exceeded the output limit of ${MAX_OUTPUT_LENGTH} characters.`,
      );
    }
    this.charge(1);
  }

  enterSection() {
    if (++this.sectionDepth > MAX_SECTION_DEPTH) {
      throw new MustacheRenderLimitError(
        `Template sections are nested more than ${MAX_SECTION_DEPTH} levels deep.`,
      );
    }
  }

  leaveSection() {
    this.sectionDepth--;
  }

  /**
   * An upper bound on the cost of calling a built-in method on `view`, which
   * may traverse it (e.g. `Array.prototype.join` stringifies nested arrays).
   */
  sizeOf(view: unknown): number {
    if (typeof view === 'string') return view.length + 1;
    if (!Array.isArray(view)) return 1;
    const cached = this.sizes.get(view);
    if (cached !== undefined) return cached;
    // Guard against cycles before recursing.
    this.sizes.set(view, 1);
    let size = view.length + 1;
    for (const item of view) size += this.sizeOf(item);
    this.sizes.set(view, size);
    return size;
  }
}

interface MustacheContextInternals {
  cache: Record<string, unknown>;
}

class BoundedContext extends mustache.Context {
  constructor(
    view: unknown,
    parent: BoundedContext | undefined,
    readonly budget: RenderBudget,
    private readonly depth: number,
  ) {
    super(view, parent);
  }

  override push(view: unknown): BoundedContext {
    return new BoundedContext(view, this, this.budget, this.depth + 1);
  }

  override lookup(name: string): unknown {
    const cache = (this as unknown as MustacheContextInternals).cache;
    // An uncached lookup may scan and split `name` once per context on the stack.
    this.budget.charge(
      Object.hasOwn(cache, name) ? 1 : (this.depth + 1) * (1 + Math.ceil(name.length / 2)),
    );
    const value = super.lookup(name);
    // mustache.js caches the value before calling it if it's a function. Views
    // come from JSON, so any function here is a built-in method like `join`.
    if (typeof cache[name] === 'function') {
      this.budget.charge(16 * this.budget.sizeOf(this.view));
    }
    return value;
  }
}

type RenderTokensArgs = Parameters<mustache.Writer['renderTokens']>;
type RenderSectionArgs = Parameters<mustache.Writer['renderSection']>;

class FastWriter extends mustache.Writer {
  override parse(template: string, tags?: OpeningAndClosingTags) {
    return parseMustacheTemplate(template, tags);
  }

  override render(...[template, view, ...rest]: Parameters<mustache.Writer['render']>) {
    // Nested renders (from higher-order sections) share the outer budget.
    const context =
      view instanceof BoundedContext
        ? view
        : new BoundedContext(view, undefined, new RenderBudget(), 0);
    return super.render(template, context, ...rest);
  }

  override renderTokens(...args: RenderTokensArgs) {
    const [tokens, context] = args;
    const budget = (context as BoundedContext).budget;
    budget.charge(1 + tokens.length);
    // Text tokens are always output, so count them up front.
    let textLength = 0;
    for (const token of tokens) if (token[0] === 'text') textLength += token[1].length;
    budget.chargeOutput(textLength);
    return super.renderTokens(...args);
  }

  override renderSection(...args: RenderSectionArgs) {
    const budget = (args[1] as BoundedContext).budget;
    budget.enterSection();
    try {
      return super.renderSection(...args);
    } finally {
      budget.leaveSection();
    }
  }

  override renderInverted(...args: RenderSectionArgs) {
    const budget = (args[1] as BoundedContext).budget;
    budget.enterSection();
    try {
      return super.renderInverted(...args);
    } finally {
      budget.leaveSection();
    }
  }

  override escapedValue(...args: Parameters<mustache.Writer['escapedValue']>) {
    const value = super.escapedValue(...args);
    if ((value as string | undefined) !== undefined) {
      (args[1] as BoundedContext).budget.chargeOutput(value.length);
    }
    return value;
  }

  override unescapedValue(...args: Parameters<mustache.Writer['unescapedValue']>) {
    // Despite its type, this returns the raw value (or `undefined`), which
    // `renderTokens` stringifies. Stringify it here instead so it's counted.
    const raw = super.unescapedValue(...args);
    const value = raw as unknown;
    if (value === undefined) return raw;
    const string = `${value as string}`;
    (args[1] as BoundedContext).budget.chargeOutput(string.length);
    return string;
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
