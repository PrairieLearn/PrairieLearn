import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { assert } from 'chai';
import fs from 'fs-extra';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { HtmlValidate } from 'html-validate';
import { HTMLHint } from 'htmlhint';

import * as assetServer from '../lib/assets.js';
import * as codeCaller from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import type { Course, Question, Submission, Variant } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import * as loadEstimator from '../lib/load.js';
import { buildQuestionUrls } from '../lib/question-render.js';
import { makeVariant } from '../lib/question-variant.js';
import * as freeformServer from '../question-servers/freeform.js';
import * as questionServers from '../question-servers/index.js';
import * as helperServer from '../tests/helperServer.js';

const htmlvalidate = new HtmlValidate();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exampleCoursePath = resolve(__dirname, '..', '..', '..', '..', 'exampleCourse');
const questionsPath = join(exampleCoursePath, 'questions');

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
    });
  await rewriter.write(encoder.encode(html));
  await rewriter.end();
  return output;
};

const validateHtml = async (html: string) => {
  const htmlHintMessages = HTMLHint.verify(html, {
    'doctype-first': false, // Ignore doctype requirement for fragments
  });
  assert.isEmpty(htmlHintMessages, 'HTMLHint should pass');

  const rewrittenHtml = await rewriteValidatorFalsePositives(html);
  const { valid, results } = await htmlvalidate.validateString(rewrittenHtml, {
    extends: ['html-validate:recommended', 'html-validate:document'],
    rules: {
      // https://html-validate.org/rules/no-raw-characters.html
      // https://html.spec.whatwg.org/multipage/syntax.html#syntax-ambiguous-ampersand
      'no-raw-characters': [
        'error',
        {
          relaxed: true,
        },
      ],

      // https://html-validate.org/rules/form-dup-name.html
      'form-dup-name': [
        'error',
        {
          shared: ['radio', 'checkbox', 'button'],
        },
      ],

      // https://html-validate.org/rules/require-sri.html
      'require-sri': [
        'error',
        {
          target: 'crossorigin',
        },
      ],

      // https://html-validate.org/rules/prefer-tbody.html
      // pygments with linenos="table" generates <tr> elements without a wrapping <tbody> tag
      'prefer-tbody': 'off',

      // False positive https://getbootstrap.com/docs/5.3/components/modal/#accessibility
      // https://html-validate.org/rules/hidden-focusable.html
      'hidden-focusable': 'off',

      // https://html-validate.org/rules/wcag/h63.html
      // For simple tables that have the headers in the first row or column, it is sufficient to simply use the th elements without scope.
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
      // TODO:
      'wcag/h37': 'off',

      // https://html-validate.org/rules/element-permitted-content.html
      // TODO: Requires fixes in pl-multiple-choice
      'element-permitted-content': 'off',
    },
  });
  if (!valid) {
    const validationMessages = results.flatMap((result) =>
      result.messages.map((m) => `L${m.line}:C${m.column} ${m.message} (${m.ruleId})`),
    );
    assert.fail(`HTMLValidate failed:\n${validationMessages.join('\n')}\n${rewrittenHtml}`);
  }
  assert.isTrue(valid, 'HTMLValidate should pass');
};

// Find all question directories
const allQuestionDirs = findQuestionDirectories(questionsPath);

// Filter for questions that don't use Manual or External grading
const internallyGradedQuestions = allQuestionDirs
  .map((dir) => {
    const infoPath = join(dir, 'info.json');
    try {
      const info = fs.readJsonSync(infoPath);
      const relativePath = dir.substring(questionsPath.length + 1);
      return {
        path: dir,
        relativePath,
        info,
      };
    } catch (err) {
      console.error(`Error reading or parsing ${infoPath}:`, err);
      return null;
    }
  })
  .filter(
    (q): q is { path: string; relativePath: string; info: any } =>
      q !== null && !['External', 'Manual'].includes(q.info.gradingMethod) && q.info.type === 'v3',
  );

const course = {
  path: exampleCoursePath,
} as unknown as Course;

const questionModule = questionServers.getModule('Freeform');

// TODO: support '_files'
const unsupportedQuestions = [
  'element/code',
  'element/fileDownload',
  'element/fileEditor',
  'element/codeDocumentation',
];

describe('Internally Graded Question Lifecycle Tests', function () {
  this.timeout(60000);

  before(async () => {
    // Disable load estimator connecting to SQL
    loadEstimator.setLocalLoadEstimator(true);

    // Initialize asset server
    config.devMode = false;
    await assetServer.init();
    config.devMode = true;

    // Initialize code caller pool and question servers
    await codeCaller.init();
    await freeformServer.init();
  });

  after(async () => {
    await helperServer.after();
    await codeCaller.finish();
    loadEstimator.close();
    await assetServer.close();
  });

  internallyGradedQuestions.forEach(({ relativePath, info }) => {
    it(`should succeed for ${relativePath}`, async function () {
      if (unsupportedQuestions.includes(relativePath)) {
        this.skip();
      }

      await features.runWithGlobalOverrides({ 'process-questions-in-server': false }, async () => {
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

        assert.isEmpty(prepareGenerateIssues, 'Prepare/Generate courseIssues should be empty');

        const variant = rawVariant as Variant;
        variant.num_tries = 0;

        // Render
        const locals = {
          urlPrefix: '/prefix1',
          plainUrlPrefix: config.urlPrefix,
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
        } = await questionModule.render(
          {
            question: true,
            submissions: false,
            answer: false,
          },
          variant,
          question,
          null /* submission */,
          [] /* submissions */,
          course,
          locals,
        );
        assert.isEmpty(renderIssues, 'Render courseIssues should be empty');

        // Validate HTML
        await validateHtml(questionHtml);

        if (!questionModule.test) {
          assert.fail('Test function not implemented for this question module');
        }

        const {
          data: { raw_submitted_answer, format_errors },
        } = await questionModule.test(variant, question, course, 'correct');

        const { courseIssues: parseIssues, data: parsedData } = await questionModule.parse(
          {
            submitted_answer: raw_submitted_answer,
            raw_submitted_answer,
            gradable: true,
          },
          variant,
          question,
          course,
        );

        assert.isEmpty(
          parseIssues,
          `Parse courseIssues should be empty for input ${JSON.stringify(
            raw_submitted_answer,
            undefined,
            2,
          )}`,
        );

        assert.deepEqual(
          Object.keys(parsedData.format_errors ?? {}),
          Object.keys(format_errors),
          'Parse format_errors should be equal',
        );

        // 5. Grade
        const { courseIssues: gradeIssues, data: gradeData } = await questionModule.grade(
          parsedData as unknown as Submission,
          variant,
          question,
          course,
        );

        for (const issue of gradeIssues) {
          assert.fail(
            JSON.stringify(parsedData.submitted_answer, undefined, 2) +
              '\n' +
              (issue.data.outputStderr ?? ''),
          );
        }

        assert.isEmpty(gradeIssues, 'Grade courseIssues should be empty');
        assert.isEmpty(gradeData.format_errors ?? {}, 'Grade format_errors should be empty');
        if ((gradeData.true_answer as any).length > 0) {
          assert.equal(gradeData.score, 1, 'Grade should be 1 (100%)');
        }
      });
    });
  });
});
