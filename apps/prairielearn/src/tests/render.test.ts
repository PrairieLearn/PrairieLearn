import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { config as chaiConfig } from 'chai';
import { assert } from 'chai'; // Import assert
// import chai from 'chai';
import fs from 'fs-extra';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { HtmlValidate } from 'html-validate';
import { HTMLHint } from 'htmlhint';
import * as log from 'why-is-node-running';

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
chaiConfig.showDiff = true;

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

// Helper function to rewrite aria-labels like in render.test.ts
const rewriteAriaLabel = async (html: string): Promise<string> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let output = '';
  const rewriter = new HTMLRewriter((chunk) => {
    output += decoder.decode(chunk);
  });
  rewriter.on('a, button', {
    element(el) {
      if (el.hasAttribute('aria-label')) return;
      const title = el.getAttribute('data-bs-title') ?? el.getAttribute('title');
      if (title) {
        el.setAttribute('aria-label', title);
      }
    },
  });
  await rewriter.write(encoder.encode(html));
  await rewriter.end();

  // Ensure all img tags are self-closing
  // output = output.replace(/(<img[^>]*[^/])>/gi, '$1/>');

  return output;
};

// Find all question directories
const allQuestionDirs = findQuestionDirectories(questionsPath);

// Filter for questions that do NOT use External grading
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

// Mock course object similar to render.test.ts
const course = {
  // These are required to pass validateContext in the feature manager
  institutition_id: true,
  course_id: true,
  course_instance_id: true,
  // These options are from CourseJsonSchema, but not needed
  options: {},
  path: exampleCoursePath,
} as unknown as Course;

const questionModule = questionServers.getModule('Freeform');

