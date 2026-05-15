import {
  type TagElement,
  type TagValidator,
  type ValidatorContext,
  defineTagValidators,
} from '@reteps/tree-sitter-htmlmustache/linter';

import { isBooleanValue, isFalseValue } from './htmlmustache-plugin-utils.ts';

const plAnswerAttributes = new Set(['correct', 'feedback', 'score']);
const numberRegex = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function hasLiteralFalseAttribute(element: TagElement, attribute: string): boolean {
  const value = element.getLiteralAttribute(attribute);
  return value !== undefined && isFalseValue(value);
}

function requireDropdownDisplay(element: TagElement, context: ValidatorContext, attribute: string) {
  if (!element.hasAttribute(attribute)) return;
  const display = element.getLiteralAttribute('display');
  if (!element.hasAttribute('display') || (display !== undefined && display !== 'dropdown')) {
    context.reportAttribute(
      element,
      attribute,
      `pl-multiple-choice: if using ${attribute}, you must also set display to "dropdown".`,
    );
  }
}

function requireEnabledAotaNota(
  element: TagElement,
  context: ValidatorContext,
  feedbackAttribute: string,
  matchingAttribute: string,
) {
  if (!element.hasAttribute(feedbackAttribute)) return;
  const matchingValue = element.getLiteralAttribute(matchingAttribute);
  if (
    !element.hasAttribute(matchingAttribute) ||
    (matchingValue !== undefined && isFalseValue(matchingValue))
  ) {
    context.reportAttribute(
      element,
      feedbackAttribute,
      `pl-multiple-choice: if using ${feedbackAttribute}, you must also use ${matchingAttribute}.`,
    );
  }
}

function validateAnswerAttributeValue(
  child: TagElement,
  context: ValidatorContext,
  attribute: string,
) {
  const value = child.getLiteralAttribute(attribute);
  if (value === undefined) return;

  if (attribute === 'correct' && !isBooleanValue(value)) {
    context.reportAttribute(child, attribute, '"correct" on pl-answer must be a boolean value.');
  }

  if (attribute === 'score') {
    if (value === true || !numberRegex.test(value) || Number(value) < 0 || Number(value) > 1) {
      context.reportAttribute(
        child,
        attribute,
        '"score" on pl-answer must be in the range [0.0, 1.0].',
      );
    }
  }
}

export const validators: TagValidator[] = defineTagValidators('pl-multiple-choice', {
  'pl/multiple-choice-child-tags'(element, context) {
    for (const child of element.childrenWithoutTag('pl-answer')) {
      context.reportElement(child, 'pl-multiple-choice only allows <pl-answer> children.');
    }
  },

  'pl/multiple-choice-requires-answer'(element, context) {
    if (
      !element.hasAttribute('external-json') &&
      element.childrenWithTag('pl-answer').length === 0
    ) {
      context.reportElement(
        element,
        'pl-multiple-choice element must have at least 1 answer choice.',
      );
    }
  },

  'pl/multiple-choice-order'(element, context) {
    if (element.hasAttribute('fixed-order') && element.hasAttribute('order')) {
      context.reportAttribute(
        element,
        'fixed-order',
        'Setting answer choice order should be done with the "order" attribute.',
      );
    }
  },

  'pl/multiple-choice-display'(element, context) {
    if (element.hasAttribute('inline') && element.hasAttribute('display')) {
      context.reportAttribute(
        element,
        'inline',
        "Cannot set both 'display' and 'inline' attributes. Use only 'display'; the 'inline' attribute is deprecated.",
      );
    }

    requireDropdownDisplay(element, context, 'size');
    requireDropdownDisplay(element, context, 'placeholder');
  },

  'pl/multiple-choice-aota-nota-feedback'(element, context) {
    requireEnabledAotaNota(element, context, 'all-of-the-above-feedback', 'all-of-the-above');
    requireEnabledAotaNota(element, context, 'none-of-the-above-feedback', 'none-of-the-above');
  },

  'pl/multiple-choice-builtin-grading'(element, context) {
    if (hasLiteralFalseAttribute(element, 'builtin-grading')) {
      if (element.hasAttribute('weight')) {
        context.reportAttribute(
          element,
          'weight',
          '"weight" should not be set when builtin-grading is false.',
        );
      }
      if (element.hasAttribute('hide-score-badge')) {
        context.reportAttribute(
          element,
          'hide-score-badge',
          '"hide-score-badge" should not be set when builtin-grading is false.',
        );
      }
      for (const attribute of ['all-of-the-above', 'none-of-the-above']) {
        const value = element.getLiteralAttribute(attribute);
        if (value !== undefined && !isBooleanValue(value)) {
          context.reportAttribute(
            element,
            attribute,
            `"${attribute}" should be set to true or false when builtin-grading is false.`,
          );
        }
      }
    }
  },

  'pl/multiple-choice-answer-attributes'(element, context) {
    for (const child of element.childrenWithTag('pl-answer')) {
      for (const attribute of Object.keys(child.attributes)) {
        if (!plAnswerAttributes.has(attribute)) {
          context.reportAttribute(
            child,
            attribute,
            `Unknown attribute "${attribute}" on <pl-answer>.`,
          );
          continue;
        }
        validateAnswerAttributeValue(child, context, attribute);
      }
    }
  },

  'pl/multiple-choice-builtin-grading-answer'(element, context) {
    if (!hasLiteralFalseAttribute(element, 'builtin-grading')) {
      return;
    }

    for (const child of element.childrenWithTag('pl-answer')) {
      if (child.hasAttribute('score')) {
        context.reportAttribute(
          child,
          'score',
          '"score" on pl-answer should not be set when builtin-grading is false.',
        );
      }
      if (child.hasAttribute('feedback')) {
        context.reportAttribute(
          child,
          'feedback',
          '"feedback" on pl-answer should not be set when builtin-grading is false.',
        );
      }
    }
  },

  'pl/multiple-choice-unique-answer-html': {
    options: { includeInnerHtml: true },
    validate(element, context) {
      const seen = new Set<string>();
      for (const child of element.childrenWithTag('pl-answer')) {
        const normalized = (child.innerHtml ?? '').trim();
        if (seen.has(normalized)) {
          context.reportElement(child, `duplicate child inner HTML "${normalized}"`);
          continue;
        }
        seen.add(normalized);
      }
    },
  },
});
