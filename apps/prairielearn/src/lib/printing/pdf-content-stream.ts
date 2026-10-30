import { setImmediate } from 'node:timers/promises';

import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  type PDFObject,
  PDFOperatorNames,
  PDFString,
} from 'pdf-lib';

export interface PdfContentMark {
  tagged: boolean;
  artifact: 'all' | 'decoration' | null;
}

export interface PdfContentOptions {
  classify: (mcid: number) => PdfContentMark | undefined;
  inheritedMarks?: readonly PdfContentMark[];
  resolveProperties: (name: string) => PDFDict | undefined;
  visitForm: (name: string, marks: readonly PdfContentMark[]) => Promise<void>;
  location: string;
  signal?: AbortSignal;
}

interface ContentInstruction {
  operator: string;
  operands: PDFObject[];
  start: number;
  end: number;
}

const operators = new Set<string>(Object.values(PDFOperatorNames));
const paintOperators = new Set([
  'Tj',
  'TJ',
  "'",
  '"',
  'Do',
  'sh',
  'S',
  's',
  'f',
  'F',
  'f*',
  'B',
  'B*',
  'b',
  'b*',
]);
const nonPathPaintOperators = new Set(['Tj', 'TJ', "'", '"', 'Do', 'sh']);
const whitespace = new Set([0, 9, 10, 12, 13, 32]);
const delimiters = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

function* parseContent(
  input: Uint8Array,
  location: string,
  signal?: AbortSignal,
): Generator<ContentInstruction> {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const context = PDFContext.create();
  let offset = 0;

  function fail(message: string): never {
    throw new Error(`${message} in ${location} at byte ${offset}.`);
  }

  function skipSpace() {
    while (offset < bytes.length) {
      if (whitespace.has(bytes[offset])) {
        offset++;
      } else if (bytes[offset] === 37) {
        while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) offset++;
      } else {
        break;
      }
    }
  }

  function word() {
    const start = offset;
    while (
      offset < bytes.length &&
      !whitespace.has(bytes[offset]) &&
      !delimiters.has(bytes[offset])
    ) {
      offset++;
    }
    if (offset === start) fail('Unexpected PDF delimiter');
    return bytes.toString('latin1', start, offset);
  }

  function object(depth = 0): PDFObject {
    signal?.throwIfAborted();
    if (depth > 128) fail('PDF content operand nesting is too deep');
    skipSpace();
    if (offset === bytes.length) fail('Unterminated PDF content operand');
    const start = offset;
    const byte = bytes[offset++];
    if (byte === 47) {
      const nameStart = offset;
      while (
        offset < bytes.length &&
        !whitespace.has(bytes[offset]) &&
        !delimiters.has(bytes[offset])
      ) {
        offset++;
      }
      const encoded = bytes.toString('latin1', nameStart, offset);
      if (/#(?![\da-fA-F]{2})/.test(encoded)) fail('Invalid PDF name escape');
      // pdf-lib only decodes uppercase hexadecimal escapes in names.
      return PDFName.of(encoded.replaceAll(/#[\da-fA-F]{2}/g, (escape) => escape.toUpperCase()));
    }
    if (byte === 40) {
      let nesting = 1;
      while (offset < bytes.length) {
        const next = bytes[offset++];
        if (next === 92) {
          if (offset === bytes.length) fail('Unterminated PDF literal string');
          const escaped = bytes[offset++];
          if (escaped === 13 && bytes[offset] === 10) offset++;
        } else if (next === 40) {
          nesting++;
        } else if (next === 41 && --nesting === 0) {
          return PDFString.of(bytes.toString('latin1', start + 1, offset - 1));
        }
      }
      fail('Unterminated PDF literal string');
    }
    if (byte === 91) {
      const result = PDFArray.withContext(context);
      skipSpace();
      while (bytes[offset] !== 93) {
        result.push(object(depth + 1));
        skipSpace();
      }
      offset++;
      return result;
    }
    if (byte === 60 && bytes[offset] === 60) {
      offset++;
      const result = PDFDict.withContext(context);
      skipSpace();
      while (!(bytes[offset] === 62 && bytes[offset + 1] === 62)) {
        const key = object(depth + 1);
        if (!(key instanceof PDFName)) fail('PDF dictionary key must be a name');
        if (result.get(key, true) !== undefined) fail('Duplicate PDF dictionary key');
        result.set(key, object(depth + 1));
        skipSpace();
      }
      offset += 2;
      return result;
    }
    if (byte === 60) {
      let value = '';
      while (offset < bytes.length && bytes[offset] !== 62) {
        const current = bytes[offset];
        if (!whitespace.has(current)) {
          const character = String.fromCharCode(current);
          if (!/[\da-fA-F]/.test(character)) fail('Invalid PDF hexadecimal string');
          value += character;
        }
        offset++;
      }
      if (offset === bytes.length) fail('Unterminated PDF hexadecimal string');
      offset++;
      return PDFHexString.of(value);
    }
    offset = start;
    const value = word();
    if (value === 'true') return PDFBool.True;
    if (value === 'false') return PDFBool.False;
    if (value === 'null') return PDFNull;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) fail('Unsupported PDF content operand');
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
      fail('PDF content number is out of range');
    }
    return PDFNumber.of(number);
  }

  let operands: PDFObject[] = [];
  let instructionStart: number | undefined;
  while (true) {
    signal?.throwIfAborted();
    skipSpace();
    if (offset === bytes.length) break;
    instructionStart ??= offset;
    const byte = bytes[offset];
    if (
      [47, 40, 91, 60].includes(byte) ||
      (byte >= 48 && byte <= 57) ||
      [43, 45, 46].includes(byte)
    ) {
      operands.push(object());
      continue;
    }
    const start = offset;
    const operator = word();
    if (['true', 'false', 'null'].includes(operator)) {
      offset = start;
      operands.push(object());
      continue;
    }
    if (operator === 'BI' || operator === 'ID' || operator === 'EI') {
      fail('Inline PDF images are unsupported');
    }
    if (!operators.has(operator)) fail(`Unsupported PDF content operator ${operator}`);
    yield { operator, operands, start: instructionStart, end: offset };
    operands = [];
    instructionStart = undefined;
  }
  if (operands.length > 0) fail('PDF content ends with operands without an operator');
}

