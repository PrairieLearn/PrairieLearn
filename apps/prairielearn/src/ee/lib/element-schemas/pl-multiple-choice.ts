import type {
  TagElement,
  TagValidator,
  ValidatorContext,
} from '@reteps/tree-sitter-htmlmustache/linter';
import * as z from 'zod/v4';

import { BOOLEAN_FALSE_VALUES, BOOLEAN_VALUES } from './ajv-extensions.js';

const plBoolean = () => z.union([z.boolean(), z.string().meta({ format: 'pl-boolean' })]);

const plInteger = () => z.string().meta({ format: 'pl-integer' });

const aotaNotaAttribute = () =>
  z.union([plBoolean(), z.enum(['false', 'random', 'correct', 'incorrect'])]);

const plAnswerAttributesSchema = z
  .object({
    correct: plBoolean().optional(),
    feedback: z.string().optional(),
    score: z
      .number()
      .min(0)
      .max(1)
      .meta({ errorMessage: 'Score must be in the range [0.0, 1.0].' })
      .optional(),
    tag: z.string().optional(),
    ranking: plInteger().optional(),
    depends: z.string().optional(),
    indent: plInteger().optional(),
    final: plBoolean().optional(),
    'initially-placed': plBoolean().optional(),
    'distractor-feedback': z.string().optional(),
    'ordering-feedback': z.string().optional(),
  })
  .strict();

const plMultipleChoiceAttributesSchema = z
  .object({
    'answers-name': z.string(),
    weight: plInteger().optional(),
    'number-answers': plInteger().optional(),
    order: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    display: z.enum(['block', 'inline', 'dropdown']).optional(),
    'hide-letter-keys': plBoolean().optional(),
    'fixed-order': plBoolean()
      .meta({ deprecated: true, description: 'Use the "order" attribute instead.' })
      .optional(),
    inline: plBoolean()
      .meta({ deprecated: true, description: 'Use the "display" attribute instead.' })
      .optional(),
    'hide-score-badge': plBoolean().optional(),
    'allow-blank': plBoolean().optional(),
    'builtin-grading': plBoolean().optional(),
    size: plInteger().optional(),
    placeholder: z.string().optional(),
    'aria-label': z.string().optional(),
    'external-json': z
      .string()
      .meta({
        deprecated: true,
        description: 'Define answer choices inline with <pl-answer> instead.',
      })
      .optional(),
    'external-json-correct-key': z.string().meta({ deprecated: true }).optional(),
    'external-json-incorrect-key': z.string().meta({ deprecated: true }).optional(),
    'all-of-the-above': aotaNotaAttribute().optional(),
    'none-of-the-above': aotaNotaAttribute().optional(),
    'all-of-the-above-feedback': z.string().optional(),
    'none-of-the-above-feedback': z.string().optional(),
  })
  .strict();

function toDraft06JsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(zodSchema, { target: 'draft-7' });
  schema.$schema = 'http://json-schema.org/draft-06/schema#';
  return schema;
}

export function plMultipleChoiceJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plMultipleChoiceAttributesSchema);
}

export function plAnswerJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plAnswerAttributesSchema);
}

const booleanValueSet = new Set(BOOLEAN_VALUES);
const booleanFalseValueSet = new Set(BOOLEAN_FALSE_VALUES);
const plAnswerAttributes = new Set(['correct', 'feedback', 'score']);

function hasAttribute(element: TagElement, attribute: string): boolean {
  return Object.hasOwn(element.attributes, attribute);
}

function isBooleanValue(value: string | true): boolean {
  return value === true || booleanValueSet.has(value);
}

function isFalseValue(value: string | true): boolean {
  return typeof value === 'string' && booleanFalseValueSet.has(value);
}

function report(
  context: ValidatorContext,
  element: TagElement,
  message: string,
  attribute?: string,
) {
  context.report({ element, attribute, message });
}

function requireDropdownDisplay(element: TagElement, context: ValidatorContext, attribute: string) {
  if (!hasAttribute(element, attribute)) return;
  if (
    !hasAttribute(element, 'display') ||
    (!element.hasDynamicAttribute('display') && element.attributes.display !== 'dropdown')
  ) {
    report(
      context,
      element,
      `pl-multiple-choice: if using ${attribute}, you must also set display to "dropdown".`,
      attribute,
    );
  }
}

function requireEnabledAotaNota(
  element: TagElement,
  context: ValidatorContext,
  feedbackAttribute: string,
  matchingAttribute: string,
) {
  if (!hasAttribute(element, feedbackAttribute)) return;
  if (
    !hasAttribute(element, matchingAttribute) ||
    (!element.hasDynamicAttribute(matchingAttribute) &&
      isFalseValue(element.attributes[matchingAttribute]))
  ) {
    report(
      context,
      element,
      `pl-multiple-choice: if using ${feedbackAttribute}, you must also use ${matchingAttribute}.`,
      feedbackAttribute,
    );
  }
}

const plMultipleChoiceChildTagsValidator: TagValidator = {
  id: 'pl/multiple-choice-child-tags',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    for (const child of element.children) {
      if (child.tag !== 'pl-answer') {
        report(context, child, 'pl-multiple-choice only allows <pl-answer> children.');
      }
    }
  },
};

