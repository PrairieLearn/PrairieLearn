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
      `"${attribute}" should only be set when display is "dropdown".`,
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
      `pl-multiple-choice: if using ${feedbackAttribute}, you must also use ${matchingAttribute}.`,
    );
  }
}

export const validators: TagValidator[] = defineTagValidators('pl-multiple-choice', {
  'pl/multiple-choice-requires-answer'(element, context) {
    if (
      !attr(element, 'external-json').present() &&
      element.childrenWithTag('pl-answer').length === 0
    ) {
      context.reportElement(
        element,
        'pl-multiple-choice element must have at least 1 answer choice.',
      );
    }
  },

  'pl/multiple-choice-order'(element, context) {
    if (attr(element, 'fixed-order').present() && attr(element, 'order').present()) {
      context.reportAttribute(
        element,
        'fixed-order',
        'Setting answer choice order should be done with the "order" attribute.',
      );
    }
  },

  'pl/multiple-choice-display'(element, context) {
    if (attr(element, 'inline').present() && attr(element, 'display').present()) {
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
    const builtinGrading = attr(element, 'builtin-grading').literal();
    if (builtinGrading === undefined || !isFalseValue(builtinGrading)) return;

    if (attr(element, 'weight').present()) {
      context.reportAttribute(
        element,
        'weight',
        '"weight" should not be set when builtin-grading is false.',
      );
    }
    if (attr(element, 'hide-score-badge').present()) {
      context.reportAttribute(
        element,
        'hide-score-badge',
        '"hide-score-badge" should not be set when builtin-grading is false.',
      );
    }
    for (const attribute of ['all-of-the-above', 'none-of-the-above']) {
      const value = attr(element, attribute).literal();
      if (value !== undefined && !isBooleanValue(value)) {
        context.reportAttribute(
          element,
          attribute,
          `"${attribute}" cannot use grading-specific values ("correct", "incorrect", or "random") when builtin-grading is false.`,
        );
      }
    }

    for (const child of element.childrenWithTag('pl-answer')) {
      if (attr(child, 'score').present()) {
        context.reportAttribute(
          child,
          'score',
          '"score" on pl-answer should not be set when builtin-grading is false.',
        );
      }
      if (attr(child, 'feedback').present()) {
        context.reportAttribute(
          child,
          'feedback',
          '"feedback" on pl-answer should not be set when builtin-grading is false.',
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
          'Score must be a numeric value in the range [0.0, 1.0].',
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
