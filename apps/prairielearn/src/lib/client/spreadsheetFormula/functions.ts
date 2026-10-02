// Signatures for the functions in SPREADSHEET_ALLOWED_FUNCTIONS, used for formula bar
// suggestions, signature hints, and argument holes.

import { z } from 'zod';

import rawSignatures from './functions.json' with { type: 'json' };

const FormulaArgumentSchema = z.object({
  name: z.string(),
  kind: z.enum(['value', 'range', 'condition', 'text']),
  optional: z.boolean().optional(),
});
export type FormulaArgument = z.infer<typeof FormulaArgumentSchema>;

const FormulaFunctionSignatureSchema = z.object({
  name: z.string(),
  args: z.array(FormulaArgumentSchema),
  /** The number of trailing arguments that may repeat, e.g. 2 for COUNTIFS's range/criteria pairs. */
  repeat: z.number().int().positive().optional(),
  description: z.string(),
});
export type FormulaFunctionSignature = z.infer<typeof FormulaFunctionSignatureSchema>;

const SIGNATURES = z.array(FormulaFunctionSignatureSchema).parse(rawSignatures);

export const FORMULA_FUNCTION_SIGNATURES: ReadonlyMap<string, FormulaFunctionSignature> = new Map(
  SIGNATURES.map((entry) => [entry.name, entry]),
);

/** Returns the argument at `index`, numbering repeated arguments (`range2`, `criteria_range2`). */
export function argumentAt(
  signature: FormulaFunctionSignature,
  index: number,
): FormulaArgument | null {
  if (index < signature.args.length) return signature.args[index];
  const repeat = signature.repeat;
  if (!repeat) return null;
  const offset = index - signature.args.length;
  const template = signature.args[signature.args.length - repeat + (offset % repeat)];
  const match = /^(.*?)(\d+)$/.exec(template.name);
  const repetition = Math.floor(offset / repeat) + 1;
  return {
    name: match ? `${match[1]}${Number(match[2]) + repetition}` : template.name,
    kind: template.kind,
    optional: true,
  };
}

/** Returns the displayed argument list, e.g. `['range1', '[range2]', '…']` for SUM. */
export function formatSignature(signature: FormulaFunctionSignature): string[] {
  const parts = signature.args.map((argument) =>
    argument.optional ? `[${argument.name}]` : argument.name,
  );
  if (signature.repeat) {
    for (let index = 0; index < signature.repeat; index += 1) {
      const argument = argumentAt(signature, signature.args.length + index)!;
      parts.push(`[${argument.name}]`);
    }
    parts.push('…');
  }
  return parts;
}