describe('Internally Graded Question Lifecycle Tests', () => {
  before(async () => {
    console.log('Setting up before tests...');
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
    console.log('Cleaning up after tests...');
    await codeCaller.finish();
    loadEstimator.close();
    await assetServer.close();
    console.log('Cleanup complete.');
    setTimeout(function () {
      log.default(); // logs out active handles that are keeping node running
    }, 10000);
  });

  const limitedInternallyGradedQuestions = internallyGradedQuestions; //.slice(0, 5);

  const badQs = [
    'element/fileEditor', // needs files
    /* fixed in another PR */
    'demo/drawing/buttons',
    'demo/drawing/customizedButtons',
    'demo/drawing/extensions',
    'workshop/Lesson4_example2',
    'workshop/Lesson4_example3',
    'demo/custom/elementHiddenTag',
  ];
  // Dynamically create tests for each identified question
  limitedInternallyGradedQuestions.forEach(({ relativePath, info }) => {
    it(`should succeed for ${relativePath}`, async () => {
      await features.runWithGlobalOverrides({ 'process-questions-in-server': false }, async () => {
        // Mock Question object similar to render.test.ts

        const question = {
          options: info.options ?? {}, // Use options from info.json if available
          directory: relativePath,
          type: 'Freeform',
          // Add other properties if strictly needed by makeVariant or other functions
          // based on their usage in the codebase, but keep it minimal.
          // Use type casting to satisfy the type checker.
        } as unknown as Question;

        // 1. Prepare/Generate
        const { courseIssues: prepareGenerateIssues, variant } = await makeVariant(
          question,
          course,
          {}, // variant_seed
        );
        assert.isEmpty(
          prepareGenerateIssues,
          `Prepare/Generate courseIssues should be empty but it was ${prepareGenerateIssues}`,
        );
        assert.isOk(variant, 'Variant should be generated');

        // Mock variant properties needed for rendering/grading, similar to render.test.ts
        // @ts-expect-error Adding property for test
        variant.num_tries = 1; // Example property, adjust if needed

        // 2. Render
        const locals = {
          urlPrefix: '/prefix1',
          plainUrlPrefix: config.urlPrefix,
          questionRenderContext: undefined,
          ...buildQuestionUrls(
            '/prefix2',
            { id: 'vid', workspace_id: 'wid' } as unknown as Variant, // Minimal mock for URLs
            { id: 'qid' } as unknown as Question, // Minimal mock for URLs
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
          variant as unknown as Variant, // Cast needed
          question,
          null, // submission
          [], // submissions
          course,
          locals,
        );
        assert.isEmpty(
          renderIssues,
          `Render courseIssues should be empty, but it was ${JSON.stringify(renderIssues, undefined, 2)}`,
        );
        assert.isOk(questionHtml, 'Rendered HTML should exist');
        assert.isString(questionHtml, 'Rendered HTML should be a string');

        // 3. Lint HTML
        const htmlHintMessages = HTMLHint.verify(questionHtml, {
          'doctype-first': false, // Ignore doctype requirement for fragments
          // Add other relevant HTMLHint rules to ignore if necessary
        });
        assert.isEmpty(htmlHintMessages, 'HTMLHint should pass');
        // console.log(questionHtml);

        const rewrittenHtml = await rewriteAriaLabel(questionHtml);
        const { valid, results } = await htmlvalidate.validateString(rewrittenHtml, {
          extends: ['html-validate:recommended', 'html-validate:document'],
          rules: {
            'no-raw-characters': [
              'error',
              {
                relaxed: true,
              },
            ],
            'form-dup-name': [
              'error',
              {
                shared: ['radio', 'checkbox', 'button'],
              },
            ],
            'require-sri': [
              'error',
              {
                target: 'crossorigin',
              },
            ],
            // Known / hard to fix issues

            // Issue in pygments, missing tbody
            /*
            pygments.format(pygments.lex("foo", pygments.lexers.get_lexer_by_name("python")), pygments.formatters.HtmlFormatter(linenos="table"))
            <div class="highlight"><table class="highlighttable"><tr><td class="linenos"><div class="linenodiv"><pre><span class="normal">1</span></pre></div></td><td class="code"><div><pre><span></span><span class="n">foo</span>\n</pre></div></td></tr></table></div>
            */
            'prefer-tbody': 'off',
            'wcag/h37': 'off', // https://github.com/PrairieLearn/PrairieLearn/issues/11841
            'hidden-focusable': 'off', // False positive - https://getbootstrap.com/docs/5.3/components/modal/#accessibility
            'wcag/h63': 'off', // False positive, too strict

            // Requires fixes in pl-answer -- div subnode of label
            // Requires fixes in pl-multiple-choice -- div subnode of span
            // Couldn't see a difference in the output when I changed it to a div
            'element-permitted-content': 'off',

            // Issues not worth solving
            'no-inline-style': 'off',
            'no-trailing-whitespace': 'off',
            'missing-doctype': 'off',
            'heading-level': 'off',
            // Not fully controllable
            'attribute-boolean-style': ['off'],
            // Not fully controllable, see pl-file-download
            'attribute-empty-style': 'off',
            'input-missing-label': 'off',

            // Solved issues
            // 'element-required-attributes': 'off',
            // 'no-deprecated-attr': 'off',
            // deprecated: 'off',
            // 'text-content': 'off',
            // 'input-attributes': 'off',
            'no-implicit-close': 'off',
            'close-order': 'off',
            'attribute-allowed-values': 'off',

            // Add other relevant html-validate rules to ignore if necessary
          },
        });
        if (!valid) {
          const validationMessages = results.flatMap((result) =>
            result.messages.map((m) => `L${m.line}:C${m.column} ${m.message} (${m.ruleId})`),
          );
          assert.fail(`HTMLValidate failed:\n${validationMessages.join('\n')}\n${rewrittenHtml}`);
        }
        assert.isTrue(valid, 'HTMLValidate should pass');

        // 4. Parse (using true_answer)
        if (badQs.includes(relativePath)) {
          return;
        }
        if (!questionModule.test) {
          assert.fail('Test function not implemented for this question module');
        }

        const {
          data: { raw_submitted_answer, format_errors },
        } = await questionModule.test(
          variant as unknown as Variant, // Cast needed
          question,
          course,
          'correct',
        );
        // buildSubmission(structuredClone(variant.true_answer));

        // Mock submission object similar to render.test.ts
        const submissionInput = {
          submitted_answer: raw_submitted_answer,
          raw_submitted_answer, // Keep original raw answer
          gradable: true, // Assume gradable initially
          // Add other properties only if strictly required by parse
        } as unknown as Submission;

        const { courseIssues: parseIssues, data: parsedData } = await questionModule.parse(
          submissionInput,
          variant as unknown as Variant, // Cast needed
          question,
          course,
        );
        assert.isEmpty(
          parseIssues,
          `Parse courseIssues should be empty for input ${JSON.stringify(
            submissionInput.submitted_answer,
            undefined,
            2,
          )}, but it was ${JSON.stringify(parseIssues)}`,
        );
        // console.log(parsedData);
        // if ((parsedData.format_errors as any).length > 0) {
        //   console.log('Format errors for question directory:', relativePath);
        // parsedData.format_errors = {};
        // parsedData.submitted_answer = structuredClone(variant.true_answer);
        // parsedData.gradable = true;
        // }
        // console.log(parsedData);
        for (const issue of Object.keys(parseIssues)) {
          if (issue === '_files') {
            console.log("Can't handle file questions yet");
            return;
          }
        }
        for (const issue of Object.keys(parsedData.format_errors ?? {})) {
          if (issue === '_files') {
            console.log("Can't handle file questions yet");
            return;
          }
        }

        assert.deepEqual(
          Object.keys(parsedData.format_errors ?? {}),
          Object.keys(format_errors),
          `Parse format_errors should be equal
          but it was ${JSON.stringify(parsedData.format_errors, undefined, 2)}`,
        );
        /*
         for submission ${JSON.stringify(
            submissionInput.submitted_answer,
            undefined,
            2,
          )}
        */

        // Update submission with parsed data
        const submissionForGrading = { ...parsedData };
        // if (Object.keys(submissionForGrading.format_errors ?? {}).length > 0) {
        //   submissionForGrading.gradable = false;
        // }

        // assert.isTrue(submissionForGrading.gradable, 'Submission should be gradable after parse');

        // 5. Grade
        const { courseIssues: gradeIssues, data: gradeData } = await questionModule.grade(
          submissionForGrading as unknown as Submission, // Cast needed
          variant as unknown as Variant, // Cast needed
          question,
          course,
        );

        for (const issue of gradeIssues) {
          if (issue.data.outputStderr) {
            assert.fail(
              JSON.stringify(submissionForGrading.submitted_answer, undefined, 2) +
                '\n' +
                issue.data.outputStderr,
            );
          }
        }
        assert.isEmpty(
          gradeIssues,
          `Grade courseIssues should be empty but got ${JSON.stringify(gradeIssues)}`,
        );
        assert.isEmpty(gradeData.format_errors ?? {}, 'Grade format_errors should be empty');
        if ((gradeData.true_answer as any).length > 0) {
          assert.equal(gradeData.score, 1, 'Grade should be 1 (100%)');
        }
      });
    });
  });
});
