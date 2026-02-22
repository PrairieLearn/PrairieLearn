import { join } from 'path';

import { A11yError, A11yResults } from '@sa11y/format';
import axe from 'axe-core';
import fs from 'fs-extra';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { HtmlValidate } from 'html-validate';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import type { Course, Question, Submission, Variant } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { buildQuestionUrls } from '../lib/question-render.js';
import { makeVariant } from '../lib/question-variant.js';
import * as questionServers from '../question-servers/index.js';

import * as helperServer from './helperServer.js';

const htmlvalidate = new HtmlValidate();

const questionsPath = join(EXAMPLE_COURSE_PATH, 'questions');

// Helper function to find question directories recursively
const findQuestionDirectories = (dir: string): string[] => {
  const questionDirs: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (fs.existsSync(join(entry.parentPath, entry.name, 'info.json'))) {
        questionDirs.push(join(entry.parentPath, entry.name));
      }
    }
  }
  return questionDirs;
};

const rewriteValidatorFalsePositives = async (html: string): Promise<string> => {
  /**
   * Bootstrap uses JS to set accessibility attributes like aria-label on elements.
   * We rewrite the HTML to avoid incorrectly flagged errors in HTMLValidate.
   *
   * Additionally, pl-drawing uses JS to set the img src attribute.
   *
   * pl-code has span elements with empty style attributes we need to ignore.
   * pl-overlay has empty style attributes we need to ignore.
   *
   */
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let output = '';
  const rewriter = new HTMLRewriter((chunk) => {
    output += decoder.decode(chunk);
  });
  rewriter
    .on('a, button', {
      element(el) {
        if (el.hasAttribute('aria-label')) return;
        const title = el.getAttribute('data-bs-title') ?? el.getAttribute('title');
        if (title) {
          el.setAttribute('aria-label', title);
        }
      },
    })
    .on('.pl-drawing-button img', {
      element(el) {
        const src = el.getAttribute('src');
        if (src === '') {
          el.setAttribute('src', 'pl-drawing-dummy-img.png');
        }
      },
    })
    .on('.linenodiv pre span, .pl-overlay', {
      element(el) {
        const style = el.getAttribute('style');
        if (style?.trim() === '') {
          el.removeAttribute('style');
        }
      },
    })
    .on('select > option[aria-label]', {
      element(el) {
        // Our blank option has no text by default.
        // html-validate claims that it's not recommended to set aria-label on an option.
        el.removeAttribute('aria-label');
      },
    });
  await rewriter.write(encoder.encode(html));
  await rewriter.end();
  return output;
};

