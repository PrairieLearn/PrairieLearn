import mustache from 'mustache';
import * as parse5 from 'parse5';

import { lintQuestionHtml } from '../../lib/question-html-linter.js';

type DocumentFragment = parse5.DefaultTreeAdapterMap['documentFragment'];
type ChildNode = parse5.DefaultTreeAdapterMap['childNode'];

const PANEL_ELEMENTS = new Set(['pl-question-panel', 'pl-answer-panel', 'pl-submission-panel']);

// Note: all elements here are purely input-oriented. If a dual-purpose element is
// added (e.g. `pl-drawing`, which can be either input or display depending on its
// attributes), the nesting validation in `dfsCheckParseTree` may need to be made
// attribute-aware for that element rather than adding it here unconditionally.
const INPUT_ELEMENTS = new Set([
  'pl-multiple-choice',
  'pl-checkbox',
  'pl-integer-input',
  'pl-number-input',
  'pl-string-input',
  'pl-symbolic-input',
  'pl-order-blocks',
]);

export const SUPPORTED_ELEMENTS = new Set([...PANEL_ELEMENTS, ...INPUT_ELEMENTS]);

const AUXILIARY_ELEMENTS = new Set(['pl-answer', 'pl-block-group']);
const PYTHON_CORRECT_ANSWER_INPUT_ELEMENTS = new Set([
  'pl-integer-input',
  'pl-number-input',
  'pl-string-input',
  'pl-symbolic-input',
]);
const NON_TEMPLATE_CORRECT_ANSWER_INPUT_ELEMENTS = new Set([
  'pl-integer-input',
  'pl-number-input',
  'pl-symbolic-input',
]);

const mustacheTemplateRegex = /^\{\{.*\}\}$/;

type MustacheTextToken = ['text', string, number, number];
type MustacheNameToken = ['name', string, number, number];
type MustacheSectionToken = ['#' | '^' | '&', string, number, number, MustacheToken[]];
type MustacheToken = MustacheTextToken | MustacheNameToken | MustacheSectionToken;

export function extractMustacheTemplateNames(str: string): Set<string> {
  // We use a temporary writer to avoid any long-lived storage of the parsed
  // template in Mustache's cache.
  const writer = new mustache.Writer();
  const tokens = writer.parse(str);

  const names = new Set<string>();

  /** Helper function to recursively collect names. */
  function collectNames(tokensList: MustacheToken[]) {
    for (const token of tokensList) {
      const [type, value] = token;

      if (type === 'name' || type === '&') {
        // Handles {{variable}} and {{{variable}}} (unescaped)
        names.add(value);
      } else if (type === '#' || type === '^') {
        // Handles {{#section}}...{{/section}} and {{^inverted-section}}...{{/section}}
        // Record the section name itself.
        names.add(value);

        // Process any nested tokens.
        const children = token[4];
        if (Array.isArray(children)) {
          collectNames(children);
        }
      } else {
        // Other token types ('text', '!' for comments, '/' for closing tags) are implicitly ignored.
      }
    }
  }

  collectNames(tokens);

  // We deliberately ignore `.` (the current context). It's not a useful name
  // as it doesn't correspond to a variable in the template in isolation.
  names.delete('.');

  return names;
}

export function isValidMustacheTemplateName(name: string): boolean {
  // Mustache template names must be alphanumeric and can contain dots and underscores.
  return /^[a-zA-Z0-9_.]+$/.test(name);
}

interface HTMLValidationResult {
  /** Hard errors that must be fixed before saving. */
  errors: string[];
  /**
   * Warnings about likely issues. Unlike errors, warnings do not block
   * saving — they are included in the response so the LLM is informed,
   * but the question can still be saved. Callers may choose to promote
   * warnings to errors based on context (e.g. when creating a new question).
   */
  warnings: string[];
}

interface DfsResult {
  errors: string[];
  warnings: string[];
  mandatoryPythonCorrectAnswers: Set<string>;
}

function getAttribute(ast: DocumentFragment | ChildNode, name: string): string | undefined {
  if (!('attrs' in ast)) return undefined;
  return ast.attrs.find((attr) => attr.name === name)?.value;
}

function checkUnsupportedTag(ast: DocumentFragment | ChildNode): string[] {
  if (!('tagName' in ast) || !ast.tagName.startsWith('pl-')) return [];
  if (SUPPORTED_ELEMENTS.has(ast.tagName) || AUXILIARY_ELEMENTS.has(ast.tagName)) return [];

  const formattedSupportedElements = Array.from(SUPPORTED_ELEMENTS).join(', ');
  return [
    `${ast.tagName} is not a valid tag. You must use only the following tags: ${formattedSupportedElements}`,
  ];
}

