import type { SchemaKeyword } from '@reteps/tree-sitter-htmlmustache/linter';
import type { ErrorObject } from 'ajv';

type KeywordValidateFunction = ((schema: unknown, data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

const validateUniqueChildText: KeywordValidateFunction = (_schema, data) => {
  if (!Array.isArray(data)) return true;

  const seen = new Set<string>();
  for (const child of data) {
    const text =
      child && typeof child === 'object' ? (child as { text?: unknown }).text : undefined;
    if (typeof text !== 'string') continue;
    if (seen.has(text)) {
      validateUniqueChildText.errors = [
        {
          instancePath: '',
          schemaPath: '',
          keyword: 'unique-child-text',
          params: {},
          message: `duplicate child text "${text}"`,
        },
      ];
      return false;
    }
    seen.add(text);
  }
  return true;
};

const uniqueChildText = {
  type: 'array',
  errors: true,
  validate: validateUniqueChildText,
} as unknown as SchemaKeyword;

export const plKeywords = {
  'unique-child-text': uniqueChildText,
};