const validateHtml = async (html: string) => {
  const rewrittenHtml = await rewriteValidatorFalsePositives(html);
  const { results } = await htmlvalidate.validateString(rewrittenHtml, {
    extends: ['html-validate:recommended', 'html-validate:document'],
    rules: {
      // https://html-validate.org/rules/no-raw-characters.html
      // https://html.spec.whatwg.org/multipage/syntax.html#syntax-ambiguous-ampersand
      'no-raw-characters': ['error', { relaxed: true }],

      // https://html-validate.org/rules/form-dup-name.html
      'form-dup-name': ['error', { shared: ['radio', 'checkbox', 'button'] }],

      // https://html-validate.org/rules/require-sri.html
      'require-sri': ['error', { target: 'crossorigin' }],

      // https://html-validate.org/rules/prefer-tbody.html
      // pygments with linenos="table" generates <tr> elements without a wrapping <tbody> tag
      'prefer-tbody': 'off',

      // https://html-validate.org/rules/prefer-native-element.html
      // pl-order-blocks uses role="listbox" for drag-and-drop selection which cannot use native <select>
      'prefer-native-element': ['error', { exclude: ['listbox'] }],

      // False positive, since this attribute is controlled via JS. https://getbootstrap.com/docs/5.3/components/modal/#accessibility
      // https://html-validate.org/rules/hidden-focusable.html
      'hidden-focusable': 'off',

      // https://html-validate.org/rules/wcag/h63.html
      // For simple tables that have the headers in the first row or column, it is sufficient to simply use the <th> elements without scope.
      'wcag/h63': 'off',

      // https://html-validate.org/rules/attribute-boolean-style.html
      // https://html-validate.org/rules/attribute-empty-style.html
      // Not fully controllable, artifacts of our rendering system
      'attribute-boolean-style': ['off'],
      'attribute-empty-style': 'off',
      'no-trailing-whitespace': 'off',

      // We aren't linting full HTML documents
      'missing-doctype': 'off',
      // https://html-validate.org/rules/heading-level.html
      'heading-level': 'off',

      // https://html-validate.org/rules/no-inline-style.html
      // TODO: Move to CSS
      'no-inline-style': [
        'error',
        {
          allowedProperties: [
            'white-space',
            'color',
            'resize',
            'margin-left',
            'width',
            'height',
            'margin',
            'display', // https://github.com/PrairieLearn/PrairieLearn/pull/11939#discussion_r2080325943
            // variables
            '--pl-code-background-color',
            '--pl-code-line-number-color',
            '--pl-multiple-choice-dropdown-width',
            '--pl-matching-counter-type',
            // pl-code
            'line-height',
            'font-weight',
            'font-style',
            'background-color',
            // example course
            'border',
            'text-align',
            'cursor',
            // pl-overlay
            'top',
            'left',
            'transform',
            'z-index',
            'max-width',
            'max-height',
          ],
        },
      ],

      // https://html-validate.org/rules/wcag/h37.html
      // TODO: Provide alternative text for all example course images / diagrams. Waiting on https://github.com/PrairieLearn/PrairieLearn/pull/11929 to show the alternative text nicely.
      'wcag/h37': 'off',

      // https://html-validate.org/rules/element-permitted-content.html
      // TODO: Requires fixes in pl-multiple-choice
      'element-permitted-content': 'off',
    },
  });

  const filteredResults = results.map((result) => {
    result.messages = result.messages.filter((m) => {
      // Workaround for https://gitlab.com/html-validate/html-validate/-/issues/334
      if (m.ruleId === 'aria-label-misuse' && m.selector && /^.*> option[^>]*$/.test(m.selector)) {
        return false;
      }
      return true;
    });
    return result;
  });

  const valid = filteredResults.every((result) => result.messages.length === 0);

  if (!valid) {
    const validationMessages = filteredResults.flatMap((result) =>
      result.messages.map((m) => `L${m.line}:C${m.column} ${m.message} (${m.ruleId})`),
    );
    assert.fail(`HTMLValidate failed:\n${rewrittenHtml}\n${validationMessages.join('\n')}`);
  }
};

const validateAxe = async (html: string) => {
  const virtualConsole = new VirtualConsole();
  const jsdom = new JSDOM(html, {
    virtualConsole,
  });

  const messages: string[] = [];
  const axeResults = await axe.run(jsdom.window.document.documentElement, {
    rules: {
      // document-level rules that don't apply
      'document-title': { enabled: false },
      'html-has-lang': { enabled: false },
      region: { enabled: false },
      // pl-dataframe emits empty headers
      'empty-table-header': { enabled: false },
      // TODO: see h37 above
      'role-img-alt': { enabled: false },
      'image-alt': { enabled: false },
    },
  });
  if (axeResults.violations.length > 0) {
    const err = new A11yError(
      axeResults.violations,
      A11yResults.convert(axeResults.violations).sort(),
    );
    messages.push(err.format({}));
  }

  if (messages.length > 0) {
    assert.fail(`Axe failed:\n${messages.join('\n')}`);
  }
};

// Find all question directories
const allQuestionDirs = findQuestionDirectories(questionsPath);

// Filter for questions that don't use Manual or External grading
const internallyGradedQuestions = allQuestionDirs
  .map((dir) => {
    const infoPath = join(dir, 'info.json');
    const info = fs.readJsonSync(infoPath);
    const relativePath = dir.slice(Math.max(0, questionsPath.length + 1));
    return {
      path: dir,
      relativePath,
      info,
    };
  })
  .filter(
    (q): q is { path: string; relativePath: string; info: any } =>
      !['External', 'Manual'].includes(q.info.gradingMethod) && q.info.type === 'v3',
  );

