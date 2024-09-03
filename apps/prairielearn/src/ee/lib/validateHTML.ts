import * as parse5 from 'parse5';

const HTML_GLOBAL_TAGS = [
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

/**
 * Checks that the required property is an int (or property to be inserted) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param errors The list of errors to add to.
 */
function assertInt(tag: string, key: string, val: string, errors: string[]) {
  if (!(/^\d+$/.test(val) || /^\{\{.*\}\}$/.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be an integer, but value provided is "${val}"`,
    );
  }
}

/**
 * Checks that the required property is an float (or property to be inserted) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param errors The list of errors to add to.
 */
function assertFloat(tag: string, key: string, val: string, errors: string[]) {
  if (!(/^(\d+)\.?(\d*)(e-\d+)?$/.test(val) || /^\{\{.*\}\}$/.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be an floating-point number, but value provided is "${val}"`,
    );
  }
}

/**
 * Checks that the required property is in a list of possibilities (or property to be inserted) or adds an error to the provided list.
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
  if (!(choices.includes(val) || /^\{\{.*\}\}$/.test(val))) {
    errors.push(
      `${tag}: value for attribute ${key} must be in ${choices}, but value provided is ${val}`,
    );
  }
}

/**
 * Checks that the required property is a boolean (or property to be inserted) or adds an error to the provided list.
 * @param tag The name of the tag being checked.
 * @param key The property name.
 * @param val The property value.
 * @param choices The list of potential choices for the property.
 * @param errors The list of errors to add to.
 */
function assertBool(tag: string, key: string, val: string, errors: string[]) {
  assertInChoices(tag, key, val, ['true', 'false'], errors);
}

/**
 * Checks that a tag has valid properties.
 * @param ast The tree to consider, rooted at the tag.
 * @returns The list of errors for the tag, if any.
 */
function checkTag(ast: any): string[] {
  switch (ast.tagName) {
    case 'pl-multiple-choice':
      return checkMC(ast);
    case 'pl-integer-input':
      return checkInt(ast);
    case 'pl-number-input':
      return checkNum(ast);
    case 'pl-answer':
      return checkMCAnswer(ast);
    case 'pl-overlay':
      return checkOverlay(ast);
    case 'pl-location':
      return checkLocation(ast);
    case 'pl-order-blocks':
      return checkOrderBlocks(ast);
    case 'pl-matrix-input':
      return checkMatrix(ast);
  }
  return [];
}

/**
 * Checks that a multiple choice question tag has valid properties.
 * @param ast The tree to consider, rooted at the tag.
 * @returns The list of errors for the tag, if any.
 */
function checkMC(ast: any): string[] {
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
        if (!HTML_GLOBAL_TAGS.includes(key)) {
          errors.push(`${key} is not a valid property for pl-multiple-choice.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('answers-name is a required property for pl-multiple-choice tags.');
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
  return errors;
}

/**
 * Checks that an integer answer question tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkInt(ast: any): string[] {
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
        if (!HTML_GLOBAL_TAGS.includes(key)) {
          errors.push(`${key} is not a valid property for pl-integer-input.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('answers-name is a required property for pl-integer-input tags.');
  }
  return errors;
}

/**
 * Checks that a numerical answer question tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkNum(ast: any): string[] {
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
        if (!HTML_GLOBAL_TAGS.includes(key)) {
          errors.push(`${key} is not a valid property for pl-number-input.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('answers-name is a required property for pl-number-input tags.');
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
 * Checks that an potential multiple choice answer tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkMCAnswer(ast: any): string[] {
  const errors: string[] = [];
  for (const attr of ast.attrs) {
    switch (attr.name) {
      case 'correct':
        assertBool('pl-answer', attr.name, attr.value, errors);
        break;
      case 'feedback':
        break;
      case 'ranking':
      case 'indent':
        assertInt('pl-answer', attr.name, attr.val, errors);
        break;
      case 'depends':
      case 'tag':
      case 'distractor-for':
      case 'distractor-feedback':
        break;
      default:
        if (!HTML_GLOBAL_TAGS.includes(attr.name)) {
          errors.push(`${attr.name} is not a valid property for pl-answer.`);
        }
    }
  }
  return errors;
}

/**
 * Checks that an potential overlay tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkOverlay(ast: any): string[] {
  const errors: string[] = [];
  for (const attr of ast.attrs) {
    switch (attr.name) {
      case 'width':
      case 'height':
        assertFloat('pl-overlay', attr.name, attr.value, errors);
        break;
      case 'clip':
        assertBool('pl-overlay', attr.name, attr.value, errors);
        break;
      default:
        if (!HTML_GLOBAL_TAGS.includes(attr.name)) {
          errors.push(`${attr.name} is not a valid property for pl-overlay.`);
        }
    }
  }
  return errors;
}

/**
 * Checks that an location tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkLocation(ast: any): string[] {
  const errors: string[] = [];
  for (const attr of ast.attrs) {
    switch (attr.name) {
      case 'left':
      case 'right':
      case 'top':
      case 'bottom':
        assertFloat('pl-location', attr.name, attr.value, errors);
        break;
      case 'valign':
        assertInChoices('pl-location', attr.name, attr.value, ['top', 'middle', 'bottom'], errors);
        break;
      case 'halign':
        assertInChoices('pl-location', attr.name, attr.value, ['left', 'center', 'right'], errors);
        break;
      default:
        if (!HTML_GLOBAL_TAGS.includes(attr.name)) {
          errors.push(`${attr.name} is not a valid property for pl-location.`);
        }
    }
  }
  return errors;
}

/**
 * Checks that a order blocks question tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkOrderBlocks(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let usedDagRanking = false;
  let usedFeedback = false;
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
      case 'max-incorrect':
      case 'min-incorrect':
        assertInt('pl-order-blocks', key, val, errors);
        break;
      case 'grading-method':
        assertInChoices(
          'pl-order-blocks',
          key,
          val,
          ['ordered', 'unordered', 'ranking', 'dag', 'external'],
          errors,
        );
        if (val === 'ranking' || val === 'dag') {
          usedDagRanking = true;
        }
        break;
      case 'allow-blank':
      case 'indent':
      case 'inline':
        assertBool('pl-order-blocks', key, val, errors);
        break;
      case 'file-name':
      case 'source-header':
      case 'solution-header':
      case 'code-language':
        break;
      case 'source-blocks-order':
        assertInChoices('pl-order-blocks', key, val, ['random', 'ordered', 'alphabetized'], errors);
        break;
      case 'solution-placement':
        assertInChoices('pl-order-blocks', key, val, ['right', 'bottom'], errors);
        break;
      case 'partial-credit':
        assertInChoices('pl-order-blocks', key, val, ['none', 'lcs'], errors);
        break;
      case 'feedback':
        assertInChoices(
          'pl-order-blocks',
          key,
          val,
          ['none', 'first-wrong', 'first-wrong-verbose'],
          errors,
        );
        if (val === 'first-wrong' || val === 'first-wrong-verbose') {
          usedFeedback = true;
        }
        break;
      case 'format':
        assertInChoices('pl-order-blocks', key, val, ['code', 'default'], errors);
        break;
      default:
        if (!HTML_GLOBAL_TAGS.includes(attr.name)) {
          errors.push(`${attr.name} is not a valid property for pl-order-blocks.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('answers-name is a required property for pl-order-blocks tags.');
  }
  if (usedFeedback && !usedDagRanking) {
    errors.push(
      'pl-order-blocks: if property "feedback" is "first-wrong" or "first-wrong-verbose", then "grading-method" must be "ranking" or "dag".',
    );
  }
  return errors;
}

/**
 * Checks that a matrix question tag has valid properties.
 * @param ast The tree to consider, rooted at the tag to consider.
 * @returns The list of errors for the tag, if any.
 */
function checkMatrix(ast: any): string[] {
  const errors: string[] = [];
  let usedAnswersName = false;
  let usedDigits = false;
  let usedAtol = false;
  let usedRtol = false;
  let usedRelabs = true;
  for (const attr of ast.attrs) {
    const key = attr.name;
    const val = attr.value;
    switch (key) {
      case 'answers-name':
        usedAnswersName = true;
        break;
      case 'weight':
        assertInt('pl-matrix-input', key, val, errors);
        break;
      case 'label':
        break;
      case 'comparison':
        assertInChoices('pl-matrix-input', key, val, ['relabs', 'sigfig', 'decdig'], errors);
        if (val !== 'relabs') {
          usedRelabs = false;
        }
        break;
      case 'rtol':
        assertFloat('pl-matrix-input', key, val, errors);
        usedRtol = true;
        break;
      case 'atol':
        assertFloat('pl-matrix-input', key, val, errors);
        usedAtol = true;
        break;
      case 'digits':
        assertInt('pl-matrix-input', key, val, errors);
        usedDigits = true;
        break;
      case 'allow-complex':
      case 'show-help-text':
        assertBool('pl-matrix-input', key, val, errors);
        break;
      default:
        if (!HTML_GLOBAL_TAGS.includes(attr.name)) {
          errors.push(`${attr.name} is not a valid property for pl-matrix-input.`);
        }
    }
  }
  if (!usedAnswersName) {
    errors.push('answers-name is a required property for pl-matrix-input tags.');
  }
  if ((usedRtol || usedAtol) && !usedRelabs) {
    errors.push(
      'pl-matrix-input: comparison modes decdigs and sigfigs use digits, not rtol or atol.',
    );
  }
  if (usedDigits && usedRelabs) {
    errors.push('pl-matrix-input: comparison mode relabs uses rtol and atol, not digits.');
  }
  return errors;
}

/**
 * Optimistically checks the entire parse tree for errors in common PL tags recursively.
 * @param ast The tree to consider.
 * @returns A list of human-readable error messages, if any.
 */
function dfsCheckParseTree(ast: any): string[] {
  let errors = checkTag(ast);
  if (ast.childNodes) {
    for (const child of ast.childNodes) {
      errors = errors.concat(dfsCheckParseTree(child));
    }
  }

  return errors;
}

/**
 * Checks for errors in common PL elements in an index.html file.
 * @param file The raw text of the file to use.
 * @returns A list of human-readable render error messages, if any.
 */
export function validateHTML(file: string): string[] {
  const tree = parse5.Parser.parse(file);
  return dfsCheckParseTree(tree);
}
