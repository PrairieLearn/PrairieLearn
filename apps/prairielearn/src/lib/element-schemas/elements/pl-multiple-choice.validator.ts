import {
  type TagElement,
  type TagValidator,
  type ValidatorContext,
  attr,
  defineTagValidators,
} from '@prairielearn/tree-sitter-htmlmustache/linter';

import { isBooleanValue, isFalseValue } from '../htmlmustache-plugin-utils.ts';

function requireDropdownDisplay(element: TagElement, context: ValidatorContext, attribute: string) {
  if (!attr(element, attribute).present()) return;
  const display = attr(element, 'display').literal();
  if (!attr(element, 'display').present() || (display !== undefined && display !== 'dropdown')) {
    context.reportAttribute(
      element,
      attribute,
      `Attribute "${attribute}" on <pl-multiple-choice> is only allowed when "display" is "dropdown".`,
    );
  }
}

function requireEnabledAotaNota(
  element: TagElement,
  context: ValidatorContext,
  feedbackAttribute: string,
  matchingAttribute: string,
) {
  if (!attr(element, feedbackAttribute).present()) return;
  const matchingValue = attr(element, matchingAttribute).literal();
  if (
    !attr(element, matchingAttribute).present() ||
    (matchingValue !== undefined && isFalseValue(matchingValue))
  ) {
    context.reportAttribute(
      element,
      feedbackAttribute,
      `Attribute "${feedbackAttribute}" on <pl-multiple-choice> is only allowed when "${matchingAttribute}" is enabled.`,
    );
  }
}

export const validators: TagValidator[] = defineTagValidators('pl-multiple-choice', {
  'pl/multiple-choice-requires-answer'(element, context) {
    if (
      !attr(element, 'external-json').present() &&
      element.childrenWithTag('pl-answer').length === 0
    ) {
      context.reportElement(element, '<pl-multiple-choice> must have at least 1 answer choice.');
    }
  },

  'pl/multiple-choice-order'(element, context) {
    if (attr(element, 'fixed-order').present() && attr(element, 'order').present()) {
      context.reportAttribute(
        element,
        'fixed-order',
        'Attributes "order" and "fixed-order" on <pl-multiple-choice> cannot be set together. Use "order".',
      );
    }
  },

  'pl/multiple-choice-display'(element, context) {
    if (attr(element, 'inline').present() && attr(element, 'display').present()) {
      context.reportAttribute(
        element,
        'inline',
        'Attributes "display" and "inline" on <pl-multiple-choice> cannot be set together. Use "display"; "inline" is deprecated.',
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
    const builtinGrading = attr(element, 'builtin-grading').literal();
    if (builtinGrading === undefined || !isFalseValue(builtinGrading)) return;

    if (attr(element, 'weight').present()) {
      context.reportAttribute(
        element,
        'weight',
        'Attribute "weight" on <pl-multiple-choice> is only allowed when "builtin-grading" is true.',
      );
    }
    if (attr(element, 'hide-score-badge').present()) {
      context.reportAttribute(
        element,
        'hide-score-badge',
        'Attribute "hide-score-badge" on <pl-multiple-choice> is only allowed when "builtin-grading" is true.',
      );
    }
    for (const attribute of ['all-of-the-above', 'none-of-the-above']) {
      const value = attr(element, attribute).literal();
      if (value !== undefined && !isBooleanValue(value)) {
        context.reportAttribute(
          element,
          attribute,
          `Attribute "${attribute}" on <pl-multiple-choice> cannot use the grading values "correct", "incorrect", or "random" when "builtin-grading" is false.`,
        );
      }
    }

    for (const child of element.childrenWithTag('pl-answer')) {
      if (attr(child, 'score').present()) {
        context.reportAttribute(
          child,
          'score',
          'Attribute "score" on <pl-answer> inside <pl-multiple-choice> is only allowed when "builtin-grading" is true.',
        );
      }
      if (attr(child, 'feedback').present()) {
        context.reportAttribute(
          child,
          'feedback',
          'Attribute "feedback" on <pl-answer> inside <pl-multiple-choice> is only allowed when "builtin-grading" is true.',
        );
      }
    }
  },

  'pl/multiple-choice-answer-score-range'(element, context) {
    for (const child of element.childrenWithTag('pl-answer')) {
      const score = attr(child, 'score').literal();
      if (typeof score !== 'string') continue;

      const parsedScore = Number(score);
      if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 1) {
        context.reportAttribute(
          child,
          'score',
          'Attribute "score" on <pl-answer> inside <pl-multiple-choice> must be a number in the range [0.0, 1.0].',
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
          context.reportElement(
            child,
            `<pl-multiple-choice> has a duplicate answer choice: "${normalized}".`,
          );
          continue;
        }
        seen.add(normalized);
      }
    },
  },
});