const course = {
  path: EXAMPLE_COURSE_PATH,
  // Note: this doesn't respect any course-level options set.
} as unknown as Course;

const questionModule = questionServers.getModule('Freeform');

// TODO: support '_files'
const unsupportedQuestions = new Set(['element/fileEditor', 'element/codeDocumentation']);

const accessibilitySkip = new Set([
  // Extremely large question
  'element/dataframe',
]);

describe('Internally graded question lifecycle tests', { timeout: 60_000 }, function () {
  const originalProcessQuestionsInServer = config.features['process-questions-in-server'];

  beforeAll(async function () {
    config.features['process-questions-in-server'] = false;
    await helperServer.before()();
  });

  afterAll(async function () {
    await helperServer.after();
    config.features['process-questions-in-server'] = originalProcessQuestionsInServer;
  });

  internallyGradedQuestions.forEach(({ relativePath, info }) => {
    it(`should succeed for ${relativePath}`, async function (context) {
      if (unsupportedQuestions.has(relativePath)) {
        context.skip();
      }
      const question = {
        options: info.options ?? {}, // Use options from info.json if available
        directory: relativePath,
        type: 'Freeform',
      } as unknown as Question;

      // Prepare and generate
      const { courseIssues: prepareGenerateIssues, variant: rawVariant } = await makeVariant(
        question,
        course,
        {
          variant_seed: null,
        },
      );

      assert.isEmpty(prepareGenerateIssues, 'Prepare/Generate should not produce any issues');

      const variant = rawVariant as Variant;
      variant.num_tries = 0;

      // Render
      const locals = {
        urlPrefix: '/prefix1',
        plainUrlPrefix: '/pl',
        questionRenderContext: undefined,
        ...buildQuestionUrls(
          '/prefix2',
          { id: 'vid', workspace_id: 'wid' } as unknown as Variant,
          { id: 'qid' } as unknown as Question,
          null,
        ),
      };
      const {
        courseIssues: renderIssues,
        data: { questionHtml },
      } = await questionModule.render({
        renderSelection: {
          question: true,
          submissions: false,
          answer: false,
        },
        variant,
        question,
        submission: null,
        submissions: [],
        course,
        locals,
      });
      assert.isEmpty(renderIssues, 'Render should not produce any issues');

      // Validate HTML
      await validateHtml(questionHtml);

      // Validate accessibility
      if (!accessibilitySkip.has(relativePath)) {
        await validateAxe(questionHtml);
      }

      if (!questionModule.test) {
        assert.fail('Test function not implemented for this question module');
      }

      const {
        data: { raw_submitted_answer },
      } = await questionModule.test(variant, question, course, 'correct');

      const parseResult = await questionModule.parse(
        {
          submitted_answer: raw_submitted_answer,
          raw_submitted_answer,
          gradable: true,
        },
        variant,
        question,
        course,
      );
      // TODO: If we notice rendering/accessibility bugs that aren't caught since they happen from a state reachable via parse+render, add more checks.

      const { courseIssues: parseIssues, data: parseData } = parseResult;

      assert.isEmpty(parseIssues, 'Parse should not produce any issues');

      assert.isEmpty(parseData.format_errors, 'Parse should not have any formatting errors');

      // 5. Grade
      const gradeResult = await questionModule.grade(
        parseData as unknown as Submission,
        variant,
        question,
        course,
      );

      // TODO: If we notice rendering/accessibility bugs that aren't caught since they happen from a state reachable via grade+render, add more checks.

      const { courseIssues: gradeIssues, data: gradeData } = gradeResult;

      assert.isEmpty(gradeIssues, 'Grade should not produce any issues');
      assert.isEmpty(gradeData.format_errors ?? {}, 'Grade should not have any formatting errors');
      if (Object.keys(gradeData.true_answer ?? {}).length > 0) {
        assert.equal(gradeData.score, 1, 'Grade should be 1 (100%)');
      }
    });
  });
});
