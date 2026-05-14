export const BOOLEAN_TRUE_VALUES = [
  'true',
  't',
  '1',
  'True',
  'T',
  'TRUE',
  'yes',
  'y',
  'Yes',
  'Y',
  'YES',
];

export const BOOLEAN_FALSE_VALUES = [
  'false',
  'f',
  '0',
  'False',
  'F',
  'FALSE',
  'no',
  'n',
  'No',
  'N',
  'NO',
];

const BOOLEAN_VALUES = [...BOOLEAN_TRUE_VALUES, ...BOOLEAN_FALSE_VALUES];
const booleanValueSet = new Set(BOOLEAN_VALUES);
const booleanFalseValueSet = new Set(BOOLEAN_FALSE_VALUES);
const plFloatPattern = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const plAnswerAttributes = new Set(['correct', 'feedback', 'score']);

export const formats = {
  'pl-boolean': (value) => typeof value === 'string' && booleanValueSet.has(value),
  'pl-integer': (value) => typeof value === 'string' && /^-?\d+$/.test(value),
  'pl-float': (value) => typeof value === 'string' && plFloatPattern.test(value),
};

function hasAttribute(element, attribute) {
  return Object.hasOwn(element.attributes, attribute);
}

function isBooleanValue(value) {
  return value === true || booleanValueSet.has(value);
}

function isFalseValue(value) {
  return typeof value === 'string' && booleanFalseValueSet.has(value);
}

function report(context, element, message, attribute) {
  context.report({ element, attribute, message });
}

function requireDropdownDisplay(element, context, attribute) {
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

function requireEnabledAotaNota(element, context, feedbackAttribute, matchingAttribute) {
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

export const validators = [
  {
    id: 'pl/multiple-choice-child-tags',
    tags: ['pl-multiple-choice'],
    validate(element, context) {
      for (const child of element.children) {
        if (child.tag !== 'pl-answer') {
          report(context, child, 'pl-multiple-choice only allows <pl-answer> children.');
        }
      }
    },
  },
  {
    id: 'pl/multiple-choice-requires-answer',
    tags: ['pl-multiple-choice'],
    validate(element, context) {
      const answerChildren = element.children.filter((child) => child.tag === 'pl-answer');
      if (!hasAttribute(element, 'external-json') && answerChildren.length === 0) {
        report(context, element, 'pl-multiple-choice element must have at least 1 answer choice.');
      }
    },
  },
  {
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
  },
  {
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
  },
  {
    id: 'pl/multiple-choice-aota-nota-feedback',
    tags: ['pl-multiple-choice'],
    validate(element, context) {
      requireEnabledAotaNota(element, context, 'all-of-the-above-feedback', 'all-of-the-above');
      requireEnabledAotaNota(element, context, 'none-of-the-above-feedback', 'none-of-the-above');
    },
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    id: 'pl/multiple-choice-unique-answer-html',
    tags: ['pl-multiple-choice'],
    options: { includeInnerHtml: true },
    validate(element, context) {
      const answerChildren = element.children.filter((child) => child.tag === 'pl-answer');
      const seen = new Set();
      for (const child of answerChildren) {
        const normalized = (child.innerHtml ?? '').trim();
        if (seen.has(normalized)) {
          report(context, child, `duplicate child inner HTML "${normalized}"`);
          continue;
        }
        seen.add(normalized);
      }
    },
  },
];
