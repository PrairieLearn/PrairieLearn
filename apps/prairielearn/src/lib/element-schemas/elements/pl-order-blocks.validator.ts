import {
  type TagElement,
  type TagValidator,
  type ValidatorContext,
  attr,
  defineTagValidators,
} from '@prairielearn/tree-sitter-htmlmustache/linter';

import { BOOLEAN_TRUE_VALUES, isFalseValue } from '../htmlmustache-plugin-utils.ts';

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
const SPEC_CHAR_STR = '*&^$@!~[]{}()|:@?/\\';

interface AnswerEntry {
  answer: TagElement;
  group?: TagElement;
  groupKey?: string;
}

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

function optionalLiteralTrimmedStringAttribute(
  element: TagElement,
  attribute: string,
): string | undefined {
  const value = optionalLiteralStringAttribute(element, attribute);
  return value?.trim();
}

function answerEntries(element: TagElement): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  for (const child of element.children) {
    if (child.tag === 'pl-answer') {
      entries.push({ answer: child });
    } else if (child.tag === 'pl-block-group') {
      const groupTag = optionalLiteralTrimmedStringAttribute(child, 'tag');
      const groupDepends = optionalLiteralStringAttribute(child, 'depends') ?? '';
      const groupKey =
        groupTag === undefined
          ? undefined
          : JSON.stringify({
              tag: groupTag,
              depends: groupDepends
                ? groupDepends.split(',').map((dependency) => dependency.trim())
                : [],
            });
      for (const answer of child.childrenWithTag('pl-answer')) {
        entries.push({ answer, group: child, groupKey });
      }
    }
  }
  return entries;
}

function allAnswers(element: TagElement): TagElement[] {
  return answerEntries(element).map((entry) => entry.answer);
}

function hasOptionalBlocks(element: TagElement): boolean {
  return element.children.some((child) => {
    if (child.tag !== 'pl-answer' && child.tag !== 'pl-block-group') return false;
    const depends = attr(child, 'depends').literal();
    return typeof depends === 'string' && depends.includes('|');
  });
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
  for (const child of allAnswers(element)) {
    const tag = attr(child, 'tag').literal();
    if (typeof tag !== 'string') continue;
    const trimmedTag = tag.trim();
    if ([...trimmedTag].some((char) => TAG_SPECIAL_CHARACTERS.has(char))) {
      context.reportAttribute(
        child,
        'tag',
        `<pl-answer tag="${trimmedTag}"> tag attribute may not contain special characters: "${SPEC_CHAR_STR}"`,
      );
    }
  }
}

function isDefinitelyCorrectAnswer(answer: TagElement): boolean {
  if (!attr(answer, 'correct').present()) return true;
  return isLiteralTrueAttribute(answer, 'correct');
}

function hasPossibleCorrectAnswer(answer: TagElement): boolean {
  return !isLiteralFalseAttribute(answer, 'correct');
}

function validateAnswerRelationships(element: TagElement, context: ValidatorContext) {
  const usedTags = new Set<string>();
  const usedGroups = new Set<string>();
  const distractorTags = new Set(
    allAnswers(element)
      .map((answer) => attr(answer, 'distractor-for').literal())
      .filter((value): value is string => typeof value === 'string'),
  );

  for (const { answer, group, groupKey } of answerEntries(element)) {
    const answerTag = optionalLiteralTrimmedStringAttribute(answer, 'tag');
    const isCorrect = isDefinitelyCorrectAnswer(answer);

    if (isCorrect && answerTag !== undefined) {
      if (usedTags.has(answerTag)) {
        context.reportAttribute(
          answer,
          'tag',
          `Tag "${answerTag}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.`,
        );
      }
      usedTags.add(answerTag);

      if (isLiteralTrueAttribute(answer, 'initially-placed') && distractorTags.has(answerTag)) {
        context.reportAttribute(
          answer,
          'initially-placed',
          'A block with distractors cannot be initially placed.',
        );
      }
    } else if (
      isLiteralFalseAttribute(answer, 'correct') &&
      isLiteralTrueAttribute(answer, 'initially-placed')
    ) {
      context.reportAttribute(
        answer,
        'initially-placed',
        'Incorrect blocks cannot be initially placed.',
      );
    }

    const groupTag = group ? optionalLiteralTrimmedStringAttribute(group, 'tag') : undefined;
    if (group && groupTag !== undefined && groupKey !== undefined) {
      if (usedTags.has(groupTag) && !usedGroups.has(groupKey)) {
        context.reportAttribute(
          group,
          'tag',
          `Tag "${groupTag}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.`,
        );
      }
      usedTags.add(groupTag);
      usedGroups.add(groupKey);
    }
  }
}

export const validators: TagValidator[] = defineTagValidators('pl-order-blocks', {
  'pl/order-blocks-children'(element, context) {
    if (allAnswers(element).length === 0) {
      context.reportElement(element, '<pl-order-blocks> must have at least 1 answer block.');
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
        'code-language attribute may only be used with format="code"',
      );
    }

    if (
      partialCredit !== undefined &&
      partialCredit !== 'none' &&
      !LCS_GRADABLE_METHODS.has(gradingMethod)
    ) {
      context.reportAttribute(
        element,
        'partial-credit',
        'You may only specify partial credit options in the DAG, ordered, and ranking grading modes.',
      );
    }

    if (feedback !== 'none' && !FEEDBACK_METHODS.has(gradingMethod)) {
      context.reportAttribute(
        element,
        'feedback',
        `feedback type ${feedback} is not available with the ${gradingMethod} grading-method.`,
      );
    }

    const displayBlocks = literalStringAttribute(element, 'display-blocks', 'vertical');
    if (
      (isLiteralTrueAttribute(element, 'inline') ||
        displayBlocks === 'inline-wrap' ||
        displayBlocks === 'inline-nowrap') &&
      isLiteralTrueAttribute(element, 'indentation')
    ) {
      context.reportAttribute(
        element,
        'indentation',
        'The indentation attribute may not be used when display-blocks is set to "inline-wrap" or "inline-nowrap".',
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

  'pl/order-blocks-correct-answer'(element, context) {
    const gradingMethod = literalStringAttribute(element, 'grading-method', 'ordered');
    const answers = allAnswers(element);
    if (gradingMethod === 'external') return;
    if (answers.length === 0) return;
    if (answers.some((answer) => hasPossibleCorrectAnswer(answer))) return;

    context.reportElement(element, 'There are no correct answers specified for this question.');
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
          'The ordering-feedback attribute may only be used on blocks with correct=true.',
        );
      }
    }

    validateTagCharacters(element, context);
    validateAnswerRelationships(element, context);
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
        'The min-incorrect or max-incorrect attribute may not exceed the number of incorrect <pl-answers>.',
      );
    }
    if (maxIncorrect !== undefined && maxIncorrect > incorrectAnswerCount) {
      context.reportAttribute(
        element,
        'max-incorrect',
        'The min-incorrect or max-incorrect attribute may not exceed the number of incorrect <pl-answers>.',
      );
    }
    if (minIncorrect !== undefined && maxIncorrect !== undefined && minIncorrect > maxIncorrect) {
      context.reportAttribute(
        element,
        'min-incorrect',
        'The attribute min-incorrect must be smaller than max-incorrect.',
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
        "Use of optional lines requires 'final' attributes on all true <pl-answer> blocks that appears at the end of a valid ordering.",
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
