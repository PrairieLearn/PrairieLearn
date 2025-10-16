import fs from 'node:fs/promises';
import path from 'node:path';

import { Experimental_Agent as Agent, type LanguageModel, tool } from 'ai';
import klaw from 'klaw';
import { z } from 'zod';

import { formatPrompt } from '../../../lib/ai.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import type { Course, Question, User } from '../../../lib/db-types.js';
import { DefaultMap } from '../../../lib/default-map.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { selectQuestionById } from '../../../models/question.js';
import { checkRender } from '../aiQuestionGeneration.js';
import { ALLOWED_ELEMENTS, buildContextForElementDocs } from '../context-parsers/documentation.js';
import {
  type QuestionContext,
  buildContextForQuestion,
} from '../context-parsers/template-questions.js';
import { validateHTML } from '../validateHTML.js';

const SYSTEM_PROMPT = formatPrompt([
  '# Introduction',
  'You are an assistant that helps instructors write questions for PrairieLearn.',
  [
    'A question has a `question.html` file that can contain standard HTML, CSS, and JavaScript.',
    'It can also include PrairieLearn elements like `<pl-multiple-choice>` and `<pl-number-input>`.',
  ],
  'The following PrairieLearn elements are supported (and may be used in the generated question.html):',
  Array.from(ALLOWED_ELEMENTS)
    .map((el) => `- \`<${el}>\``)
    .join('\n'),
  [
    'A question may also have a `server.py` file that can randomly generate unique parameters and answers,',
    'and which can also assign grades to student submissions.',
  ],
  '## Generating and using random parameters',
  [
    '`server.py` may define a `generate` function.',
    '`generate` has a single parameter `data` which can be modified by reference.',
    'It has the following properties:',
  ],
  '- `params`: A dictionary where random parameters, choices, etc. can be written here for later retrieval, e.g. during rendering or grading.',
  [
    '- `correct_answers`:',
    'A dictionary where correct answers can be written.',
    'You MUST ONLY write to this dictionary if actually required by the question or a specific element.',
    'Pay attention to the provided examples and documentation for each element.',
  ],
  [
    'Parameters can be read in `question.html` with Mustache syntax.',
    'For instance, if `server.py` contains `data["params"]["answer"]`,',
    'it can be read with `{{ params.answer }}` in `question.html`.',
  ],
  [
    'If a `question.html` file includes Mustache templates, a `server.py` should be provided to generate the necessary parameters.',
    'Remember that Mustache logic is quite limited, so any computation should be done in `server.py`.',
  ],
  'If the question does not use random parameters, `server.py` can be omitted.',
  '## Formatting',
  [
    'You can use LaTeX to format numerical quantities, equations, formulas, and so on.',
    'For inline LaTeX, use `$...$`. For block LaTeX, use `$$...$$`.',
  ],
  '# Instructions',
  [
    "You must generate a `question.html` file that meets the user's requirements.",
    'If necessary, also generate a `server.py` file.',
    'You MUST ONLY use the PrairieLearn elements listed above.',
    'You MUST use tool calls to explore element documentation and examples to learn how to use them.',
  ],
]);

const ALLOWED_ELEMENT_NAMES = Array.from(ALLOWED_ELEMENTS) as [string, ...string[]];