/** Preserve drawing bytes while marking only source-declared decoration as artifacts. */
export async function rewritePdfContent(
  bytes: Uint8Array,
  {
    classify,
    inheritedMarks = [],
    resolveProperties,
    visitForm,
    location,
    signal,
  }: PdfContentOptions,
): Promise<Uint8Array> {
  const marks = inheritedMarks.map((mark) => ({ ...mark }));
  const initialDepth = marks.length;
  const replacements: { start: number; end: number }[] = [];

  function fail(message: string): never {
    throw new Error(`${message} in ${location}.`);
  }

  function requireOperands(instruction: ContentInstruction, count: number) {
    if (instruction.operands.length !== count) fail(`Invalid ${instruction.operator} operands`);
  }

  let instructionCount = 0;
  for (const instruction of parseContent(bytes, location, signal)) {
    if (++instructionCount % 4096 === 0) await setImmediate(undefined, { signal });
    const { operator, operands } = instruction;
    if (operator === 'BDC' || operator === 'BMC') {
      requireOperands(instruction, operator === 'BDC' ? 2 : 1);
      const tag = operands[0];
      if (!(tag instanceof PDFName)) fail('Marked-content tag must be a name');
      let properties: PDFDict | undefined;
      if (operator === 'BDC') {
        const value = operands[1];
        properties =
          value instanceof PDFName
            ? resolveProperties(value.decodeText())
            : value instanceof PDFDict
              ? value
              : undefined;
        if (!properties) fail('Marked-content properties are missing or invalid');
      }
      const mcid = properties?.get(PDFName.of('MCID'), true);
      if (
        mcid !== undefined &&
        (!(mcid instanceof PDFNumber) ||
          !Number.isSafeInteger(mcid.asNumber()) ||
          mcid.asNumber() < 0)
      ) {
        fail('Marked-content identifier must be a nonnegative integer');
      }
      const classification = mcid === undefined ? undefined : classify(mcid.asNumber());
      const mark: PdfContentMark = {
        tagged: classification?.tagged ?? false,
        artifact: classification?.artifact ?? null,
      };
      if (mark.artifact !== null) {
        replacements.push({ start: instruction.start, end: instruction.end });
      } else if (tag.decodeText() === 'Artifact') {
        mark.artifact = 'all';
      }
      marks.push(mark);
    } else if (operator === 'EMC') {
      requireOperands(instruction, 0);
      if (marks.length <= initialDepth) fail('Unbalanced marked content');
      marks.pop();
    } else if (paintOperators.has(operator)) {
      const tagged = marks.some((mark) => mark.tagged);
      const artifact = marks.some((mark) => mark.artifact !== null);
      if (!tagged && !artifact) fail(`Unclassified ${operator} content`);
      if (tagged && artifact) fail('Tagged content is nested inside an artifact');
      if (
        marks.some((mark) => mark.artifact === 'decoration') &&
        nonPathPaintOperators.has(operator)
      ) {
        fail('Declared CSS decoration contains text or graphics');
      }
      if (operator === 'Do') {
        requireOperands(instruction, 1);
        const name = operands[0];
        if (!(name instanceof PDFName)) fail('XObject resource must be a name');
        await visitForm(
          name.decodeText(),
          marks.map((mark) => ({ ...mark })),
        );
      }
    }
  }
  signal?.throwIfAborted();
  if (marks.length !== initialDepth) fail('Unbalanced marked content');
  if (replacements.length === 0) return bytes;
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const replacement of replacements) {
    chunks.push(bytes.subarray(start, replacement.start), Buffer.from('/Artifact BMC', 'ascii'));
    start = replacement.end;
  }
  chunks.push(bytes.subarray(start));
  return Buffer.concat(chunks);
}
