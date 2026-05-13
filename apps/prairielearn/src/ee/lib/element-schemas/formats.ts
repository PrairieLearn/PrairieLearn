import type { SchemaFormat } from '@reteps/tree-sitter-htmlmustache/linter';

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

export const BOOLEAN_FALSE_VALUES = [
  'false',
  'f',
  '0',
  'False',
  'F',
  'FALSE',
  'no',
  'n',
  'No',
  'N',
  'NO',
];

export const BOOLEAN_VALUES = [...BOOLEAN_TRUE_VALUES, ...BOOLEAN_FALSE_VALUES];

const booleanValueSet = new Set(BOOLEAN_VALUES);

const plBoolean: SchemaFormat = (value) => typeof value === 'string' && booleanValueSet.has(value);

const plInteger: SchemaFormat = (value) => typeof value === 'string' && /^-?\d+$/.test(value);

const plFloat: SchemaFormat = (value) =>
  typeof value === 'string' && /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value);

export const plFormats = {
  'pl-boolean': plBoolean,
  'pl-integer': plInteger,
  'pl-float': plFloat,
};