const plMultipleChoiceRequiresAnswerValidator: TagValidator = {
  id: 'pl/multiple-choice-requires-answer',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    const answerChildren = element.children.filter((child) => child.tag === 'pl-answer');
    if (!hasAttribute(element, 'external-json') && answerChildren.length === 0) {
      report(context, element, 'pl-multiple-choice element must have at least 1 answer choice.');
    }
  },
};

const plMultipleChoiceOrderValidator: TagValidator = {
  id: 'pl/multiple-choice-order',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    if (hasAttribute(element, 'fixed-order') && hasAttribute(element, 'order')) {
      report(
        context,
        element,
        'Setting answer choice order should be done with the "order" attribute.',
        'fixed-order',
      );
    }
  },
};

const plMultipleChoiceDisplayValidator: TagValidator = {
  id: 'pl/multiple-choice-display',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    if (hasAttribute(element, 'inline') && hasAttribute(element, 'display')) {
      report(
        context,
        element,
        "Cannot set both 'display' and 'inline' attributes. Use only 'display'; the 'inline' attribute is deprecated.",
        'inline',
      );
    }

    requireDropdownDisplay(element, context, 'size');
    requireDropdownDisplay(element, context, 'placeholder');
  },
};

const plMultipleChoiceAotaNotaFeedbackValidator: TagValidator = {
  id: 'pl/multiple-choice-aota-nota-feedback',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    requireEnabledAotaNota(element, context, 'all-of-the-above-feedback', 'all-of-the-above');
    requireEnabledAotaNota(element, context, 'none-of-the-above-feedback', 'none-of-the-above');
  },
};

const plMultipleChoiceBuiltinGradingValidator: TagValidator = {
  id: 'pl/multiple-choice-builtin-grading',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    if (
      hasAttribute(element, 'builtin-grading') &&
      !element.hasDynamicAttribute('builtin-grading') &&
      isFalseValue(element.attributes['builtin-grading'])
    ) {
      if (hasAttribute(element, 'weight')) {
        report(
          context,
          element,
          '"weight" should not be set when builtin-grading is false.',
          'weight',
        );
      }
      if (hasAttribute(element, 'hide-score-badge')) {
        report(
          context,
          element,
          '"hide-score-badge" should not be set when builtin-grading is false.',
          'hide-score-badge',
        );
      }
      for (const attribute of ['all-of-the-above', 'none-of-the-above']) {
        if (
          hasAttribute(element, attribute) &&
          !element.hasDynamicAttribute(attribute) &&
          !isBooleanValue(element.attributes[attribute])
        ) {
          report(
            context,
            element,
            `"${attribute}" should be set to true or false when builtin-grading is false.`,
            attribute,
          );
        }
      }
    }
  },
};

const plMultipleChoiceAnswerAttributesValidator: TagValidator = {
  id: 'pl/multiple-choice-answer-attributes',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    for (const child of element.children) {
      if (child.tag !== 'pl-answer') continue;
      for (const attribute of Object.keys(child.attributes)) {
        if (!plAnswerAttributes.has(attribute)) {
          report(context, child, `Unknown attribute "${attribute}" on <pl-answer>.`, attribute);
        }
      }
    }
  },
};

const plMultipleChoiceBuiltinGradingAnswerValidator: TagValidator = {
  id: 'pl/multiple-choice-builtin-grading-answer',
  tags: ['pl-multiple-choice'],
  validate(element, context) {
    if (
      !hasAttribute(element, 'builtin-grading') ||
      element.hasDynamicAttribute('builtin-grading') ||
      !isFalseValue(element.attributes['builtin-grading'])
    ) {
      return;
    }

    for (const child of element.children) {
      if (child.tag !== 'pl-answer') continue;
      if (hasAttribute(child, 'score')) {
        report(
          context,
          child,
          '"score" on pl-answer should not be set when builtin-grading is false.',
          'score',
        );
      }
      if (hasAttribute(child, 'feedback')) {
        report(
          context,
          child,
          '"feedback" on pl-answer should not be set when builtin-grading is false.',
          'feedback',
        );
      }
    }
  },
};

const plMultipleChoiceUniqueAnswerHtmlValidator: TagValidator = {
  id: 'pl/multiple-choice-unique-answer-html',
  tags: ['pl-multiple-choice'],
  options: { includeInnerHtml: true },
  validate(element, context) {
    const answerChildren = element.children.filter((child) => child.tag === 'pl-answer');
    const seen = new Set<string>();
    for (const child of answerChildren) {
      const normalized = (child.innerHtml ?? '').trim();
      if (seen.has(normalized)) {
        report(context, child, `duplicate child inner HTML "${normalized}"`);
        continue;
      }
      seen.add(normalized);
    }
  },
};

export const validators: TagValidator[] = [
  plMultipleChoiceChildTagsValidator,
  plMultipleChoiceRequiresAnswerValidator,
  plMultipleChoiceOrderValidator,
  plMultipleChoiceDisplayValidator,
  plMultipleChoiceAotaNotaFeedbackValidator,
  plMultipleChoiceBuiltinGradingValidator,
  plMultipleChoiceAnswerAttributesValidator,
  plMultipleChoiceBuiltinGradingAnswerValidator,
  plMultipleChoiceUniqueAnswerHtmlValidator,
];
