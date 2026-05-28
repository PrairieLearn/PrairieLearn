import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import type { ModelOperations as ModelOperationsType } from '@vscode/vscode-languagedetection';
import he from 'he';

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

const DATA_URI_RE = /src=(["'])data:(?<mime>image\/[a-zA-Z0-9.+-]+);base64,(?<data>[^"']+)\1/g;

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
  const files = new Map<string, Buffer>();

  const rewritten = html.replaceAll(DATA_URI_RE, (_match, quote, mime, data) => {
    const ext = mime.split('/')[1].replace('+xml', '');
    const imgBytes = Buffer.from(data, 'base64');
    const digest = crypto.createHash('sha256').update(imgBytes).digest('hex').slice(0, 16);
    const filename = `inline-${digest}.${ext}`;
    files.set(filename, imgBytes);
    return `src=${quote}${CLIENT_FILES_QUESTION_URL}/${filename}${quote}`;
  });

  return { html: rewritten, files };
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const ATTR_RE = /(\w[\w-]*)=(["'])(.*?)\2/gi;
const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

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
  const mustachePrefix = `${CLIENT_FILES_QUESTION_URL}/`;
  return html.replaceAll(IMG_TAG_RE, (tag) => {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(ATTR_RE)) {
      attrs[m[1].toLowerCase()] = he.decode(m[3]);
    }

    const src = attrs['src'] ?? '';
    if (ABSOLUTE_URL_RE.test(src)) return tag;

    const parts: string[] = [];

    if (src.startsWith(mustachePrefix)) {
      parts.push(
        `file-name="${he.escape(src.slice(mustachePrefix.length))}"`,
        'directory="clientFilesQuestion"',
      );
    } else {
      parts.push(`file-name="${he.escape(src)}"`);
    }

    if (attrs['alt']) parts.push(`alt="${he.escape(attrs['alt'])}"`);
    if (attrs['width']) parts.push(`width="${he.escape(attrs['width'])}"`);

    return `<pl-figure ${parts.join(' ')}></pl-figure>`;
  });
}

const IMS_CC_FILEBASE_RE = /\$IMS-CC-FILEBASE\$\/([^"'\s]+)/g;

// Tag-aware matcher so a tag referencing an excluded file can be wrapped as a whole.
// Alternations: open+close tag pair | self-closing/void tag | bare URL fallback.
const IMS_REF_OR_TAG_RE =
  /<(\w[\w-]*)\b[^>]*\$IMS-CC-FILEBASE\$[^>]*>[\s\S]*?<\/\1>|<\w[\w-]*\b[^>]*\$IMS-CC-FILEBASE\$[^>]*\/?>|\$IMS-CC-FILEBASE\$\/[^"'\s]+/gi;

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
  // Dedup index over all references (including excluded ones) so two files with the same basename
  // resolve to the same generated filename whether or not they're skipped.
  const pathByFilename = new Map<string, string>();
  const skippedSourcePaths = new Set<string>();

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

  function processMatch(match: string, _name: string, offset: number, full: string): string {
    // Bare URL fallback (no enclosing tag): rewrite in place.
    if (!match.startsWith('<')) {
      const rawPath = match.slice('$IMS-CC-FILEBASE$/'.length);
      return `${CLIENT_FILES_QUESTION_URL}/${he.escape(rewriteUrl(rawPath).filename)}`;
    }
    // Tag match. Only treat the open tag's own attributes as triggering the wrap — refs in the
    // body belong to nested tags and will get their own decision via recursion.
    const closeBracket = match.indexOf('>') + 1;
    const openTag = match.slice(0, closeBracket);
    const tail = match.slice(closeBracket);
    let openExcluded = false;
    const openRewritten = openTag.replaceAll(IMS_CC_FILEBASE_RE, (_, rawPath: string) => {
      const { filename, excluded } = rewriteUrl(rawPath);
      if (excluded) openExcluded = true;
      return `${CLIENT_FILES_QUESTION_URL}/${he.escape(filename)}`;
    });
    const tailRewritten = tail.replaceAll(IMS_REF_OR_TAG_RE, processMatch);
    const rewritten = openRewritten + tailRewritten;
    if (!openExcluded) return rewritten;
    // Don't nest comments if the tag is already inside one.
    const before = full.slice(0, offset);
    if (before.lastIndexOf('<!--') > before.lastIndexOf('-->')) return rewritten;
    return `<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n${rewritten}\n-->`;
  }

  const rewrittenHtml = html.replaceAll(IMS_REF_OR_TAG_RE, processMatch);

  const fileRefs = new Map<string, string>();
  for (const [filename, path] of pathByFilename) {
    if (!skippedSourcePaths.has(path)) fileRefs.set(filename, path);
  }

  return { html: rewrittenHtml, fileRefs, skippedFiles: [...skippedSourcePaths] };
}

function normalizeImsFilePath(rawPath: string): string {
  const pathWithoutQuery = rawPath.replace(/[?#].*$/, '');
  return he.decode(safeDecodeURIComponent(pathWithoutQuery));
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

const PRE_TAG_RE = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
const CODE_WRAP_RE = /^<code\b([^>]*)>([\s\S]*)<\/code>$/i;
const CLASS_ATTR_RE = /\bclass=(["'])(.*?)\1/i;
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
  const regex = new RegExp(PRE_TAG_RE.source, PRE_TAG_RE.flags);
  const replacements: { start: number; end: number; replacement: string }[] = [];

  const pending: Promise<{ start: number; end: number; replacement: string }>[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const preAttrs = match[1];
    const innerHtml = match[2];

    pending.push(
      (async () => {
        const codeMatch = CODE_WRAP_RE.exec(innerHtml.trim());
        const codeAttrs = codeMatch ? codeMatch[1] : '';
        const codeContent = codeMatch ? codeMatch[2] : innerHtml;

        let language: string | undefined;
        for (const attrsStr of [preAttrs, codeAttrs]) {
          const classMatch = CLASS_ATTR_RE.exec(attrsStr);
          if (classMatch) {
            language = extractLanguageFromClass(classMatch[2]);
            if (language) break;
          }
        }

        // Strip HTML tags before decoding entities so that decoded `<` in
        // code (e.g. `&lt;=`) isn't mistaken for a tag boundary.
        const plainCode = he.decode(stripHtmlFromCode(codeContent));

        if (!language) {
          language = await detectCodeLanguage(plainCode);
        }
        const langAttr = language ? ` language="${language}"` : '';
        return {
          start,
          end,
          replacement: `<pl-code${langAttr}>\n${plainCode}</pl-code>`,
        };
      })(),
    );
  }

  replacements.push(...(await Promise.all(pending)));
  replacements.sort((a, b) => b.start - a.start);

  let result = html;
  for (const { start, end, replacement } of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result.replaceAll(P_WRAPPING_PL_CODE_RE, '$1');
}

/**
 * Strip Canvas wrapper tags from code content. Converts `<br>` to newlines and
 * removes known inline/block wrapper tags that Canvas adds inside `<pre>` blocks
 * for styling. Only targets specific tag names to avoid stripping legitimate
 * angle-bracket content (e.g. generics, comparisons) that might not be
 * entity-encoded.
 */
function stripHtmlFromCode(code: string): string {
  return code
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/?(?:span|div|font|b|i|u|em|strong|sub|sup|a|p|code)(?:\s[^>]*)?\/?>/gi, '');
}

const P_WRAPPING_PL_CODE_RE = /<p>\s*(<pl-code\b[^>]*>[\s\S]*?<\/pl-code>)\s*<\/p>/gi;

/**
 * Clean up question HTML for PrairieLearn output.
 * Strips a single wrapping <div> tag that Canvas often adds.
 */
export function cleanQuestionHtml(html: string): string {
  let cleaned = html.trim();
  const divOpenMatch = /^<div(?:\s[^>]*)?>/i.exec(cleaned);
  if (!divOpenMatch) return cleaned;

  const divTagRe = /<\/?div(?:\s[^>]*)?>/gi;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = divTagRe.exec(cleaned)) !== null) {
    const isClose = /^<\//.test(match[0]);
    depth += isClose ? -1 : 1;

    if (depth === 0) {
      if (divTagRe.lastIndex === cleaned.length) {
        cleaned = cleaned.slice(divOpenMatch[0].length, match.index).trim();
      }
      break;
    }
  }
  return cleaned;
}
