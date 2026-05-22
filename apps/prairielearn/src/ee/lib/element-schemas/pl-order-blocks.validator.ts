import {
  type TagElement,
  type TagValidator,
  type ValidatorContext,
  attr,
  defineTagValidators,
} from '@reteps/tree-sitter-htmlmustache/linter';

import { BOOLEAN_TRUE_VALUES, isFalseValue } from './htmlmustache-plugin-utils.ts';

const DAG_ANSWER_ATTRIBUTES = new Set([
  'correct',
  'initially-placed',
  'tag',
  'depends',
  'comment',
  'indent',
  'distractor-feedback',
  'distractor-for',
  'ordering-feedback',
  'final',
]);

const GRADING_METHOD_ANSWER_ATTRIBUTES: Partial<Record<string, Set<string>>> = {
  external: new Set(['correct', 'initially-placed']),
  unordered: new Set(['correct', 'initially-placed', 'indent', 'distractor-feedback']),
  ordered: new Set(['correct', 'initially-placed', 'indent', 'distractor-feedback']),
  ranking: new Set([
    'correct',
    'initially-placed',
    'tag',
    'ranking',
    'indent',
    'distractor-feedback',
    'distractor-for',
    'ordering-feedback',
  ]),
  dag: DAG_ANSWER_ATTRIBUTES,
};

const LCS_GRADABLE_METHODS = new Set(['dag', 'ordered', 'ranking']);
const FEEDBACK_METHODS = new Set(['dag', 'ranking']);
const TAG_SPECIAL_CHARACTERS = new Set('*&^$@!~[]{}()|:@?/\\'.split(''));

function isLiteralTrueAttribute(element: TagElement, attribute: string): boolean {
  const value = attr(element, attribute).literal();
  return typeof value === 'string' && BOOLEAN_TRUE_VALUES.includes(value);
}

function isLiteralFalseAttribute(element: TagElement, attribute: string): boolean {
  const value = attr(element, attribute).literal();
  return value !== undefined && isFalseValue(value);
}

