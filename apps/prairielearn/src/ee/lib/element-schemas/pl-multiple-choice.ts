import * as z from 'zod/v4';

import { BOOLEAN_FALSE_VALUES } from './ajv-extensions.js';
import { type Fragment, Then, When, rule } from './conditionals.js';

const plBoolean = () => z.union([z.boolean(), z.string().meta({ format: 'pl-boolean' })]);

const plInteger = () => z.string().meta({ format: 'pl-integer' });

const plFloat = () => z.string().meta({ format: 'pl-float' });

const aotaNotaAttribute = () =>
  z.union([plBoolean(), z.enum(['false', 'random', 'correct', 'incorrect'])]);

const plAnswerAttributesSchema = z
  .object({
    correct: plBoolean().optional(),
    feedback: z.string().optional(),
    score: plFloat()
      .meta({
        'pl-float-range': [0, 1],
        errorMessage: 'Score must be in the range [0.0, 1.0].',
      })
      .optional(),
  })
  .strict();

const plAnswerSchema = z.object({
  tag: z.literal('pl-answer'),
  text: z.string().optional(),
  innerHtml: z.string().optional(),
  attributes: plAnswerAttributesSchema,
});

const plMultipleChoiceAttributesSchema = z
  .object({
    'answers-name': z.string(),
    weight: plInteger().optional(),
    'number-answers': plInteger().optional(),
    order: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    display: z.enum(['block', 'inline', 'dropdown']).optional(),
    'hide-letter-keys': plBoolean().optional(),
    'fixed-order': plBoolean().optional(),
    inline: plBoolean().optional(),
    'hide-score-badge': plBoolean().optional(),
    'allow-blank': plBoolean().optional(),
    'builtin-grading': plBoolean().optional(),
    size: plInteger().optional(),
    placeholder: z.string().optional(),
    'aria-label': z.string().optional(),
    'external-json': z.string().optional(),
    'external-json-correct-key': z.string().optional(),
    'external-json-incorrect-key': z.string().optional(),
    'all-of-the-above': aotaNotaAttribute().optional(),
    'none-of-the-above': aotaNotaAttribute().optional(),
    'all-of-the-above-feedback': z.string().optional(),
    'none-of-the-above-feedback': z.string().optional(),
  })
  .strict();

const booleanAttributeFragment: Fragment = {
  anyOf: [{ type: 'boolean' }, { type: 'string', format: 'pl-boolean' }],
};
const builtinGradingFalse = When.attributeIn('builtin-grading', BOOLEAN_FALSE_VALUES);

const conditionalValidators = [
  rule(
    When.lacks('external-json'),
    Then.childrenMinItems(1),
    'pl-multiple-choice element must have at least 1 answer choice.',
  ),
  rule(
    When.has('fixed-order'),
    Then.lacks('order'),
    'Setting answer choice order should be done with the "order" attribute.',
  ),
  rule(
    When.has('inline'),
    Then.lacks('display'),
    "Cannot set both 'display' and 'inline' attributes. Use only 'display'; the 'inline' attribute is deprecated.",
  ),
  rule(
    When.has('size'),
    Then.attributeEquals('display', 'dropdown'),
    'pl-multiple-choice: if using size, you must also set display to "dropdown".',
  ),
  rule(
    When.has('placeholder'),
    Then.attributeEquals('display', 'dropdown'),
    'pl-multiple-choice: if using placeholder, you must also set display to "dropdown".',
  ),
  rule(
    When.has('all-of-the-above-feedback'),
    Then.attributeNotIn('all-of-the-above', BOOLEAN_FALSE_VALUES),
    'pl-multiple-choice: if using all-of-the-above-feedback, you must also use all-of-the-above.',
  ),
  rule(
    When.has('none-of-the-above-feedback'),
    Then.attributeNotIn('none-of-the-above', BOOLEAN_FALSE_VALUES),
    'pl-multiple-choice: if using none-of-the-above-feedback, you must also use none-of-the-above.',
  ),
  rule(
    builtinGradingFalse,
    Then.lacks('weight'),
    '"weight" should not be set when builtin-grading is false.',
  ),
  rule(
    builtinGradingFalse,
    Then.lacks('hide-score-badge'),
    '"hide-score-badge" should not be set when builtin-grading is false.',
  ),
  rule(
    builtinGradingFalse,
    Then.attributeMatches('all-of-the-above', booleanAttributeFragment),
    '"all-of-the-above" should be set to true or false when builtin-grading is false.',
  ),
  rule(
    builtinGradingFalse,
    Then.attributeMatches('none-of-the-above', booleanAttributeFragment),
    '"none-of-the-above" should be set to true or false when builtin-grading is false.',
  ),
  rule(
    builtinGradingFalse,
    Then.childAttributeLacks('score'),
    '"score" on pl-answer should not be set when builtin-grading is false.',
  ),
  rule(
    builtinGradingFalse,
    Then.childAttributeLacks('feedback'),
    '"feedback" on pl-answer should not be set when builtin-grading is false.',
  ),
];

const plMultipleChoiceEnvelopeSchema = z
  .object({
    tag: z.literal('pl-multiple-choice'),
    text: z.string().optional(),
    innerHtml: z.string().optional(),
    attributes: plMultipleChoiceAttributesSchema,
    // Custom ajv keyword registered in `ajv-extensions.ts`; rejects two
    // <pl-answer> children that render to the same inner HTML.
    children: z.array(plAnswerSchema).meta({ 'unique-child-inner-html': true }),
  })
  .strict()
  .meta({ allOf: conditionalValidators });

export function plMultipleChoiceJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(plMultipleChoiceEnvelopeSchema, {
    target: 'draft-2020-12',
  });
}
