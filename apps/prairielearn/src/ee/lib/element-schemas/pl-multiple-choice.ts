/* eslint-disable unicorn/no-thenable -- JSON Schema uses the `if`/`then` keywords. */

import * as z from 'zod/v4';

import { BOOLEAN_FALSE_VALUES } from './ajv-extensions.js';

const aotaNotaValues = ['false', 'random', 'correct', 'incorrect'];

const plAnswerAttributeSchema = z
  .object({
    correct: z.union([z.boolean(), z.string()]).optional(),
    feedback: z.string().optional(),
    score: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

const plMultipleChoiceEnvelopeSchema = z.object({
  tag: z.literal('pl-multiple-choice'),
  attributes: z.record(z.string(), z.unknown()),
  children: z.array(
    z.object({
      tag: z.string(),
      attributes: z.record(z.string(), z.unknown()),
      text: z.string().optional(),
      innerHtml: z.string().optional(),
    }),
  ),
});

const booleanAttribute = {
  anyOf: [{ type: 'boolean' }, { type: 'string', format: 'pl-boolean' }],
};

const aotaNotaAttribute = {
  anyOf: [booleanAttribute, { enum: aotaNotaValues }],
};

const integerAttribute = { type: 'string', format: 'pl-integer' };

const disabledBuiltinGradingCondition = {
  properties: {
    attributes: {
      properties: {
        'builtin-grading': { enum: BOOLEAN_FALSE_VALUES },
      },
      required: ['builtin-grading'],
    },
  },
};

function attributeRequiresDropdown(attributeName: string, message: string) {
  return {
    if: {
      properties: {
        attributes: { required: [attributeName] },
      },
    },
    then: {
      properties: {
        attributes: {
          properties: {
            display: { const: 'dropdown' },
          },
          required: ['display'],
        },
      },
      errorMessage: { _: message },
    },
  };
}

function feedbackRequiresOption(feedbackName: string, optionName: string, message: string) {
  return {
    if: {
      properties: {
        attributes: { required: [feedbackName] },
      },
    },
    then: {
      properties: {
        attributes: {
          properties: {
            [optionName]: { not: { enum: BOOLEAN_FALSE_VALUES } },
          },
          required: [optionName],
        },
      },
      errorMessage: { _: message },
    },
  };
}

export function plMultipleChoiceJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(plMultipleChoiceEnvelopeSchema, {
    target: 'draft-2020-12',
  }) as Record<string, unknown>;
  const plAnswerAttributesJsonSchema = z.toJSONSchema(plAnswerAttributeSchema, {
    target: 'draft-2020-12',
  }) as Record<string, unknown>;
  delete plAnswerAttributesJsonSchema.$schema;

  Object.assign(schema, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      tag: { const: 'pl-multiple-choice' },
      text: { type: 'string' },
      innerHtml: { type: 'string' },
      attributes: {
        type: 'object',
        properties: {
          'answers-name': { type: 'string' },
          weight: integerAttribute,
          'number-answers': integerAttribute,
          order: { enum: ['random', 'ascend', 'descend', 'fixed'] },
          display: { enum: ['block', 'inline', 'dropdown'] },
          'hide-letter-keys': booleanAttribute,
          'fixed-order': booleanAttribute,
          inline: booleanAttribute,
          'hide-score-badge': booleanAttribute,
          'allow-blank': booleanAttribute,
          'builtin-grading': booleanAttribute,
          size: integerAttribute,
          placeholder: { type: 'string' },
          'aria-label': { type: 'string' },
          'external-json': { type: 'string' },
          'external-json-correct-key': { type: 'string' },
          'external-json-incorrect-key': { type: 'string' },
          'all-of-the-above': aotaNotaAttribute,
          'none-of-the-above': aotaNotaAttribute,
          'all-of-the-above-feedback': { type: 'string' },
          'none-of-the-above-feedback': { type: 'string' },
        },
        required: ['answers-name'],
        additionalProperties: false,
      },
      children: {
        type: 'array',
        'unique-child-inner-html': true,
        items: {
          type: 'object',
          properties: {
            tag: { const: 'pl-answer' },
            text: { type: 'string' },
            innerHtml: { type: 'string' },
            attributes: {
              ...plAnswerAttributesJsonSchema,
              properties: {
                correct: booleanAttribute,
                feedback: { type: 'string' },
                score: {
                  type: 'string',
                  format: 'pl-float',
                  'pl-float-range': [0, 1],
                  errorMessage: 'Score must be in the range [0.0, 1.0].',
                },
              },
            },
          },
          required: ['tag', 'attributes'],
        },
      },
    },
    required: ['tag', 'attributes', 'children'],
    allOf: [
      {
        if: {
          properties: {
            attributes: {
              not: { required: ['external-json'] },
            },
          },
          required: ['attributes'],
        },
        then: {
          properties: {
            children: { minItems: 1 },
          },
        },
      },
      {
        if: {
          properties: {
            attributes: { required: ['fixed-order'] },
          },
        },
        then: {
          properties: {
            attributes: { not: { required: ['order'] } },
          },
        },
      },
      {
        if: {
          properties: {
            attributes: { required: ['inline'] },
          },
        },
        then: {
          properties: {
            attributes: { not: { required: ['display'] } },
          },
        },
      },
      {
        if: disabledBuiltinGradingCondition,
        then: {
          properties: {
            attributes: {
              properties: {
                'all-of-the-above': booleanAttribute,
                'none-of-the-above': booleanAttribute,
              },
              not: {
                anyOf: [{ required: ['weight'] }, { required: ['hide-score-badge'] }],
              },
            },
            children: {
              items: {
                properties: {
                  attributes: {
                    not: {
                      anyOf: [{ required: ['score'] }, { required: ['feedback'] }],
                    },
                  },
                },
              },
            },
          },
          errorMessage: {
            _: 'builtin-grading="false" only supports true/false all-of-the-above and none-of-the-above values, and forbids grading attributes.',
          },
        },
      },
      attributeRequiresDropdown(
        'size',
        'pl-multiple-choice: if using size, you must also set display to "dropdown".',
      ),
      attributeRequiresDropdown(
        'placeholder',
        'pl-multiple-choice: if using placeholder, you must also set display to "dropdown".',
      ),
      feedbackRequiresOption(
        'all-of-the-above-feedback',
        'all-of-the-above',
        'pl-multiple-choice: if using all-of-the-above-feedback, you must also use all-of-the-above.',
      ),
      feedbackRequiresOption(
        'none-of-the-above-feedback',
        'none-of-the-above',
        'pl-multiple-choice: if using none-of-the-above-feedback, you must also use none-of-the-above.',
      ),
    ],
  });

  return schema;
}