async function createQuestionGenerationAgent({
  model,
  course,
  user,
  authnUser,
  question,
}: {
  model: LanguageModel;
  course: Course;
  user: User;
  authnUser: User;
  question?: Question;
}) {
  const files = {
    'question.html': '',
    'server.py': '',
  };

  let savedQuestion: Question | null = question ?? null;

  // TODO: global cache or TTL cache of these?
  const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md');
  const elementDocsText = await fs.readFile(elementDocsPath, { encoding: 'utf-8' });
  const elementDocs = buildContextForElementDocs(elementDocsText);

  // TODO: ditto, cache these?
  // This is a map from element name to example questions that use that element.
  const exampleQuestions = new Map<string, QuestionContext>();
  const exampleQuestionsByElement = new DefaultMap<string, (QuestionContext & { qid: string })[]>(
    () => [],
  );
  const exampleCourseQuestionsPath = path.join(REPOSITORY_ROOT_PATH, 'exampleCourse/questions');
  const templateQuestionsPath = path.join(exampleCourseQuestionsPath, 'template');
  for await (const file of klaw(templateQuestionsPath)) {
    if (file.stats.isDirectory()) continue;

    const filename = path.basename(file.path);
    if (filename !== 'question.html') continue;

    const fileText = await fs.readFile(file.path, { encoding: 'utf-8' });
    const questionContext = await buildContextForQuestion(path.dirname(file.path));
    if (!questionContext) continue;

    const qid = path.relative(exampleCourseQuestionsPath, path.dirname(file.path));
    exampleQuestions.set(qid, questionContext);

    // Dumb and dirty.
    for (const elementName of ALLOWED_ELEMENT_NAMES) {
      if (fileText.includes(`<${elementName}`)) {
        exampleQuestionsByElement.getOrCreate(elementName).push({
          ...questionContext,
          qid,
        });
      }
    }
  }

  return new Agent({
    model,
    system: SYSTEM_PROMPT,
    tools: {
      readFile: tool({
        description: 'Read a file from the filesystem.',
        inputSchema: z.object({
          path: z.enum(['question.html', 'server.py']),
        }),
        outputSchema: z.string(),
        execute: ({ path }) => {
          return files[path];
        },
      }),
      writeFile: tool({
        description: 'Write a file to the filesystem.',
        inputSchema: z.object({
          path: z.enum(['question.html', 'server.py']),
          content: z.string(),
        }),
        execute: ({ path, content }) => {
          files[path] = content;
        },
      }),
      getElementDocumentation: tool({
        description: 'Get the documentation for a PrairieLearn element.',
        inputSchema: z.object({
          elementName: z.enum(ALLOWED_ELEMENT_NAMES),
        }),
        outputSchema: z.string(),
        execute: async ({ elementName }) => {
          const docs = elementDocs.find((f) => f.chunkId === elementName);
          return docs?.text ?? `No documentation found for element ${elementName}`;
        },
      }),
      listElementExamples: tool({
        description: 'List example questions that use a given PrairieLearn element.',
        inputSchema: z.object({
          elementName: z.enum(ALLOWED_ELEMENT_NAMES),
        }),
        outputSchema: z.array(z.object({ qid: z.string(), description: z.string() })),
        execute: ({ elementName }) => {
          const examples = exampleQuestions.get(elementName);
          if (!examples) return [];

          return examples.map((ex) => ({
            qid: ex.qid,
            description: ex.readme ?? 'No description available.',
          }));
        },
      }),
      getExampleQuestions: tool({
        description: 'Get the files for example questions byt their QIDs.',
        inputSchema: z.array(z.string()),
        outputSchema: z.array(
          z.object({
            qid: z.string(),
            files: z.object({
              'question.html': z.string(),
              'server.py': z.string().nullable(),
            }),
          }),
        ),
        execute: (qids) => {
          return qids.map((qid) => {
            const exampleQuestion = exampleQuestions.get(qid);
            if (!exampleQuestion) return null;

            return {
              qid,
              files: {
                'question.html': exampleQuestion.html,
                'server.py': exampleQuestion.python ?? null,
              },
            };
          });
        },
      }),
      saveAndValidateQuestion: tool({
        description: 'Save and validate the generated question.',
        inputSchema: z.void(),
        outputSchema: z.object({
          errors: z.array(z.string()),
        }),
        execute: async () => {
          const errors: string[] = [];

          if (!files['question.html']) {
            errors.push('You must generation a question.html file.');
            return errors;
          }

          // TODO: we could possibly speed up the iteration loop by skipping the save if
          // this detected any errors in the HTML.
          errors.push(...validateHTML(files['question.html'], !!files['server.py']));

          const courseFilesClient = getCourseFilesClient();
          if (!savedQuestion) {
            // We're creating a brand-new question.
            const saveResults = await courseFilesClient.createQuestion.mutate({
              course_id: course.id,
              user_id: user.user_id,
              authn_user_id: authnUser.user_id,
              has_course_permission_edit: true,
              is_draft: true,
              files,
            });

            if (saveResults.status === 'error') {
              // TODO: is this the right thing to do here?
              errors.push('Failed to save question. Try again.');
            } else {
              savedQuestion = await selectQuestionById(saveResults.question_id);
            }
          } else {
            // We're updating an existing question.
            const result = await courseFilesClient.updateQuestionFiles.mutate({
              course_id: course.id,
              user_id: user.user_id,
              authn_user_id: authnUser.user_id,
              has_course_permission_edit: true,
              question_id: savedQuestion.id,
              files,
            });

            if (result.status === 'error') {
              // TODO: is this the right thing to do here?
              errors.push('Failed to save question. Try again.');
            }
          }

          // Only attempt rendering if there were no other errors.
          if (errors.length === 0 && savedQuestion) {
            errors.push(
              ...(await checkRender('success', [], course.id, user.user_id, savedQuestion.id)),
            );
          }

          return { errors };
        },
      }),
    },
  });
}
