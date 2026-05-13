import type { SchemaKeyword } from '@reteps/tree-sitter-htmlmustache/linter';
import type { ErrorObject } from 'ajv';

type KeywordValidateFunction = ((schema: unknown, data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

function stripTags(html: string): string {
  return html.replaceAll(/<[^>]*>/g, '');
}

const validateUniqueChildText: KeywordValidateFunction = (_schema, data) => {
  validateUniqueChildText.errors = null;

  if (!Array.isArray(data)) return true;

  const seen = new Set<string>();
  for (const child of data) {
    const text =
      child && typeof child === 'object' ? (child as { text?: unknown }).text : undefined;
    const innerHtml =
      child && typeof child === 'object' ? (child as { innerHtml?: unknown }).innerHtml : undefined;
    const normalizedText = (
      typeof text === 'string' ? text : typeof innerHtml === 'string' ? stripTags(innerHtml) : ''
    ).trim();
    if (seen.has(normalizedText)) {
      validateUniqueChildText.errors = [
        {
          instancePath: '',
          schemaPath: '',
          keyword: 'unique-child-text',
          params: {},
          message: `duplicate child text "${normalizedText}"`,
        },
      ];
      return false;
    }
    seen.add(normalizedText);
  }
  return true;
};

const uniqueChildText = {
  type: 'array',
  errors: true,
  validate: validateUniqueChildText,
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

export const plKeywords = {
  'pl-float-range': plFloatRange,
  'unique-child-text': uniqueChildText,
};
