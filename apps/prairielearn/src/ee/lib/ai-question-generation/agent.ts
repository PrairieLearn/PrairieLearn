import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import {
  Experimental_Agent as Agent,
  JsonToSseTransformStream,
  type LanguageModel,
  type UIMessage,
  convertToModelMessages,
  stepCountIs,
  tool,
} from 'ai';
import klaw from 'klaw';
import { z } from 'zod';

import { execute, loadSql, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { formatPrompt } from '../../../lib/ai.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiQuestionGenerationMessageSchema,
  type Course,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { DefaultMap } from '../../../lib/default-map.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectQuestionById } from '../../../models/question.js';
import { addCompletionCostToIntervalUsage, checkRender } from '../aiQuestionGeneration.js';
import { ALLOWED_ELEMENTS, buildContextForElementDocs } from '../context-parsers/documentation.js';
import {
  type QuestionContext,
  buildContextForQuestion,
} from '../context-parsers/template-questions.js';
import { validateHTML } from '../validateHTML.js';

import { getAiQuestionGenerationStreamContext } from './redis.js';

const sql = loadSqlEquiv(import.meta.url);
const otherSql = loadSql(path.join(import.meta.dirname, '..', 'aiQuestionGeneration.sql'));

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
    'You MUST use tool calls to explore element documentation.',
    'You MUST review at least one example question before attempting to generate any code.',
    'You MUST save and validate the question before finishing.',
    'If validation fails, you MUST fix the errors and re-validate until it passes.',
  ],
]);

const ALLOWED_ELEMENT_NAMES = Array.from(ALLOWED_ELEMENTS) as [string, ...string[]];

export async function createQuestionGenerationAgent({
  model,
  course,
  user,
  authnUser,
  question,
  hasCoursePermissionEdit,
}: {
  model: LanguageModel;
  course: Course;
  user: User;
  authnUser: User;
  question: Question;
  hasCoursePermissionEdit: boolean;
}) {
  const files = {
    'question.html': '',
    'server.py': '',
  };

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

  const agent = new Agent({
    model,
    system: SYSTEM_PROMPT,
    stopWhen: [
      // Cap to 20 steps to avoid runaways.
      stepCountIs(20),
    ],
    prepareStep: async ({ steps }) => {
      const didListExamples = steps
        .at(-1)
        ?.toolCalls.some(({ toolName }) => toolName === 'listElementExamples');
      if (didListExamples) {
        // Force the model to use the `getExampleQuestions` tool next.
        return {
          activeTools: ['getExampleQuestions'],
          toolChoice: 'required',
        };
      }
    },
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
        outputSchema: z.array(
          z.object({
            qid: z.string(),
            description: z.string(),
          }),
        ),
        execute: ({ elementName }) => {
          const examples = exampleQuestionsByElement.get(elementName);
          if (!examples) return [];

          return examples.map((ex) => ({
            qid: ex.qid,
            description: ex.readme ?? 'No description available.',
          }));
        },
      }),
      getExampleQuestions: tool({
        description: 'Get the files for example questions by their QIDs.',
        inputSchema: z.object({
          qids: z.array(z.string()),
        }),
        outputSchema: z.array(
          z.object({
            qid: z.string(),
            files: z.object({
              'question.html': z.string(),
              'server.py': z.string().nullable(),
            }),
          }),
        ),
        execute: ({ qids }) => {
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
        inputSchema: z.object({}),
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
          const result = await courseFilesClient.updateQuestionFiles.mutate({
            course_id: course.id,
            user_id: user.user_id,
            authn_user_id: authnUser.user_id,
            has_course_permission_edit: hasCoursePermissionEdit,
            question_id: question.id,
            // TODO: creation uses plain files, this uses base-64. The different is bad
            // and should be addressed.
            files: {
              'question.html': Buffer.from(files['question.html'], 'utf-8').toString('base64'),
              'server.py': files['server.py']
                ? Buffer.from(files['server.py'], 'utf-8').toString('base64')
                : null,
            },
          });

          if (result.status === 'error') {
            // TODO: is this the right thing to do here?
            errors.push('Failed to save question. Try again.');
          }

          // Only attempt rendering if there were no other errors.
          if (errors.length === 0) {
            errors.push(
              ...(await checkRender('success', [], course.id, user.user_id, question.id)),
            );
          }

          return { errors };
        },
      }),
    },
  });

  return { agent };
}

