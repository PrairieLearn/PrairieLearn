import mustache, { type OpeningAndClosingTags, type TemplateSpans } from 'mustache';

type Span = TemplateSpans[number];
type SectionSpan = [Span[0], string, number, number, TemplateSpans, number];
type TextSpan = [Span[0], string, number, number];

/**
 * A run of template text that sits on a single line, or a run of whole lines
 * that cannot contain a standalone tag.
 */
interface TextPiece {
  start: number;
  end: number;
  deleted: boolean;
}

const nonSpaceRe = /\S/g;
const nonSpaceReplaceRe = /\S/g;
const spaceRe = /\s+/;
const whitespaceCharRe = /\s/;
const MAX_TAG_LENGTH = 32;
const tagTypes = new Set(['#', '^', '/', '>', '{', '&', '=', '!']);

/** Matches JavaScript's `\s` for a single UTF-16 code unit. */
function isWhitespace(code: number) {
  if (code < 128) return code === 32 || (code >= 9 && code <= 13);
  return whitespaceCharRe.test(String.fromCharCode(code));
}

/**
 * A drop-in replacement for mustache.js's `parseTemplate()` that produces an
 * identical token tree (including token positions and error messages).
 *
 * Upstream builds one token per character of template text and then
 * concatenates them back together, which is slow and produces deeply nested
 * cons strings. This parser instead handles text a line at a time and slices
 * text tokens straight out of the template. Tag parsing follows upstream's
 * scanner step for step, using string searches at the current position
 * instead of running regular expressions over the rest of the template.
 *
 * Standalone tags (sections, comments, partials, and delimiter changes that
 * are the only non-whitespace on their line) remove that line's whitespace,
 * including its newline. Only the first and last line of a text run can share
 * a line with a tag, so text in between is kept as one piece.
 */
