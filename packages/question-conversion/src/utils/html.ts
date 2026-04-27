import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import type { ModelOperations as ModelOperationsType } from '@vscode/vscode-languagedetection';
import he from 'he';

// The package ships as a UMD CJS bundle; named ESM imports don't work.
const _require = createRequire(import.meta.url);
const { ModelOperations } = _require('@vscode/vscode-languagedetection') as {
  ModelOperations: typeof ModelOperationsType;
};

const DATA_URI_RE = /src=(["'])data:(?<mime>image\/[a-zA-Z0-9.+-]+);base64,(?<data>[^"']+)\1/g;

/**
 * Extract inline base64 data URI images from HTML, replacing them with
 * local file references in clientFilesQuestion/.
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
    return `src=${quote}clientFilesQuestion/${filename}${quote}`;
  });

  return { html: rewritten, files };
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const ATTR_RE = /(\w[\w-]*)=(["'])(.*?)\2/gi;
const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Rewrite local <img> tags in HTML to <pl-figure> elements.
 *
 * For images already pointing into clientFilesQuestion/ the directory attribute
 * is set explicitly and the prefix is stripped from file-name. Other relative
 * paths are passed through as file-name without a directory attribute. Images
 * with absolute URLs (http://, https://, protocol-relative, data:, etc.) are
 * left as <img> since pl-figure resolves file-name against a local course
 * directory and cannot host remote resources. The alt and width attributes are
 * preserved; all others (style, class, etc.) are dropped since pl-figure
 * handles its own layout.
 */
export function rewriteImagesAsPlFigure(html: string): string {
  return html.replaceAll(IMG_TAG_RE, (tag) => {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(ATTR_RE)) {
      attrs[m[1].toLowerCase()] = he.decode(m[3]);
    }

    const src = attrs['src'] ?? '';
    if (ABSOLUTE_URL_RE.test(src)) return tag;

    const parts: string[] = [];

    if (src.startsWith('clientFilesQuestion/')) {
      parts.push(
        `file-name="${he.escape(src.slice('clientFilesQuestion/'.length))}"`,
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

/**
 * Resolve $IMS-CC-FILEBASE$ references in HTML for PrairieLearn output.
 *
 * Rewrites src="$IMS-CC-FILEBASE$/path/img.png" to:
 * src="clientFilesQuestion/img.png"
 *
 * Returns the rewritten HTML and a map of { filename → original decoded relative path }
 * so the caller can locate and copy the source files.
 */
export function resolveImsFileRefs(html: string): {
  html: string;
  fileRefs: Map<string, string>;
} {
  const fileRefs = new Map<string, string>();

  const rewritten = html.replaceAll(IMS_CC_FILEBASE_RE, (_match, rawPath: string) => {
    const decodedPath = decodeURIComponent(rawPath);
    const base = decodedPath.split('/').pop() ?? decodedPath;
    const dot = base.lastIndexOf('.');
    const stem = dot !== -1 ? base.slice(0, dot) : base;
    const ext = dot !== -1 ? base.slice(dot) : '';
    let filename = base;
    let suffix = 1;
    while (fileRefs.has(filename) && fileRefs.get(filename) !== decodedPath) {
      filename = `${stem}-${suffix}${ext}`;
      suffix += 1;
    }
    fileRefs.set(filename, decodedPath);
    return `clientFilesQuestion/${filename}`;
  });

  return { html: rewritten, fileRefs };
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

        if (!language) {
          language = await detectCodeLanguage(he.decode(codeContent));
        }
        const langAttr = language ? ` language="${language}"` : '';
        return {
          start,
          end,
          replacement: `<pl-code${langAttr}>\n${he.decode(codeContent)}</pl-code>`,
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

const P_WRAPPING_PL_CODE_RE = /<p>\s*(<pl-code\b[^>]*>[\s\S]*?<\/pl-code>)\s*<\/p>/gi;

/**
 * Clean up question HTML for PrairieLearn output.
 * Strips wrapping <div> tags that Canvas often adds.
 */
export function cleanQuestionHtml(html: string): string {
  let cleaned = html.trim();
  // Remove single wrapping <div>...</div>
  const divWrapRe = /^<div>\s*([\s\S]*?)\s*<\/div>$/i;
  const divMatch = divWrapRe.exec(cleaned);
  if (divMatch) {
    cleaned = divMatch[1].trim();
  }
  return cleaned;
}
