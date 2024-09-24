import * as parse5 from 'parse5';

const htmlGlobalAttributes = [
  'accesskey',
  'class',
  'contenteditable',
  'data-*',
  'dir',
  'draggable',
  'enterkeyhint',
  'hidden',
  'id',
  'inert',
  'inputmode',
  'lang',
  'popover',
  'spellcheck',
  'style',
  'tabindex',
  'title',
  'translate',
];

const mustacheTemplateRegex = /^\{\{.*\}\}$/;

/**
 * Checks that the required property is an int (or mustache template) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param errors The list of errors to add to.
 */
function assertInt(tag: string, key: string, val: string, errors: string[]) {
  if (!(/^\d+$/.test(val) || mustacheTemplateRegex.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be an integer, but value provided is "${val}"`,
    );
  }
}

/**
 * Checks that the required property is an float (or mustache template) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param errors The list of errors to add to.
 */
function assertFloat(tag: string, key: string, val: string, errors: string[]) {
  if (!(/^(\d+)\.?(\d*)(e-\d+)?$/.test(val) || mustacheTemplateRegex.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be an floating-point number, but value provided is "${val}"`,
    );
  }
}

/**
 * Checks that the required property is in a list of possibilities (or mustache template) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param choices The list of potential choices for the property.
 * @param errors The list of errors to add to.
 */
function assertInChoices(
  tag: string,
  key: string,
  val: string,
  choices: string[],
  errors: string[],
) {
  if (!(choices.includes(val) || mustacheTemplateRegex.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be in ${choices}, but value provided is ${val}`,
    );
  }
}

/**
 * Checks that the required property is a boolean (or mustache template) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param choices The list of potential choices for the property.
 * @param errors The list of errors to add to.
 */
function assertBool(tag: string, key: string, val: string, errors: string[]) {
  assertInChoices(
    tag,
    key,
    val,
    [
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
    ],
    errors,
  );
}

/**
 * Checks that a tag has valid properties.
 * @param ast The tree to consider, rooted at the tag.
 * @returns The list of errors for the tag, if any.
 */
function checkTag(ast: any, optimistic: boolean): string[] {
  switch (ast.tagName) {
    case 'pl-multiple-choice':
      return checkMultipleChoice(ast);
    case 'pl-integer-input':
      return checkIntegerInput(ast);
    case 'pl-number-input':
      return checkNumericalInput(ast);
    case 'pl-string-input':
      return checkStringInput(ast);
    case 'pl-checkbox':
      return checkCheckbox(ast);
    case 'pl-question-panel':
      return [];
    case 'pl-answer':
      return []; //covered elsewhere
    default:
      if (ast.tagName && ast.tagName.substring(0, 3) === 'pl-' && !optimistic) {
        return [
          `${ast.tagName} is not a valid tag. Please use tags from the following: \`pl-question-panel\`, \`pl-multiple-choice\`, \`pl-checkbox\`, \`pl-integer-input\`, \`pl-number-input\`,\`pl-string-input\``,
        ];
      }
  }
  return [];
}

/**
 * Checks that a `pl-multiple-choice` element has valid properties.
 * @param ast The tree to consider, rooted at the tag.
 * @returns The list of errors for the tag, if any.
 */