export function parseMustacheTemplate(
  template: string,
  tags?: OpeningAndClosingTags,
): TemplateSpans {
  if (!template) return [];

  const flat: (TextPiece | Span)[] = [];
  const sections: Span[] = [];
  let linePieces: TextPiece[] = [];
  let indent = '';
  let indentedPieces = 0;
  let hasTag = false;
  let nonSpace = false;
  let lineHasNonSpace = false;
  let tagIndex = 0;
  let pos = 0;
  const len = template.length;
  // The first newline at or after the last text start, or `len` if there are
  // none. Searching from each text start instead would rescan the rest of a
  // template with no newlines once per text run.
  let nextNewline = -1;

  let openTag = '';
  let closeTag = '';
  let closeCurlyTag = '';

  function compileTags(tagsToCompile: string | string[]) {
    if (typeof tagsToCompile === 'string') tagsToCompile = tagsToCompile.split(spaceRe, 2);
    if (!Array.isArray(tagsToCompile) || tagsToCompile.length !== 2) {
      throw new Error('Invalid tags: ' + String(tagsToCompile));
    }
    const [open, close] = tagsToCompile;
    // The scanning below relies on tags being non-empty and free of whitespace.
    // Delimiter changes inside a template can't produce such tags, but tags
    // passed in by a caller could. Long tags are rejected because V8's
    // `indexOf()` takes time proportional to the pattern length at each
    // position for patterns longer than about 250 characters, which would make
    // parsing quadratic. mustache.js rejects tags longer than about 32,000
    // characters.
    if (
      !open ||
      !close ||
      open.length > MAX_TAG_LENGTH ||
      close.length > MAX_TAG_LENGTH ||
      spaceRe.test(open) ||
      spaceRe.test(close)
    ) {
      throw new Error('Unsupported tags: ' + String(tagsToCompile));
    }
    openTag = open;
    closeTag = close;
    closeCurlyTag = '}' + close;
  }

  // Upstream scans with regular expressions made of `\s*` followed by a tag or
  // a single character, neither of which can start with whitespace. That makes
  // them equivalent to the string operations below.

  /** Equivalent to upstream's `scanner.scan(whiteRe)`. */
  function skipWhitespace() {
    while (pos < len && isWhitespace(template.charCodeAt(pos))) pos++;
  }

  /** Equivalent to upstream's `scanner.scan()` with `\s*` followed by `target`. */
  function scanPast(target: string) {
    let p = pos;
    while (p < len && isWhitespace(template.charCodeAt(p))) p++;
    if (!template.startsWith(target, p)) return false;
    pos = p + target.length;
    return true;
  }

  /** Equivalent to upstream's `scanner.scanUntil()` with `\s*` followed by `target`. */
  function scanUntil(target: string) {
    const found = template.indexOf(target, pos);
    let end = len;
    if (found !== -1) {
      end = found;
      while (end > pos && isWhitespace(template.charCodeAt(end - 1))) end--;
    }
    const value = template.slice(pos, end);
    pos = end;
    return value;
  }

  function hasNonSpace(start: number, end: number) {
    nonSpaceRe.lastIndex = start;
    const match = nonSpaceRe.exec(template);
    return match !== null && match.index < end;
  }

  function stripSpace() {
    if (hasTag && !nonSpace) {
      for (const piece of linePieces) piece.deleted = true;
    }
    linePieces = [];
    indent = '';
    indentedPieces = 0;
    hasTag = false;
    nonSpace = false;
  }

  function addLinePiece(start: number, end: number) {
    const piece = { start, end, deleted: false };
    flat.push(piece);
    linePieces.push(piece);
    if (!lineHasNonSpace && hasNonSpace(start, end)) {
      nonSpace = true;
      lineHasNonSpace = true;
    }
  }

  function endLine() {
    stripSpace();
    tagIndex = 0;
    lineHasNonSpace = false;
  }

  function processText(start: number, end: number) {
    if (nextNewline < start) {
      nextNewline = template.indexOf('\n', start);
      if (nextNewline === -1) nextNewline = len;
    }
    if (nextNewline >= end) {
      addLinePiece(start, end);
      return;
    }
    addLinePiece(start, nextNewline + 1);
    endLine();
    let p = nextNewline + 1;
    const lastNewline = template.lastIndexOf('\n', end - 1);
    if (lastNewline >= p) {
      // Whole lines with no tags: never standalone, and they reset line state.
      flat.push({ start: p, end: lastNewline + 1, deleted: false });
      p = lastNewline + 1;
    }
    if (p < end) addLinePiece(p, end);
  }

  /** The current line's indentation, extended as new pieces are added to the line. */
  function indentation() {
    for (; indentedPieces < linePieces.length; indentedPieces++) {
      const piece = linePieces[indentedPieces];
      indent += template.slice(piece.start, piece.end).replace(nonSpaceReplaceRe, ' ');
    }
    return indent;
  }

  compileTags(tags || mustache.tags);

  while (pos < len) {
    const tagStart = template.indexOf(openTag, pos);
    const textEnd = tagStart === -1 ? len : tagStart;
    if (textEnd > pos) processText(pos, textEnd);
    pos = textEnd;
    if (tagStart === -1) break;

    const start = pos;
    pos += openTag.length;
    skipWhitespace();
    hasTag = true;

    let type = 'name';
    if (pos < len && tagTypes.has(template[pos])) type = template[pos++];
    skipWhitespace();

    let value: string;
    if (type === '=') {
      value = scanUntil('=');
      scanPast('=');
      scanUntil(closeTag);
    } else if (type === '{') {
      value = scanUntil(closeCurlyTag);
      scanPast('}');
      scanUntil(closeTag);
      type = '&';
    } else {
      value = scanUntil(closeTag);
    }

    if (!scanPast(closeTag)) throw new Error('Unclosed tag at ' + pos);

    const spanType = type as Span[0];
    let token: Span;
    if (type === '>') {
      token = [spanType, value, start, pos, indentation(), tagIndex, lineHasNonSpace];
    } else if (type === '#' || type === '^') {
      token = [spanType, value, start, pos, [], 0];
    } else {
      token = [spanType, value, start, pos];
    }
    tagIndex++;
    flat.push(token);

    if (type === '#' || type === '^') {
      sections.push(token);
    } else if (type === '/') {
      const openSection = sections.pop();
      if (!openSection) throw new Error('Unopened section "' + value + '" at ' + start);
      if (openSection[1] !== value) {
        throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
      }
    } else if (type === 'name' || type === '&') {
      nonSpace = true;
    } else if (type === '=') {
      compileTags(value);
    }
  }

  stripSpace();

  const openSection = sections.pop();
  if (openSection) throw new Error('Unclosed section "' + openSection[1] + '" at ' + pos);

  // Merge adjacent text and nest sections, as upstream's squashTokens() and
  // nestTokens() do. Merged pieces are always contiguous in the template.
  const result: TemplateSpans = [];
  let collector = result;
  const stack: SectionSpan[] = [];
  let lastText: TextSpan | null = null;
  for (const item of flat) {
    if (!Array.isArray(item)) {
      if (item.deleted) continue;
      if (lastText) {
        lastText[3] = item.end;
      } else {
        lastText = ['text', '', item.start, item.end];
        collector.push(lastText);
      }
      continue;
    }
    if (lastText) {
      lastText[1] = template.slice(lastText[2], lastText[3]);
      lastText = null;
    }
    // `@types/mustache` omits '/' from the token types, but closing tags use it.
    const type: string = item[0];
    if (type === '#' || type === '^') {
      const section = item as SectionSpan;
      collector.push(section);
      stack.push(section);
      collector = section[4];
    } else if (type === '/') {
      const section = stack.pop()!;
      section[5] = item[2];
      collector = stack.length > 0 ? stack[stack.length - 1][4] : result;
    } else {
      collector.push(item);
    }
  }
  if (lastText) lastText[1] = template.slice(lastText[2], lastText[3]);

  return result;
}
