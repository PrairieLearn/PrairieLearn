import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import type { ModelOperations as ModelOperationsType } from '@vscode/vscode-languagedetection';
import * as cheerio from 'cheerio';
import { type AnyNode, type Element, isTag, isText } from 'domhandler';

import { normalizeImsFilePath } from './ims-file-path.js';

// The package ships as a UMD CJS bundle; named ESM imports don't work.
const _require = createRequire(import.meta.url);
const { ModelOperations } = _require('@vscode/vscode-languagedetection') as {
  ModelOperations: typeof ModelOperationsType;
};

/**
 * Mustache URL prefix recommended by PrairieLearn for referencing files in `clientFilesQuestion/`.
 * See https://docs.prairielearn.com/clientServerFiles/.
 */
const CLIENT_FILES_QUESTION_URL = '{{ options.client_files_question_url }}';

const DATA_URI_SRC_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([^"']+)$/;

export function loadHtmlFragment(html: string): cheerio.CheerioAPI {
  // QTI prompt snippets are fragments, not full documents. The `false` keeps Cheerio from
  // inventing `<html><body>` wrappers that would leak into generated question.html files.
  return cheerio.load(html, null, false);
}

function isElementNamed(node: AnyNode, name: string): node is Element {
  return isTag(node) && node.name.toLowerCase() === name;
}

export function isWhitespaceText(node: AnyNode): boolean {
  return isText(node) && node.data.trim() === '';
}

/**
 * Extract inline base64 data URI images from HTML, replacing them with references to the
 * question's clientFilesQuestion URL via the Mustache prefix.
 *
 * Returns the rewritten HTML and a map of filename → Buffer.
 */
export function extractInlineImages(html: string): {
  html: string;
  files: Map<string, Buffer>;
} {
  const $ = loadHtmlFragment(html);
  const files = new Map<string, Buffer>();
  let changed = false;

  $('[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;

    // At this point Cheerio has already found the attribute for us; the regex is only checking
    // whether the attribute value is a data URI and pulling out the MIME/data pieces.
    const match = DATA_URI_SRC_RE.exec(src);
    if (!match) return;

    const [, mime, data] = match;
    const ext = mime.split('/')[1].replace('+xml', '');
    const imgBytes = Buffer.from(data, 'base64');
    const digest = crypto.createHash('sha256').update(imgBytes).digest('hex').slice(0, 16);
    const filename = `inline-${digest}.${ext}`;
    files.set(filename, imgBytes);
    $(el).attr('src', `${CLIENT_FILES_QUESTION_URL}/${filename}`);
    changed = true;
  });

  return { html: changed ? $.html() : html, files };
}

const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|:\/\/)/i;

/**
 * Rewrite local <img> tags in HTML to <pl-figure> elements.
 *
 * For images pointing into the question's clientFilesQuestion directory via the
 * Mustache prefix, the directory attribute is set explicitly and the prefix is
 * stripped from file-name. Other relative paths are passed through as file-name
 * without a directory attribute. Images with absolute URLs (http://, https://,
 * protocol-relative, data:, etc.) are left as <img> since pl-figure resolves
 * file-name against a local course directory and cannot host remote resources.
 * The alt and width attributes are preserved; all others (style, class, etc.)
 * are dropped since pl-figure handles its own layout.
 */
export function rewriteImagesAsPlFigure(html: string): string {
  const $ = loadHtmlFragment(html);
  const mustachePrefix = `${CLIENT_FILES_QUESTION_URL}/`;
  let changed = false;

  $('img').each((_, img) => {
    const $img = $(img);
    const src = $img.attr('src') ?? '';
    // Remote images stay as `<img>` because `<pl-figure>` resolves `file-name` locally inside
    // the course, which would turn an external URL into a broken course-file lookup.
    if (ABSOLUTE_URL_RE.test(src)) return;

    const $figure = $('<pl-figure></pl-figure>');

    if (src.startsWith(mustachePrefix)) {
      $figure.attr('file-name', src.slice(mustachePrefix.length));
      $figure.attr('directory', 'clientFilesQuestion');
    } else {
      $figure.attr('file-name', src);
    }

    const alt = $img.attr('alt');
    const width = $img.attr('width');
    if (alt) $figure.attr('alt', alt);
    if (width) $figure.attr('width', width);

    $img.replaceWith($figure);
    changed = true;
  });

  return changed ? $.html() : html;
}