export async function editQuestionWithAgent({
  model,
  course,
  question,
  user,
  authnUser,
  hasCoursePermissionEdit,
  prompt,
  messages,
}: {
  model: LanguageModel;
  course: Course;
  question?: Question;
  user: User;
  authnUser: User;
  hasCoursePermissionEdit: boolean;
  prompt?: string;
  messages?: UIMessage[];
}) {
  if (prompt && messages) throw new Error('Cannot provide both prompt and messages');
  if (!prompt && !messages) throw new Error('Either prompt or messages must be provided');

  const serverJob = await createServerJob({
    courseId: course.id,
    type: 'ai_question_generate',
    description: `${question ? 'Edit' : 'Generate'} a question with AI`,
    authnUserId: authnUser.user_id,
  });

  if (!question) {
    // Create the initial question so we can get a question ID. This also simplifies
    // the agent logic since we don't need to handle the "create new question" vs
    // "update existing question" case - we're just always updating.
    const courseFilesClient = getCourseFilesClient();
    const saveResults = await courseFilesClient.createQuestion.mutate({
      course_id: course.id,
      user_id: user.user_id,
      authn_user_id: authnUser.user_id,
      has_course_permission_edit: hasCoursePermissionEdit,
      is_draft: true,
      files: {
        'question.html': '',
        'server.py': '',
      },
    });

    if (saveResults.status === 'error') {
      console.error('Failed to create initial question');
      throw new Error('Failed to create initial question for AI generation.');
    }

    await execute(otherSql.insert_draft_question_metadata, {
      question_id: saveResults.question_id,
      creator_id: authnUser.user_id,
    });

    question = await selectQuestionById(saveResults.question_id);
  }

  // Insert the prompt as a message.
  await execute(sql.insert_user_message, {
    question_id: question.id,
    // TODO: use `UIMessage` always, instead of sometimes a string.
    parts: run(() => {
      if (typeof prompt === 'string') {
        return JSON.stringify([{ type: 'text', text: prompt }]);
      } else {
        const parts = messages?.at(-1)?.parts;
        assert(parts, 'No parts in last message');
        return JSON.stringify(parts);
      }
    }),
  });

  // Insert the agent's message into the `messages` table.
  const messageRow = await queryRow(
    sql.insert_initial_assistant_message,
    { question_id: question.id, job_sequence_id: serverJob.jobSequenceId },
    AiQuestionGenerationMessageSchema,
  );

  // Create SSE transform stream before starting background job
  const sseStream = new JsonToSseTransformStream();

  // Create new resumable stream - the caller will need this.
  const streamContext = await getAiQuestionGenerationStreamContext();
  await streamContext.createNewResumableStream(messageRow.id, () => sseStream.readable);

  serverJob.executeInBackground(async () => {
    const { agent } = await createQuestionGenerationAgent({
      model,
      course,
      question,
      user,
      authnUser,
      hasCoursePermissionEdit,
    });

    const args = run(() => {
      if (messages) {
        return { messages: convertToModelMessages(messages) };
      } else if (prompt) {
        return { prompt };
      } else {
        throw new Error('Either prompt or messages must be provided');
      }
    });

    const res = agent.stream({
      ...args,
      providerOptions: {
        openai: {
          reasoningEffort: 'low',
          reasoningSummary: 'auto',
        } satisfies OpenAIResponsesProviderOptions,
      },
    });

    const stream = res.toUIMessageStream({
      generateMessageId: () => messageRow.id,
      onFinish: async ({ responseMessage }) => {
        const usage = await res.totalUsage;
        await execute(sql.update_message, {
          id: messageRow.id,
          parts: JSON.stringify(responseMessage.parts),
          usage_input_tokens: usage.inputTokens,
          usage_output_tokens: usage.outputTokens,
          usage_total_tokens: usage.totalTokens,
        });
      },
    });

    await stream.pipeTo(sseStream.writable);

    await addCompletionCostToIntervalUsage({
      userId: authnUser.user_id,
      usage: await res.totalUsage,
    });
  });

  return {
    question,
    message: messageRow,
    jobSequenceId: serverJob.jobSequenceId,
  };
}
