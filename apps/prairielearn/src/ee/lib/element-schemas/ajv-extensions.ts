import type { SchemaFormat, SchemaKeyword } from '@reteps/tree-sitter-htmlmustache/linter';
import type { ErrorObject } from 'ajv';

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

export const formats = {
  'pl-boolean': plBoolean,
  'pl-integer': plInteger,
  'pl-float': plFloat,
};

type KeywordValidateFunction = ((schema: unknown, data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

const validateUniqueChildInnerHtml: KeywordValidateFunction = (_schema, data) => {
  validateUniqueChildInnerHtml.errors = null;

  if (!Array.isArray(data)) return true;

  const seen = new Set<string>();
  for (const child of data) {
    const innerHtml =
      child && typeof child === 'object' ? (child as { innerHtml?: unknown }).innerHtml : undefined;
    const normalized = (typeof innerHtml === 'string' ? innerHtml : '').trim();
    if (seen.has(normalized)) {
      validateUniqueChildInnerHtml.errors = [
        {
          instancePath: '',
          schemaPath: '',
          keyword: 'unique-child-inner-html',
          params: {},
          message: `duplicate child inner HTML "${normalized}"`,
        },
      ];
      return false;
    }
    seen.add(normalized);
  }
  return true;
};

const uniqueChildInnerHtml = {
  type: 'array',
  errors: true,
  validate: validateUniqueChildInnerHtml,
} as unknown as SchemaKeyword;

const validatePlFloatRange: KeywordValidateFunction = (schema, data) => {
  validatePlFloatRange.errors = null;

  if (!Array.isArray(schema) || schema.length !== 2) return true;
  if (typeof data !== 'string' && typeof data !== 'number') return true;

  const [minimum, maximum] = schema;
  if (typeof minimum !== 'number' || typeof maximum !== 'number') return true;

  const value = Number(data);
  if (Number.isNaN(value) || (minimum <= value && value <= maximum)) return true;

  validatePlFloatRange.errors = [
    {
      instancePath: '',
      schemaPath: '',
      keyword: 'pl-float-range',
      params: { minimum, maximum },
      message: `must be in the range [${minimum.toFixed(1)}, ${maximum.toFixed(1)}]`,
    },
  ];
  return false;
};

const plFloatRange = {
  type: ['string', 'number'],
  errors: true,
  validate: validatePlFloatRange,
} as unknown as SchemaKeyword;

export const keywords = {
  'pl-float-range': plFloatRange,
  'unique-child-inner-html': uniqueChildInnerHtml,
};