const IMS_CC_FILEBASE_RE = /\$IMS-CC-FILEBASE\$\/([^"'\s]+)/g;

interface ResolveImsFileRefsResult {
  /** Rewritten HTML with IMS file references changed to PrairieLearn clientFilesQuestion URLs. */
  html: string;
  /**
   * Files to copy into clientFilesQuestion, keyed by generated filename.
   * Values are decoded source paths from the QTI export, relative to the export's web_resources
   * directory.
   */
  fileRefs: Map<string, string>;
  /**
   * Decoded source paths that matched an excluded extension and were intentionally omitted from
   * `fileRefs`.
   */
  skippedFiles: string[];
}

/**
 * Resolve $IMS-CC-FILEBASE$ references in HTML for PrairieLearn output.
 *
 * Rewrites `src="$IMS-CC-FILEBASE$/path/img.png"` to
 * `src="{{ options.client_files_question_url }}/img.png"` — the PrairieLearn-recommended
 * Mustache URL pattern for files in the question's clientFilesQuestion directory.
 *
 * When `excludeExtensions` is provided, a tag that references a file with an excluded
 * extension is emitted inside a TODO comment in the same pass (URLs still rewritten so
 * the path is readable), and the file is omitted from `fileRefs`.
 */
export function resolveImsFileRefs(
  html: string,
  excludeExtensions?: Set<string>,
): ResolveImsFileRefsResult {
  const $ = loadHtmlFragment(html);
  // Dedup index over all references (including excluded ones) so two files with the same basename
  // resolve to the same generated filename whether or not they're skipped.
  const pathByFilename = new Map<string, string>();
  const skippedSourcePaths = new Set<string>();
  const excludedElements = new Set<Element>();
  let changed = false;

  function rewriteUrl(rawPath: string): { filename: string; excluded: boolean } {
    const decodedPath = normalizeImsFilePath(rawPath);
    const base = decodedPath.split('/').pop() ?? decodedPath;
    const dot = base.lastIndexOf('.');
    const stem = dot !== -1 ? base.slice(0, dot) : base;
    const ext = dot !== -1 ? base.slice(dot) : '';
    let filename = base;
    let suffix = 1;
    while (pathByFilename.has(filename) && pathByFilename.get(filename) !== decodedPath) {
      filename = `${stem}-${suffix}${ext}`;
      suffix += 1;
    }
    pathByFilename.set(filename, decodedPath);
    const excluded = excludeExtensions?.has(ext.toLowerCase()) ?? false;
    if (excluded) skippedSourcePaths.add(decodedPath);
    return { filename, excluded };
  }

  function rewriteImsRefs(value: string): { value: string; excluded: boolean } {
    let excluded = false;
    // The HTML has already been parsed; this regex is intentionally limited to the IMS token
    // inside an attribute/text value, where we still need to preserve surrounding text.
    const rewritten = value.replaceAll(IMS_CC_FILEBASE_RE, (_match, rawPath: string) => {
      changed = true;
      const result = rewriteUrl(rawPath);
      if (result.excluded) excluded = true;
      return `${CLIENT_FILES_QUESTION_URL}/${result.filename}`;
    });
    return { value: rewritten, excluded };
  }

  $('*').each((_, el) => {
    if (!isTag(el)) return;

    for (const [name, value] of Object.entries(el.attribs)) {
      if (!value.includes('$IMS-CC-FILEBASE$/')) continue;

      const { value: rewritten, excluded } = rewriteImsRefs(value);
      el.attribs[name] = rewritten;
      if (excluded) excludedElements.add(el);
    }
  });

  function rewriteTextNodes(nodes: AnyNode[]): void {
    for (const node of nodes) {
      if (isText(node) && node.data.includes('$IMS-CC-FILEBASE$/')) {
        const { value } = rewriteImsRefs(node.data);
        node.data = value;
      }
      if ('children' in node) {
        rewriteTextNodes(node.children);
      }
    }
  }

  rewriteTextNodes($.root().contents().toArray());

  // If both a container and a child reference excluded files, wrap only the container. Nested
  // HTML comments are invalid and would make the "uncomment to restore" instruction misleading.
  const excludedElementsToWrap = [...excludedElements].filter(
    (el) => !hasExcludedParent($, el, excludedElements),
  );

  for (const el of excludedElementsToWrap) {
    const rewritten = $.html(el);
    $(el).replaceWith(
      `<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n${rewritten}\n-->`,
    );
  }

  const fileRefs = new Map<string, string>();
  for (const [filename, path] of pathByFilename) {
    if (!skippedSourcePaths.has(path)) fileRefs.set(filename, path);
  }

  return {
    html: changed ? $.html() : html,
    fileRefs,
    skippedFiles: [...skippedSourcePaths],
  };
}

function hasExcludedParent(
  $: cheerio.CheerioAPI,
  el: Element,
  excludedElements: Set<Element>,
): boolean {
  for (const parent of $(el).parents()) {
    if (excludedElements.has(parent)) return true;
  }
  return false;
}

const ITEMIZE_BLOCK_RE = /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g;
const ITEM_TOKEN_RE = /\\item(?:\[[^\]]*\])?/g;

/**
 * Convert LaTeX \begin{itemize}...\end{itemize} environments embedded in HTML
 * to PrairieLearn <markdown> bullet lists.
 *
 * Canvas sometimes exports questions with raw LaTeX itemize environments in the
 * prompt HTML. PrairieLearn renders <markdown> blocks via its markdown element.
 */
export function convertLatexItemizeToMarkdown(html: string): string {
  // This is deliberately still regex-based: Canvas leaves these as literal LaTeX text inside
  // the HTML fragment, so there are no HTML nodes for Cheerio to walk here.
  return html.replaceAll(ITEMIZE_BLOCK_RE, (_match, body: string) => {
    // Find all \item tokens and extract text between them
    const itemTokens: RegExpExecArray[] = [];
    ITEM_TOKEN_RE.lastIndex = 0;
    let token: RegExpExecArray | null;
    while ((token = ITEM_TOKEN_RE.exec(body)) !== null) {
      itemTokens.push(token);
    }

    if (itemTokens.length === 0) {
      return '<markdown>\n</markdown>';
    }

    const lines: string[] = [];
    for (let i = 0; i < itemTokens.length; i++) {
      const start = itemTokens[i].index + itemTokens[i][0].length;
      const end = i + 1 < itemTokens.length ? itemTokens[i + 1].index : body.length;
      const itemText = body.slice(start, end).trim().replaceAll(/\s+/g, ' ');
      if (itemText) {
        lines.push(`- ${itemText}`);
      }
    }

    if (lines.length === 0) {
      return '<markdown>\n</markdown>';
    }

    return `<markdown>\n${lines.join('\n')}\n</markdown>`;
  });
}

const LANGUAGE_CLASS_RE = /(?:language|lang)-(\w+)|brush:\s*(\w+)/i;

/** Minimum confidence score (0–1) required to accept a language prediction. */
const LANGUAGE_DETECTION_CONFIDENCE_THRESHOLD = 0.2;

let _modelOps: ModelOperationsType | undefined;

function getModelOps(): ModelOperationsType {
  if (!_modelOps) _modelOps = new ModelOperations();
  return _modelOps;
}

/**
 * Detect the programming language of a code snippet using a ML model.
 * Falls back to simple heuristics when the model isn't confident enough.
 * Returns `undefined` only if neither approach produces a result.
 */
async function detectCodeLanguage(code: string): Promise<string | undefined> {
  const results = await getModelOps().runModel(code);
  const best = results[0];
  if (best && best.confidence >= LANGUAGE_DETECTION_CONFIDENCE_THRESHOLD) {
    return best.languageId;
  }
  return guessLanguageHeuristic(code);
}

/**
 * Rule-based language guess for when the ML model isn't confident.
 * Checks for unambiguous keywords/patterns before falling back to "java" for
 * any generic code snippet (braces + semicolons + control flow).
 */
function guessLanguageHeuristic(code: string): string | undefined {
  if (/^\s*(def |class \w+:|import \w|from \w+ import|print\()/m.test(code)) return 'python';
  if (/\b(System\.out|public\s+class|@Override)\b/.test(code)) return 'java';
  if (/\b(console\.|=>|const |let |var |require\(|module\.exports)\b/.test(code)) {
    return 'javascript';
  }
  if (/\b(fn |let mut |impl |use std::|println!)\b/.test(code)) return 'rust';
  if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(code) && !/[{}]/.test(code)) {
    return 'sql';
  }
  // Generic style: control flow + braces + semicolons
  // We use Java because most of the syntax is a superset - remember this is a best-guess result.
  if (/[{};]/.test(code) && /\b(for|while|if|else|return)\b/.test(code)) return 'java';
  return undefined;
}

function extractLanguageFromClass(classStr: string): string | undefined {
  const m = LANGUAGE_CLASS_RE.exec(classStr);
  if (m) return m[1] ?? m[2];
  return undefined;
}

/**
 * Rewrite all `<pre>` blocks in HTML to `<pl-code>` elements.
 *
 * Language detection order:
 *   1. `class="language-X"` / `class="lang-X"` / `class="brush: X"` on the
 *      `<pre>` tag itself.
 *   2. The same patterns on an inner `<code>` tag (e.g. `<pre><code class="language-X">`).
 *   3. `detectCodeLanguage` as the content-based fallback.
 *
 * If a language is found, it is emitted as `<pl-code language="X">`. When a
 * `<code>` wrapper is present inside `<pre>`, it is stripped — `<pl-code>`
 * handles its own semantics.
 */
export async function rewritePreAsPlCode(html: string): Promise<string> {
  const $ = loadHtmlFragment(html);
  const preElements = $('pre').toArray();
  if (preElements.length === 0) return html;

  const replacements = await Promise.all(
    preElements.map(async (pre) => {
      const codeElement = getOnlyElementChild($, pre, 'code');

      let language = extractLanguageFromClass($(pre).attr('class') ?? '');
      if (!language && codeElement) {
        language = extractLanguageFromClass($(codeElement).attr('class') ?? '');
      }

      const plainCode = getPlainCodeText($, codeElement ?? pre);
      if (!language) {
        language = await detectCodeLanguage(plainCode);
      }

      const langAttr = language ? ` language="${language}"` : '';
      // Use Cheerio's .text() so the serializer entity-encodes characters like < and &,
      // keeping code such as `#include <stdio.h>` valid inside HTML as `#include &lt;stdio.h&gt;`.
      const $plCode = $(`<pl-code${langAttr}></pl-code>`);
      $plCode.text('\n' + plainCode);
      return { pre, $plCode };
    }),
  );

  for (const { pre, $plCode } of replacements) {
    $(pre).replaceWith($plCode);
  }

  removeEmptyParagraphs($);
  unwrapParagraphsContainingOnlyPlCode($);

  return $.html();
}

function getOnlyElementChild(
  $: cheerio.CheerioAPI,
  element: Element,
  tagName: string,
): Element | undefined {
  const meaningfulChildren = $(element)
    .contents()
    .toArray()
    .filter((node) => !isWhitespaceText(node));
  if (meaningfulChildren.length !== 1) return undefined;

  const [child] = meaningfulChildren;
  return isElementNamed(child, tagName) ? child : undefined;
}

function getPlainCodeText($: cheerio.CheerioAPI, element: Element): string {
  const $code = $(element).clone();
  $code.find('br').replaceWith('\n');
  return $code.text();
}

function removeEmptyParagraphs($: cheerio.CheerioAPI): void {
  $('p').each((_, p) => {
    if (Object.keys(p.attribs).length > 0) return;
    if ($(p).text().trim() !== '') return;
    if ($(p).children().length > 0) return;
    // Browsers do not allow `<pre>` inside `<p>`, so parsing `<p><pre>...</pre></p>` leaves
    // behind empty paragraph nodes. Drop only those parser artifacts.
    $(p).remove();
  });
}

function unwrapParagraphsContainingOnlyPlCode($: cheerio.CheerioAPI): void {
  $('p').each((_, p) => {
    const meaningfulChildren = $(p)
      .contents()
      .toArray()
      .filter((node) => !isWhitespaceText(node));
    if (meaningfulChildren.length !== 1) return;

    const [child] = meaningfulChildren;
    if (!isElementNamed(child, 'pl-code')) return;

    $(p).replaceWith(child);
  });
}

/**
 * Clean up question HTML for PrairieLearn output.
 * Strips a single wrapping <div> tag that Canvas often adds, and removes
 * answer blocks that Canvas can embed in the prompt HTML.
 */
export function cleanQuestionHtml(html: string): string {
  const $ = loadHtmlFragment(html.trim());

  $('div.answers').each((_, el) => {
    if ($(el).find('div.answers_wrapper').length > 0) {
      $(el).remove();
    }
  });

  const topLevelNodes = $.root()
    .contents()
    .toArray()
    .filter((node) => !isWhitespaceText(node));
  if (topLevelNodes.length === 1 && isElementNamed(topLevelNodes[0], 'div')) {
    // Canvas often wraps the whole prompt in one styling div. Only unwrap when that div is the
    // entire fragment so sibling divs stay semantically intact.
    return ($(topLevelNodes[0]).html() ?? '').trim();
  }

  return $.html().trim();
}