function literalIntAttribute(element: TagElement, attribute: string): number | undefined {
  const value = attr(element, attribute).literal();
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

function literalStringAttribute(element: TagElement, attribute: string, fallback: string): string {
  const value = attr(element, attribute).literal();
  return typeof value === 'string' ? value : fallback;
}

function optionalLiteralStringAttribute(
  element: TagElement,
  attribute: string,
): string | undefined {
  const value = attr(element, attribute).literal();
  return typeof value === 'string' ? value : undefined;
}

function allAnswers(element: TagElement): TagElement[] {
  return [...element.childrenWithTag('pl-answer')];
}

function hasOptionalBlocks(element: TagElement): boolean {
  return [
    ...allAnswers(element).map((answer) => attr(answer, 'depends').literal()),
    ...element.childrenWithTag('pl-block-group').map((group) => attr(group, 'depends').literal()),
  ].some((depends) => typeof depends === 'string' && depends.includes('|'));
}

function validateAnswerAttributes(
  element: TagElement,
  context: ValidatorContext,
  allowedAttributes: Set<string>,
) {
  for (const answer of allAnswers(element)) {
    for (const attribute of Object.keys(answer.attributes)) {
      if (!allowedAttributes.has(attribute)) {
        context.reportAttribute(
          answer,
          attribute,
          `pl-answer: ${attribute} is not valid with this pl-order-blocks grading method.`,
        );
      }
    }
  }
}

function validateTagCharacters(element: TagElement, context: ValidatorContext) {
  const taggedElements = [...allAnswers(element), ...element.childrenWithTag('pl-block-group')];
  for (const child of taggedElements) {
    const tag = attr(child, 'tag').literal();
    if (typeof tag !== 'string') continue;
    if ([...tag].some((char) => TAG_SPECIAL_CHARACTERS.has(char))) {
      context.reportAttribute(
        child,
        'tag',
        'The tag attribute may not contain special characters: "*&^$@!~[]{}()|:@?/\\\\".',
      );
    }
  }
}

export const validators: TagValidator[] = defineTagValidators('pl-order-blocks', {
  'pl/order-blocks-children'(element, context) {
    if (element.childrenWithTag('pl-answer').length === 0 && allAnswers(element).length === 0) {
      context.reportElement(element, 'pl-order-blocks element must have at least 1 answer block.');
    }
  },

  'pl/order-blocks-grading-method-attributes'(element, context) {
    const gradingMethod = literalStringAttribute(element, 'grading-method', 'ordered');
    const allowedAttributes = GRADING_METHOD_ANSWER_ATTRIBUTES[gradingMethod];
    if (!allowedAttributes) return;

    validateAnswerAttributes(element, context, allowedAttributes);

    if (gradingMethod !== 'dag') {
      for (const group of element.childrenWithTag('pl-block-group')) {
        context.reportElement(group, 'Block groups only supported in the "dag" grading mode.');
      }
    }
  },

  'pl/order-blocks-cross-attribute-options'(element, context) {
    const gradingMethod = literalStringAttribute(element, 'grading-method', 'ordered');
    const format = literalStringAttribute(element, 'format', 'default');
    const feedback = literalStringAttribute(element, 'feedback', 'none');
    const partialCredit = optionalLiteralStringAttribute(element, 'partial-credit');
    const sourceBlocksOrder = literalStringAttribute(
      element,
      'source-blocks-order',
      'alphabetized',
    );
    const distractorOrder = literalStringAttribute(element, 'distractor-order', 'inherit');

    if (format !== 'code' && attr(element, 'code-language').present()) {
      context.reportAttribute(
        element,
        'code-language',
        'code-language attribute may only be used with format="code".',
      );
    }

    if (partialCredit !== undefined && !LCS_GRADABLE_METHODS.has(gradingMethod)) {
      context.reportAttribute(
        element,
        'partial-credit',
        'partial-credit may only be used in the dag, ordered, and ranking grading modes.',
      );
    }

    if (feedback !== 'none' && !FEEDBACK_METHODS.has(gradingMethod)) {
      context.reportAttribute(
        element,
        'feedback',
        `feedback type ${feedback} is not available with the ${gradingMethod} grading-method.`,
      );
    }

    if (
      isLiteralTrueAttribute(element, 'inline') &&
      isLiteralTrueAttribute(element, 'indentation')
    ) {
      context.reportAttribute(
        element,
        'indentation',
        'indentation may not be used when inline is true.',
      );
    }

    if (distractorOrder === 'random' && sourceBlocksOrder === 'random') {
      context.reportAttribute(
        element,
        'distractor-order',
        'distractor-order="random" cannot be used with source-blocks-order="random".',
      );
    }
  },

  'pl/order-blocks-answer-options'(element, context) {
    if (!isLiteralTrueAttribute(element, 'indentation')) {
      for (const answer of allAnswers(element)) {
        if (attr(answer, 'indent').present()) {
          context.reportAttribute(
            answer,
            'indent',
            '<pl-answer> should not specify indentation if indentation is disabled.',
          );
        }
      }
    }

    for (const answer of allAnswers(element)) {
      if (
        attr(answer, 'ordering-feedback').present() &&
        isLiteralFalseAttribute(answer, 'correct')
      ) {
        context.reportAttribute(
          answer,
          'ordering-feedback',
          'ordering-feedback may only be used on blocks with correct=true.',
        );
      }

      if (
        isLiteralTrueAttribute(answer, 'initially-placed') &&
        isLiteralFalseAttribute(answer, 'correct')
      ) {
        context.reportAttribute(
          answer,
          'initially-placed',
          'Incorrect blocks cannot be initially placed.',
        );
      }
    }

    validateTagCharacters(element, context);
  },

  'pl/order-blocks-incorrect-counts'(element, context) {
    const incorrectAnswerCount = allAnswers(element).filter((answer) =>
      isLiteralFalseAttribute(answer, 'correct'),
    ).length;
    const minIncorrect = literalIntAttribute(element, 'min-incorrect');
    const maxIncorrect = literalIntAttribute(element, 'max-incorrect');

    if (minIncorrect !== undefined && minIncorrect > incorrectAnswerCount) {
      context.reportAttribute(
        element,
        'min-incorrect',
        'min-incorrect may not exceed the number of incorrect <pl-answer> blocks.',
      );
    }
    if (maxIncorrect !== undefined && maxIncorrect > incorrectAnswerCount) {
      context.reportAttribute(
        element,
        'max-incorrect',
        'max-incorrect may not exceed the number of incorrect <pl-answer> blocks.',
      );
    }
    if (minIncorrect !== undefined && maxIncorrect !== undefined && minIncorrect > maxIncorrect) {
      context.reportAttribute(
        element,
        'min-incorrect',
        'min-incorrect must be smaller than max-incorrect.',
      );
    }
  },

  'pl/order-blocks-optional-blocks'(element, context) {
    if (!hasOptionalBlocks(element)) return;

    if (element.childrenWithTag('pl-block-group').length > 0) {
      context.reportElement(element, 'Block groups not supported with the optional-lines feature.');
    }

    if (!allAnswers(element).some((answer) => isLiteralTrueAttribute(answer, 'final'))) {
      context.reportElement(
        element,
        "Use of optional lines requires 'final' attributes on all true <pl-answer> blocks that appear at the end of a valid ordering.",
      );
    }
  },
});

export const blockGroupValidators: TagValidator[] = defineTagValidators('pl-block-group', {
  'pl/order-blocks-block-group-answer-attributes'(element, context) {
    validateAnswerAttributes(element, context, DAG_ANSWER_ATTRIBUTES);
  },

  'pl/order-blocks-block-group-optional-blocks'(element, context) {
    if (!hasOptionalBlocks(element)) return;

    context.reportElement(element, 'Block groups not supported with the optional-lines feature.');
  },
});