/**
 * Checks the entire parse tree for errors in common PL tags recursively.
 * @param ast The tree to consider.
 * @param enclosingPanel The name of the enclosing panel element (e.g. 'pl-submission-panel'), if any.
 * @returns Errors, warnings, and mandatory correct answers.
 */
function dfsCheckParseTree(ast: DocumentFragment | ChildNode, enclosingPanel?: string): DfsResult {
  let errors = checkUnsupportedTag(ast);
  let warnings: string[] = [];
  const mandatoryPythonCorrectAnswers = new Set<string>();

  if ('tagName' in ast && INPUT_ELEMENTS.has(ast.tagName) && enclosingPanel) {
    warnings.push(
      `<${ast.tagName}> must not be placed inside <${enclosingPanel}>. ` +
        'Input elements must be placed at the top level of question.html (outside any panel element) ' +
        'so they render correctly in the question, submission, and answer panels. ' +
        `Move <${ast.tagName}> outside of <${enclosingPanel}>.`,
    );
  }

  if ('tagName' in ast && PYTHON_CORRECT_ANSWER_INPUT_ELEMENTS.has(ast.tagName)) {
    const answersName = getAttribute(ast, 'answers-name');
    const correctAnswer = getAttribute(ast, 'correct-answer');

    if (answersName && correctAnswer === undefined) {
      mandatoryPythonCorrectAnswers.add(answersName);
    }
    if (
      correctAnswer !== undefined &&
      NON_TEMPLATE_CORRECT_ANSWER_INPUT_ELEMENTS.has(ast.tagName) &&
      mustacheTemplateRegex.test(correctAnswer)
    ) {
      errors.push(
        `${ast.tagName}: correct-answer attribute value must not be a Mustache template. If the correct answer depends on dynamic parameters, set \`data['correct_answers']\` accordingly in \`server.py\` and remove this attribute.`,
      );
    }
  }

  const childPanel =
    'tagName' in ast && PANEL_ELEMENTS.has(ast.tagName) ? ast.tagName : enclosingPanel;

  if ('childNodes' in ast) {
    for (const child of ast.childNodes) {
      const childResult = dfsCheckParseTree(child, childPanel);
      errors = errors.concat(childResult.errors);
      warnings = warnings.concat(childResult.warnings);
      childResult.mandatoryPythonCorrectAnswers.forEach((x) =>
        mandatoryPythonCorrectAnswers.add(x),
      );
    }
  }

  return { errors, warnings, mandatoryPythonCorrectAnswers };
}

/**
 * Checks for errors and warnings in common PL elements in a question.html file.
 * @param file The raw text of the file to use.
 * @param hasServerPy True if a server.py file is present, else false.
 * @returns Errors that must be fixed and warnings about likely issues.
 */
export async function validateHTML(
  file: string,
  hasServerPy: boolean,
): Promise<HTMLValidationResult> {
  const forbiddenTagMatch = file.match(/^\s*<(!doctype|html|body|head)[\s>]/i);
  if (forbiddenTagMatch) {
    const tag = forbiddenTagMatch[1].toLowerCase();
    if (tag === '!doctype') {
      return {
        errors: [
          'The <!DOCTYPE> declaration must not be included. Only generate the inner content that would go inside the <body> tag.',
        ],
        warnings: [],
      };
    }
    return {
      errors: [
        `The <${tag}> tag must not be included. Only generate the inner content that would go inside the <body> tag.`,
      ],
      warnings: [],
    };
  }

  const tree = parse5.parseFragment(file);
  const { errors, warnings, mandatoryPythonCorrectAnswers } = dfsCheckParseTree(tree);

  const diagnostics = await lintQuestionHtml(file);
  for (const diagnostic of diagnostics) {
    // Selector-based project rules use hyphenated `pl-*` IDs and are editor lint
    // guidance. Only surface JSON Schema diagnostics in AI HTML validation.
    if (diagnostic.ruleName !== 'customTagSchema') {
      continue;
    }
    (diagnostic.severity === 'error' ? errors : warnings).push(diagnostic.message);
  }

  const usedTemplateNames = extractMustacheTemplateNames(file);
  const templates = [
    ...usedTemplateNames,
    ...Array.from(mandatoryPythonCorrectAnswers).map((x) => `correct_answers.${x}`),
  ];

  if (!hasServerPy && templates.length > 0) {
    errors.push(`Create a server.py file to generate the following: ${templates.join(', ')}`);
  }

  for (const template of usedTemplateNames) {
    if (!isValidMustacheTemplateName(template)) {
      errors.push(
        `Template of ${template} must be in mustache format. Please adjust so that any logic done in the template is instead done in server.py`,
      );
    }
  }

  return { errors, warnings };
}
