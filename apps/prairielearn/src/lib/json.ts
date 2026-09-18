import crypto from 'node:crypto';

import { codeFrameColumns } from '@babel/code-frame';
import stableStringify from 'fast-json-stable-stringify';

import { truncateMiddle } from '@prairielearn/formatter';

const MAX_CODE_FRAME_LINE_LENGTH = 160;
const MAX_CODE_FRAME_MESSAGE_LENGTH = 160;
const MAX_CODE_FRAME_SURROUNDING_LINES = 2;

function cropCodeFrameLine(line: string, column?: number) {
  if (line.length <= MAX_CODE_FRAME_LINE_LENGTH) {
    return { line, column };
  }

  if (column === undefined) {
    return { line: truncateMiddle(line, MAX_CODE_FRAME_LINE_LENGTH), column };
  }

  const contentLength = MAX_CODE_FRAME_LINE_LENGTH - 2;
  const markerIndex = Math.min(Math.max(column - 1, 0), line.length);
  const start = Math.min(
    Math.max(markerIndex - Math.floor(contentLength / 2), 0),
    line.length - contentLength,
  );
  const end = start + contentLength;
  const prefix = start > 0 ? '…' : '';
  const suffix = end < line.length ? '…' : '';

  return {
    line: `${prefix}${line.slice(start, end)}${suffix}`,
    column: markerIndex - start + prefix.length + 1,
  };
}

export function formatJsonParseError(
  contents: string,
  error: unknown,
  { surroundingLines = 2 }: { surroundingLines?: number } = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  const [summary] = message.split('\n');

  if (
    !(error instanceof SyntaxError) ||
    !('row' in error) ||
    typeof error.row !== 'number' ||
    !('column' in error) ||
    typeof error.column !== 'number'
  ) {
    return message;
  }

  const errorRow = error.row;
  const errorColumn = error.column;
  const lines = contents.split(/\r\n|[\n\r\u2028\u2029]/);
  const errorLineIndex = errorRow - 1;
  if (errorLineIndex < 0 || errorLineIndex >= lines.length) {
    return message;
  }

  const contextLineCount = Math.min(
    Math.max(surroundingLines, 0),
    MAX_CODE_FRAME_SURROUNDING_LINES,
  );
  const firstLineIndex = Math.max(errorLineIndex - contextLineCount, 0);
  const lastLineIndex = Math.min(errorLineIndex + contextLineCount + 1, lines.length);
  let markerColumn = errorColumn;
  const contextLines = lines.slice(firstLineIndex, lastLineIndex).map((line, index) => {
    const lineNumber = firstLineIndex + index;
    const cropped = cropCodeFrameLine(
      line,
      lineNumber === errorLineIndex ? errorColumn : undefined,
    );
    if (lineNumber === errorLineIndex) {
      markerColumn = cropped.column ?? markerColumn;
    }
    return cropped.line;
  });
  lines.splice(firstLineIndex, contextLines.length, ...contextLines);

  return codeFrameColumns(
    lines.join('\n'),
    { start: { line: errorRow, column: markerColumn } },
    {
      highlightCode: false,
      linesAbove: contextLineCount,
      linesBelow: contextLineCount,
      message: truncateMiddle(summary, MAX_CODE_FRAME_MESSAGE_LENGTH),
    },
  );
}

/**
 * Computes a stable SHA-256 hash of a value, using deterministic key ordering.
 * Useful for optimistic concurrency checks.
 */
export function computeStableHash(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Given an original object and a modified object, returns a new object
 * that contains all the data from the modified object, but with the keys
 * matching the order that they appear in the original object. Keys that are
 * not present in the original object are added at the end.
 *
 *
 * This function is meant to be used when programmatically editing JSON data.
 * It's designed to minimize the changes in the JSON data such that a `git diff`
 * doesn't show spurious changes unrelated to the actual data changes.
 */
export function applyKeyOrder(original: any, modified: any): any {
  if (typeof original !== 'object' || original === null) {
    return modified;
  }

  if (typeof modified !== 'object' || modified === null) {
    return modified;
  }

  if (Array.isArray(original) && Array.isArray(modified)) {
    return modified.map((value, index) => applyKeyOrder(original[index], value));
  }

  if (typeof original === 'object' && typeof modified === 'object') {
    const result: any = {};

    // Add keys from original in the order they appear.
    for (const key of Object.keys(original)) {
      if (key in modified) {
        result[key] = applyKeyOrder(original[key], modified[key]);
      }
    }

    // Add keys from modified that are not in original.
    for (const key of Object.keys(modified)) {
      if (!(key in result)) {
        result[key] = modified[key];
      }
    }

    return result;
  }

  return modified;
}