function checkMultipleChoice(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let displayDropdown = false;
  let usedAllOfTheAbove = false;
  let usedNoneOfTheAbove = false;
  let usedAllOfTheAboveFeedback = false;
  let usedNoneOfTheAboveFeedback = false;
  let usedSize = false;
  const optionsOfTheAbove = ['false', 'random', 'correct', 'incorrect'];
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
        assertInt('pl-multiple-choice', key, val, errors);
        break;
      case 'display':
        assertInChoices('pl-multiple-choice', key, val, ['block', 'inline', 'dropdown'], errors);
        if (val === 'dropdown') {
          displayDropdown = true;
        }
        break;
      case 'number-answers':
        assertInt('pl-multiple-choice', key, val, errors);
        break;
      case 'order':
        assertInChoices(
          'pl-multiple-choice',
          key,
          val,
          ['random', 'ascend', 'descend', 'fixed'],
          errors,
        );
        break;
      case 'hide-letter-keys':
        assertBool('pl-multiple-choice', key, val, errors);
        break;
      case 'all-of-the-above':
        assertInChoices('pl-multiple-choice', key, val, optionsOfTheAbove, errors);
        if (optionsOfTheAbove.includes(val) && val !== 'false') {
          usedAllOfTheAbove = true;
        }
        break;
      case 'none-of-the-above':
        assertInChoices('pl-multiple-choice', key, val, optionsOfTheAbove, errors);
        if (optionsOfTheAbove.includes(val) && val !== 'false') {
          usedNoneOfTheAbove = true;
        }
        break;
      case 'all-of-the-above-feedback':
        usedAllOfTheAboveFeedback = true;
        break;
      case 'none-of-the-above-feedback':
        usedNoneOfTheAboveFeedback = true;
        break;
      case 'allow-blank':
        assertBool('pl-multiple-choice', key, val, errors);
        break;
      case 'size':
        usedSize = true;
        assertInt('pl-multiple-choice', key, val, errors);
        break;
      default:
        if (!htmlGlobalAttributes.includes(key)) {
          errors.push(`pl-multiple-choice: ${key} is not a valid property.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('pl-multiple-choice: answers-name is a required property.');
  }
  if (!usedAllOfTheAbove && usedAllOfTheAboveFeedback) {
    errors.push(
      'pl-multiple-choice: if using all-of-the-above-feedback, you must also use all-of-the-above.',
    );
  }
  if (!usedNoneOfTheAbove && usedNoneOfTheAboveFeedback) {
    errors.push(
      'pl-multiple-choice: if using none-of-the-above-feedback, you must also use none-of-the-above.',
    );
  }
  if (!displayDropdown && usedSize) {
    errors.push('pl-multiple-choice: if using size, you must also use set display to "dropdown".');
  }

  let errorsChildren: string[] = [];
  for (const child of ast.childNodes) {
    if (child.tagName) {
      if (child.tagName === 'pl-answer') {
        errorsChildren = errorsChildren.concat(checkAnswerMultipleChoice(child));
      } else {
        errorsChildren.push(`pl-multiple-choice: ${child.tagName} is not a valid child tag.`);
      }
    }
  }

  return errors.concat(errorsChildren);
}

/**
 * Checks that a `pl-integer-input` element has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkIntegerInput(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
      case 'blank-answer':
      case 'size':
        assertInt('pl-integer-input', key, val, errors);
        break;
      //string inputs are valid as strings, and these don't affect other tags, so no validation required
      case 'correct-answer':
      case 'label':
      case 'suffix':
      case 'placeholder':
        break;
      case 'allow-blank':
      case 'show-help-text':
      case 'show-score':
        assertBool('pl-integer-input', key, val, errors);
        break;
      case 'base':
        //todo: validate that correct-answer is the right base
        assertInt('pl-integer-input', key, val, errors);
        break;
      case 'display':
        assertInChoices('pl-integer-input', key, val, ['block', 'inline'], errors);
        break;
      default:
        if (!htmlGlobalAttributes.includes(key)) {
          errors.push(`pl-integer-input: ${key} is not a valid property.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('pl-integer-input: answers-name is a required property.');
  }
  return errors;
}

/**
 * Checks that a `pl-number-input` element has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkNumericalInput(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let usedRelabs = true;
  let usedRtol = false;
  let usedAtol = false;
  let usedDigits = false;
  let allowsBlank = false;
  let usedBlankValue = false;

  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
      case 'size':
        assertInt('pl-number-input', key, val, errors);
        break;
      case 'correct-answer':
        assertFloat('pl-number-input', key, val, errors);
        break;
      case 'label':
      case 'suffix':
      case 'placeholder':
      case 'custom-format':
        break;
      case 'display':
        assertInChoices('pl-number-input', key, val, ['block', 'inline'], errors);
        break;
      case 'comparison':
        assertInChoices('pl-number-input', key, val, ['relabs', 'sigfig', 'decdig'], errors);
        if (val !== 'relabs') {
          usedRelabs = false;
        }
        break;
      case 'rtol':
        assertFloat('pl-number-input', key, val, errors);
        usedRtol = true;
        break;
      case 'atol':
        assertFloat('pl-number-input', key, val, errors);
        usedAtol = true;
        break;
      case 'digits':
        assertInt('pl-number-input', key, val, errors);
        usedDigits = true;
        break;
      case 'allow-complex':
      case 'show-correct-answer':
      case 'allow-fractions':
      case 'show-help-text':
        assertBool('pl-number-input', key, val, errors);
        break;
      case 'allow-blank':
        assertBool('pl-number-input', key, val, errors);
        if (val !== 'false') {
          allowsBlank = true;
        }
        break;
      case 'blank-value':
        usedBlankValue = true;
        break;
      default:
        if (!htmlGlobalAttributes.includes(key)) {
          errors.push(`pl-number-input: ${key} is not a valid property.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('pl-number-input: answers-name is a required property.');
  }
  if ((usedRtol || usedAtol) && !usedRelabs) {
    errors.push(
      'pl-number-input: comparison modes decdigs and sigfigs use digits, not rtol or atol.',
    );
  }
  if (usedDigits && usedRelabs) {
    errors.push('pl-number-input: comparison mode relabs uses rtol and atol, not digits.');
  }
  if (usedBlankValue && !allowsBlank) {
    errors.push('pl-number-input: you must set allow-blank to true to use blank-value.');
  }
  return errors;
}

/**
 * Checks that a `pl-answer` element in a multiple choice tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkAnswerMultipleChoice(ast: any): string[] {
  const errors: string[] = [];
  for (const attr of ast.attrs) {
    switch (attr.name) {
      case 'correct':
        assertBool('pl-answer (for pl-multiple-choice)', attr.name, attr.value, errors);
        break;
      case 'feedback':
        break;
      case 'score':
        assertFloat('pl-answer (for pl-multiple-choice)', attr.name, attr.value, errors);
        break;
      default:
        if (!htmlGlobalAttributes.includes(attr.name)) {
          errors.push(`pl-answer (for pl-multiple-choice): ${attr.name} is not a valid property.`);
        }
    }
  }
  return errors;
}

/**
 * Checks that a `pl-string-input` element has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkStringInput(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let usedCorrectAnswer = false;
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
      case 'size':
        assertInt('pl-string-input', key, val, errors);
        break;
      case 'correct-answer':
        usedCorrectAnswer = true;
        break;
      case 'label':
      case 'suffix':
      case 'placeholder':
        break;
      case 'display':
        assertInChoices('pl-string-input', key, val, ['block', 'inline'], errors);
        break;
      case 'remove-leading-trailing':
      case 'remove-spaces':
      case 'allow-blank':
      case 'ignore-case':
      case 'normalize-to-ascii':
      case 'show-help-text':
        assertBool('pl-string-input', key, val, errors);
        break;
      default:
        if (!htmlGlobalAttributes.includes(attr.name)) {
          errors.push(`pl-string-input: ${attr.name} is not a valid property.`);
        }
    }
  }
  if (usedAnswersName === usedCorrectAnswer) {
    errors.push('pl-string-input: exactly one of answers-name and correct-answer should be set.');
  }
  return errors;
}

function checkCheckbox(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let usedPartialCredit = true;
  let usedPartialCreditMethod = false;
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
      case 'number-answers':
      case 'min-correct':
      case 'max-correct':
      case 'min-select':
      case 'max-select':
        assertInt('pl-checkbox', key, val, errors);
        break;
      case 'inline':
      case 'fixed-order':
      case 'hide-help-text':
      case 'detailed-help-text':
      case 'hide-answer-panel':
      case 'hide-score-badge':
        assertBool('pl-checkbox', key, val, errors);
        break;

      case 'partial-credit':
        assertBool('pl-checkbox', key, val, errors);
        if (['false', 'f', '0', 'False', 'F', 'FALSE', 'no', 'n', 'No', 'N', 'NO'].includes(val)) {
          usedPartialCredit = false;
        }
        break;
      case 'partial-credit-method':
        assertInChoices('pl-checkbox', key, val, ['COV', 'EDC', 'PC'], errors);
        usedPartialCreditMethod = true;
        break;
      default:
        if (!htmlGlobalAttributes.includes(key)) {
          errors.push(`pl-checkbox: ${key} is not a valid property.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('pl-checkbox: answers-name is a required property.');
  }
  if (usedPartialCreditMethod && !usedPartialCredit) {
    errors.push(
      'pl-checkbox: if partial-credit-method is set, then partial-credit must be set to true.',
    );
  }
  return errors;
}

/**
 * Optimistically checks the entire parse tree for errors in common PL tags recursively.
 * @param ast The tree to consider.
 * @returns A list of human-readable error messages, if any.
 */
function dfsCheckParseTree(ast: any, optimistic: boolean): string[] {
  let errors = checkTag(ast, optimistic);
  if (ast.childNodes) {
    for (const child of ast.childNodes) {
      errors = errors.concat(dfsCheckParseTree(child, optimistic));
    }
  }

  return errors;
}

/**
 * Checks for errors in common PL elements in an index.html file.
 * @param file The raw text of the file to use.
 * @returns A list of human-readable render error messages, if any.
 */
export function validateHTML(file: string, optimistic: boolean): string[] {
  const tree = parse5.parseFragment(file);
  return dfsCheckParseTree(tree, optimistic);
}
