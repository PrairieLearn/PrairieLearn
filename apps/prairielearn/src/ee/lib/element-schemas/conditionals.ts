/* eslint-disable unicorn/no-thenable -- JSON Schema uses the `if`/`then` keywords. */

export type Fragment = Record<string, unknown>;

export const When = {
  has: (attribute: string): Fragment => ({
    properties: { attributes: { required: [attribute] } },
  }),
  lacks: (attribute: string): Fragment => ({
    properties: { attributes: { not: { required: [attribute] } } },
    required: ['attributes'],
  }),
  attributeIn: (attribute: string, values: readonly string[]): Fragment => ({
    properties: {
      attributes: {
        properties: { [attribute]: { enum: values } },
        required: [attribute],
      },
    },
  }),
};

export const Then = {
  lacks: (attribute: string): Fragment => ({
    properties: { attributes: { not: { required: [attribute] } } },
  }),
  attributeEquals: (attribute: string, value: string): Fragment => ({
    properties: {
      attributes: {
        properties: { [attribute]: { const: value } },
        required: [attribute],
      },
    },
  }),
  attributeNotIn: (attribute: string, values: readonly string[]): Fragment => ({
    properties: {
      attributes: {
        properties: { [attribute]: { not: { enum: values } } },
        required: [attribute],
      },
    },
  }),
  attributeMatches: (attribute: string, schema: Fragment): Fragment => ({
    properties: {
      attributes: { properties: { [attribute]: schema } },
    },
  }),
  childAttributeLacks: (attribute: string): Fragment => ({
    properties: {
      children: { items: { properties: { attributes: { not: { required: [attribute] } } } } },
    },
  }),
  childrenMinItems: (count: number): Fragment => ({
    properties: { children: { minItems: count } },
  }),
};

export function rule(when: Fragment, then: Fragment, message: string) {
  return { if: when, then, errorMessage: message };
}
