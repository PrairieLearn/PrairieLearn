import type { ConversionResult, EmitOptions, OutputEmitter } from './emitters/emitter.js';
import { PLEmitter } from './emitters/pl-emitter.js';
import type { InputParser, ParseOptions } from './parsers/parser.js';
import { QTI12AssessmentParser } from './parsers/qti12/index.js';
import type { IRAssessment } from './types/ir.js';

/** Options for the conversion pipeline. */
export interface ConvertOptions extends ParseOptions, EmitOptions {}

const DEFAULT_PARSERS: InputParser[] = [new QTI12AssessmentParser()];

/**
 * Auto-detect format and parse questions from XML into IR, without emitting.
 * Use this when you need the IR (e.g. to derive a slug) before emitting with full options.
 */
export async function parseAssessment(
  xmlContent: string,
  parsers: InputParser[],
  options?: ParseOptions,
): Promise<IRAssessment> {
  const parser = parsers.find((p) => p.canParse(xmlContent));
  if (!parser) {
    throw new Error(
      `No parser found for input. Supported formats: ${parsers.map((p) => p.formatId).join(', ')}`,
    );
  }
  return parser.parse(xmlContent, options);
}

/**
 * Auto-detect format and convert questions from XML to PL output.
 *
 * Tries each registered parser in order and uses the first one that
 * reports it can parse the input.
 */
export async function convert(
  xmlContent: string,
  options?: ConvertOptions,
): Promise<ConversionResult> {
  return convertWith(xmlContent, DEFAULT_PARSERS, new PLEmitter(), options);
}

/**
 * Convert questions using an explicit parser and emitter.
 */
export async function convertWith(
  xmlContent: string,
  parsers: InputParser[],
  emitter: OutputEmitter,
  options?: ConvertOptions,
): Promise<ConversionResult> {
  const ir = await parseAssessment(xmlContent, parsers, options);
  return emitter.emit(ir, options);
}
