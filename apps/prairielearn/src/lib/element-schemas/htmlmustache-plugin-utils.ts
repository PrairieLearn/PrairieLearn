import type { SchemaFormat } from '@prairielearn/tree-sitter-htmlmustache/linter';

export const BOOLEAN_TRUE_VALUES = [
  'true',
  't',
  '1',
  'True',
  'T',
  'TRUE',
  'yes',
  'y',
  'Yes',
  'Y',
  'YES',
];

const BOOLEAN_FALSE_VALUES = ['false', 'f', '0', 'False', 'F', 'FALSE', 'no', 'n', 'No', 'N', 'NO'];

export const BOOLEAN_VALUES = [...BOOLEAN_TRUE_VALUES, ...BOOLEAN_FALSE_VALUES];

const booleanValueSet = new Set(BOOLEAN_VALUES);
const booleanFalseValueSet = new Set(BOOLEAN_FALSE_VALUES);

// Advisory linter-side checks for the shared element schemas. The authoritative
// versions are Python's `is_integer_value`/`is_float_value` (`int()`/`float()`).
// These regexes are intentionally stricter — Python also accepts `1_000`, `+5`,
// whitespace, and `inf`/`nan` — so the linter nudges toward canonical values.
const plBoolean: SchemaFormat = (value) => typeof value === 'string' && booleanValueSet.has(value);

const plInteger: SchemaFormat = (value) => typeof value === 'string' && /^-?\d+$/.test(value);

const plNumber: SchemaFormat = (value) =>
  typeof value === 'string' && /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value);

export const formats = {
  boolean: plBoolean,
  integer: plInteger,
  number: plNumber,
};

export function isBooleanValue(value: string | true): boolean {
  return value === true || booleanValueSet.has(value);
}

export function isFalseValue(value: string | true): boolean {
  return typeof value === 'string' && booleanFalseValueSet.has(value);
}
