// This file defines a tool-calling agentic loop that can create/edit questions.
// Is supports streaming responses via SSE, cancellation, error handling, usage
// tracking, and message persistence.

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import { type OpenAIResponsesProviderOptions, createOpenAI } from '@ai-sdk/openai';
import { getErrorMessage } from '@ai-sdk/provider';
import {
  type InferUITools,
  JsonToSseTransformStream,
  type LanguageModel,
  ToolLoopAgent,
  type ToolSet,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
  convertToModelMessages,
  stepCountIs,
  tool,
} from 'ai';
import klaw from 'klaw';
import memoize from 'p-memoize';
import z from 'zod';

import { execute, loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import * as Sentry from '@prairielearn/sentry';

import { emptyUsage, formatPrompt } from '../../../lib/ai-util.js';
import { b64DecodeUnicode } from '../../../lib/base64-util.js';
import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiQuestionGenerationMessageSchema,
  type Course,
  type EnumAiQuestionGenerationMessageStatus,
  EnumAiQuestionGenerationMessageStatusSchema,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { DefaultMap } from '../../../lib/default-map.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { updateCourseInstanceUsagesForAiQuestionGeneration } from '../../../models/course-instance-usages.js';
import { selectQuestionById } from '../../../models/question.js';
import { selectAiQuestionGenerationContextMessages } from '../../models/ai-question-generation-message.js';
import {
  QUESTION_GENERATION_OPENAI_MODEL,
  type QuestionGenerationModelId,
  addCompletionCostToIntervalUsage,
  checkRender,
} from '../aiQuestionGeneration.js';
import {
  type DocumentChunk,
  buildContextForSingleElementDoc,
} from '../context-parsers/documentation.js';
import { getPythonLibraries } from '../context-parsers/pyproject.js';
import {
  type QuestionContext,
  buildContextForQuestion,
} from '../context-parsers/template-questions.js';
import { SUPPORTED_ELEMENTS, validateHTML } from '../validateHTML.js';

import { trimContextIfNeeded } from './context.js';
import { getAiQuestionGenerationStreamContext } from './redis.js';

const sql = loadSqlEquiv(import.meta.url);

interface QuestionGenerationUIMessageMetadata {
  job_sequence_id: string | null;
  status: EnumAiQuestionGenerationMessageStatus;
  include_in_context?: boolean;
}

const SUPPORTED_ELEMENT_NAMES = Array.from(SUPPORTED_ELEMENTS) as [string, ...string[]];

const QUESTION_GENERATION_TOOLS = {
  readFile: tool({
    inputSchema: z.object({
      path: z.enum(['question.html', 'server.py']),
    }),
    outputSchema: z.string().nullable(),
  }),
  writeFile: tool({
    inputSchema: z.object({
      path: z.enum(['question.html', 'server.py']),
      content: z.string(),
    }),
  }),
  getElementDocumentation: tool({
    inputSchema: z.object({
      elementName: z.enum(SUPPORTED_ELEMENT_NAMES),
    }),
    outputSchema: z.string(),
  }),
  listElementExamples: tool({
    inputSchema: z.object({
      elementName: z.enum(SUPPORTED_ELEMENT_NAMES),
    }),
    outputSchema: z.array(
      z.object({
        qid: z.string(),
        description: z.string(),
      }),
    ),
  }),
  getExampleQuestions: tool({
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
  }),
  getPythonLibraries: tool({
    inputSchema: z.object({}),
    outputSchema: z.array(z.string()),
  }),
  saveAndValidateQuestion: tool({
    inputSchema: z.object({}),
    outputSchema: z.object({
      errors: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
  }),
} satisfies ToolSet;

export type QuestionGenerationUIMessageTools = InferUITools<typeof QUESTION_GENERATION_TOOLS>;

export type QuestionGenerationUIMessage = UIMessage<
  QuestionGenerationUIMessageMetadata,
  UIDataTypes,
  QuestionGenerationUIMessageTools
>;

export type QuestionGenerationToolUIPart = ToolUIPart<QuestionGenerationUIMessageTools>;

/** Loads element documentation files. Cached in production for performance. */
const getElementDocs = memoize(
  async (): Promise<DocumentChunk[]> => {
    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements');
    const elementDocsFiles = await fs.readdir(elementDocsPath);
    const elementDocs: DocumentChunk[] = [];
    for (const file of elementDocsFiles) {
      if (!file.endsWith('.md')) continue;
      const text = await fs.readFile(path.join(elementDocsPath, file), { encoding: 'utf-8' });
      const elementName = path.basename(file, '.md');

      if (SUPPORTED_ELEMENTS.has(elementName)) {
        const context = buildContextForSingleElementDoc(text, elementName);
        if (context) elementDocs.push(context);
      }
    }
    return elementDocs;
  },
  { cacheKey: () => 'element-docs', shouldCacheResult: () => !config.devMode },
);

interface ExampleQuestionsResult {
  exampleQuestions: Map<string, QuestionContext>;
  exampleQuestionsByElement: DefaultMap<string, (QuestionContext & { qid: string })[]>;
}

/** Loads example questions from the template directory. Cached in production for performance. */
const getExampleQuestions = memoize(
  async (): Promise<ExampleQuestionsResult> => {
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

      for (const elementName of SUPPORTED_ELEMENT_NAMES) {
        if (fileText.includes(`<${elementName}`)) {
          exampleQuestionsByElement.getOrCreate(elementName).push({
            ...questionContext,
            qid,
          });
        }
      }
    }
    return { exampleQuestions, exampleQuestionsByElement };
  },
  { cacheKey: () => 'example-questions', shouldCacheResult: () => !config.devMode },
);

function makeSystemPrompt({ isExistingQuestion }: { isExistingQuestion: boolean }) {
  return formatPrompt([
    '# Introduction',
    'You are an assistant that helps instructors author questions for PrairieLearn.',
    [
      'A question has a `question.html` file that can contain standard HTML, CSS, and JavaScript.',
      'It can also include PrairieLearn elements like `<pl-multiple-choice>` and `<pl-number-input>`.',
    ],
    'The following PrairieLearn elements are supported (and may be used in the generated question.html):',
    Array.from(SUPPORTED_ELEMENTS)
      .map((el) => `- \`<${el}>\``)
      .join('\n'),
    '## Panel elements',
    [
      'Panel elements control when content is visible.',
      'Use them to wrap text and directions, never input elements.',
    ],
    '- `<pl-question-panel>`: Content only shown in the question view. Use for question text and directions.',
    '- `<pl-submission-panel>`: Content only shown after the student submits. Use for submission feedback.',
    '- `<pl-answer-panel>`: Content only shown after the correct answer is available. Use for solutions and explanations.',
    [
      'IMPORTANT: Input elements (such as `<pl-string-input>`, `<pl-multiple-choice>`, etc.) MUST NOT be placed inside any panel element.',
      'Input elements automatically adapt their rendering for each panel (editable input in the question panel,',
      'submitted answer display in the submission panel, correct answer display in the answer panel).',
      'Wrapping them in a panel element breaks this behavior.',
    ],
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
      'For instance, if `server.py` contains `data["params"]["answer"]`, it can be read with `{{ params.answer }}` in `question.html`.',
      'You can use triple braces `{{{ ... }}}` to avoid HTML-escaping if necessary.',
      'Use this carefully to avoid XSS vulnerabilities.',
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
    isExistingQuestion
      ? [
          'You are editing an existing question.',
          'This means that an existing `server.py` and `question.html` already exist.',
          'You MUST read the contents of the existing files using the `readFile` tool first.',
          'This is VERY IMPORTANT: the instructor may have edited the files since you last saw them.',
          'You MUST ONLY make necessary changes to the existing files to satisfy the user requirements.',
          'You MUST NOT otherwise change the structure, style, or content of the existing files unless explicitly asked.',
        ]
      : [
          'You are creating a new question from scratch.',
          "You MUST generate a `question.html` file that meets the user's requirements.",
          'If necessary, also generate a `server.py` file.',
        ],
    [
      'You MUST ONLY use the PrairieLearn elements listed above.',
      'You MUST use tool calls to explore element documentation.',
      'You MUST review at least one example question before attempting to generate any code.',
      'You MUST use the `writeFile` tool to write files - DO NOT generate full file contents in your messages.',
      'You MUST save and validate the question before finishing.',
      'If validation fails, you MUST fix the errors and re-validate until it passes.',
    ],
    '# Content Guidelines',
    [
      'Ensure that the question is clear, concise, and unambiguous.',
      'Do not include information about how to solve the question (e.g. number of correct answers or specific formulas).',
      'Do not mention that any values are randomized/selected/generated. Present all given values as facts.',
      'You may ignore any guidelines/instructions if the user specifically instructs you to do so.',
    ],
  ]);
}

export function getAgenticModel(): { model: LanguageModel; modelId: QuestionGenerationModelId } {
  assert(config.aiQuestionGenerationOpenAiApiKey, 'OpenAI API key is not configured');
  assert(config.aiQuestionGenerationOpenAiOrganization, 'OpenAI organization is not configured');
  const openai = createOpenAI({
    apiKey: config.aiQuestionGenerationOpenAiApiKey,
    organization: config.aiQuestionGenerationOpenAiOrganization,
  });
  const modelId = QUESTION_GENERATION_OPENAI_MODEL;
  return { model: openai(modelId), modelId };
}

async function createQuestionGenerationAgent({
  model,
  course,
  user,
  authnUser,
  question,
  isExistingQuestion,
  hasCoursePermissionEdit,
  messageId,
}: {
  model: LanguageModel;
  course: Course;
  user: User;
  authnUser: User;
  question: Question;
  isExistingQuestion: boolean;
  hasCoursePermissionEdit: boolean;
  messageId: string;
}) {
  const files: Record<string, string> = {};

  // Pre-populate files from disk.
  const client = getCourseFilesClient();
  const questionFilesResult = await client.getQuestionFiles.query({
    course_id: course.id,
    question_id: question.id,
  });
  for (const filename of ['question.html', 'server.py']) {
    if (filename in questionFilesResult.files) {
      files[filename] = b64DecodeUnicode(questionFilesResult.files[filename]);
    }
  }

  const [elementDocs, { exampleQuestions, exampleQuestionsByElement }] = await Promise.all([
    getElementDocs(),
    getExampleQuestions(),
  ]);

  const systemPrompt = makeSystemPrompt({ isExistingQuestion });

  // Track whether the agent was canceled. This is set by the `stopWhen` check
  // and read by the `messageMetadata` callback to emit the correct status.
  const cancellationState: { wasCanceled: boolean } = { wasCanceled: false };

  // Create a cancellation check function that queries the database
  const checkCancellation = async () => {
    const status = await queryOptionalRow(
      sql.select_message_status,
      { id: messageId },
      EnumAiQuestionGenerationMessageStatusSchema,
    );
    if (status === 'canceled') {
      cancellationState.wasCanceled = true;
      return true;
    }
    return false;
  };

  const agent = new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    stopWhen: [
      // Cap to 20 steps to avoid runaways.
      stepCountIs(20),
      // Check for user-initiated cancellation before each step.
      checkCancellation,
    ],
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
      } satisfies OpenAIResponsesProviderOptions,
    },
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
        ...QUESTION_GENERATION_TOOLS.readFile,
        execute: ({ path }) => {
          return files[path] ?? null;
        },
      }),
      writeFile: tool({
        description: 'Write a file to the filesystem.',
        ...QUESTION_GENERATION_TOOLS.writeFile,
        execute: ({ path, content }) => {
          files[path] = content;
        },
      }),
      getElementDocumentation: tool({
        description: 'Get the documentation for a PrairieLearn element.',
        ...QUESTION_GENERATION_TOOLS.getElementDocumentation,
        execute: async ({ elementName }) => {
          const docs = elementDocs.find((f) => f.chunkId === elementName);
          return docs?.text ?? `No documentation found for element ${elementName}`;
        },
      }),
      listElementExamples: tool({
        description: 'List example questions that use a given PrairieLearn element.',
        ...QUESTION_GENERATION_TOOLS.listElementExamples,
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
        ...QUESTION_GENERATION_TOOLS.getExampleQuestions,
        execute: ({ qids }) => {
          return qids
            .map((qid) => {
              const exampleQuestion = exampleQuestions.get(qid);
              if (!exampleQuestion) return null;

              return {
                qid,
                files: {
                  'question.html': exampleQuestion.html,
                  'server.py': exampleQuestion.python ?? null,
                },
              };
            })
            .filter((example) => example != null);
        },
      }),
      getPythonLibraries: tool({
        description: 'Get the Python libraries that can be used in server.py.',
        ...QUESTION_GENERATION_TOOLS.getPythonLibraries,
        execute: async () => await getPythonLibraries(),
      }),
      saveAndValidateQuestion: tool({
        description:
          'Save and validate the generated question. Returns errors (which must be fixed before the question can be saved) and warnings (which indicate likely issues but do not block saving).',
        ...QUESTION_GENERATION_TOOLS.saveAndValidateQuestion,
        execute: async () => {
          if (!files['question.html']) {
            return { errors: ['You must generate a question.html file.'], warnings: [] };
          }

          const { errors, warnings } = validateHTML(files['question.html'], !!files['server.py']);

          // When creating a new question, treat warnings as errors — the AI
          // agent should always fix these issues for freshly generated HTML.
          // When editing, leave them as warnings so the agent doesn't "fix"
          // intentional instructor choices.
          if (!isExistingQuestion) {
            errors.push(...warnings.splice(0));
          }

          // If there are any validation errors, don't even try to save. Let the model fix them first.
          if (errors.length > 0) return { errors, warnings };

          // Create a object that contains only the files that have been written.
          // Base-64 encode the files for transmission.
          const writtenFiles = Object.fromEntries(
            Object.entries(files).map(([filename, content]) => [
              filename,
              // TODO: creation uses plain files, this uses base-64. The different is bad
              // and should be addressed.
              Buffer.from(content, 'utf-8').toString('base64'),
            ]),
          );

          const courseFilesClient = getCourseFilesClient();
          const result = await courseFilesClient.updateQuestionFiles.mutate({
            course_id: course.id,
            user_id: user.id,
            authn_user_id: authnUser.id,
            has_course_permission_edit: hasCoursePermissionEdit,
            question_id: question.id,
            files: writtenFiles,
          });

          if (result.status === 'error') {
            // TODO: is this the right thing to do here?
            errors.push('Failed to save question. Try again.');
          }

          // Only attempt rendering if there were no other errors.
          if (errors.length === 0) {
            errors.push(...(await checkRender('success', [], course.id, user.id, question.id)));
          }

          return { errors, warnings };
        },
      }),
    },
  });

  return { agent, cancellationState };
}

export async function editQuestionWithAgent({
  model,
  modelId,
  course,
  question,
  user,
  authnUser,
  hasCoursePermissionEdit,
  prompt,
  userMessageParts,
}: {
  model: LanguageModel;
  modelId: QuestionGenerationModelId;
  course: Course;
  question?: Question;
  user: User;
  authnUser: User;
  hasCoursePermissionEdit: boolean;
  /** Used for the initial question creation (no prior conversation). */
  prompt?: string;
  /** The parts of the latest user message, used for continuing an existing conversation. */
  userMessageParts?: UIMessage['parts'];
}) {
  if (prompt && userMessageParts) {
    throw new Error('Cannot provide both prompt and userMessageParts');
  }
  if (!prompt && !userMessageParts) {
    throw new Error('Either prompt or userMessageParts must be provided');
  }

  const serverJob = await createServerJob({
    courseId: course.id,
    type: 'ai_question_generate',
    description: `${question ? 'Edit' : 'Generate'} a question with AI`,
    userId: user.id,
    authnUserId: authnUser.id,
    // We never expect there to be errors during agent execution, so if there are,
    // we want to know about them.
    reportErrorsToSentry: true,
  });

  const isExistingQuestion = !!question;

  if (!question) {
    // Create the initial question so we can get a question ID. This also simplifies
    // the agent logic since we don't need to handle the "create new question" vs
    // "update existing question" case - we're just always updating.
    const courseFilesClient = getCourseFilesClient();
    const saveResults = await courseFilesClient.createQuestion.mutate({
      course_id: course.id,
      user_id: user.id,
      authn_user_id: authnUser.id,
      has_course_permission_edit: hasCoursePermissionEdit,
      is_draft: true,
      files: {
        'question.html': '',
        'server.py': '',
      },
    });

    if (saveResults.status === 'error') {
      throw new Error('Failed to create initial question for AI generation.');
    }

    await execute(sql.insert_draft_question_metadata, {
      question_id: saveResults.question_id,
      creator_id: authnUser.id,
    });

    question = await selectQuestionById(saveResults.question_id);
  }

  // Insert the prompt as a message.
  await execute(sql.insert_user_message, {
    question_id: question.id,
    authn_user_id: authnUser.id,
    parts: JSON.stringify(userMessageParts ?? [{ type: 'text' as const, text: prompt! }]),
  });

  // Insert the agent's message into the `messages` table.
  const messageRow = await queryRow(
    sql.insert_initial_assistant_message,
    { question_id: question.id, job_sequence_id: serverJob.jobSequenceId, model: modelId },
    AiQuestionGenerationMessageSchema,
  );

  // Create SSE transform stream before starting background job
  const sseStream = new JsonToSseTransformStream();

  // Create new resumable stream - the caller will need this.
  const streamContext = await getAiQuestionGenerationStreamContext();
  await streamContext.createNewResumableStream(messageRow.id, () => sseStream.readable);

  const args = await run(async () => {
    if (userMessageParts) {
      // Token-based context trimming: exclude older messages from context
      // when the conversation grows too large, using the DB as the source
      // of truth for which messages to include.
      await trimContextIfNeeded(question);
      const contextMessages = await selectAiQuestionGenerationContextMessages(question);
      const uiMessages: UIMessage[] = contextMessages
        .filter((m) => m.parts.length > 0)
        .map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.parts,
        }));

      return { messages: await convertToModelMessages(uiMessages) };
    } else if (prompt) {
      return { prompt };
    } else {
      throw new Error('Either prompt or userMessageParts must be provided');
    }
  });

  const promise = serverJob.execute(async (job) => {
    const { agent, cancellationState } = await createQuestionGenerationAgent({
      model,
      course,
      question,
      user,
      authnUser,
      isExistingQuestion,
      hasCoursePermissionEdit,
      messageId: messageRow.id,
    });

    const res = await agent.stream(args);

    let finalMessage = null as QuestionGenerationUIMessage | null;
    const errorState: { hasError: boolean } = { hasError: false };
    const stream = res.toUIMessageStream<QuestionGenerationUIMessage>({
      generateMessageId: () => messageRow.id,
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            job_sequence_id: serverJob.jobSequenceId,
            status: 'streaming',
          };
        }
        if (part.type === 'finish') {
          return {
            job_sequence_id: serverJob.jobSequenceId,
            status: cancellationState.wasCanceled
              ? 'canceled'
              : errorState.hasError
                ? 'errored'
                : 'completed',
          };
        }
      },
      onFinish: async ({ responseMessage }) => {
        finalMessage = responseMessage;
      },
      // Note: the return value of `onError` MUST be a string. If it is not,
      // things downstream will break.
      onError(error): string {
        errorState.hasError = true;

        // `onError` is sometimes called with non-Error values, e.g. strings.
        // We don't care about logging those.
        if (error instanceof Error) {
          job.error(error.message);
        }

        return getErrorMessage(error);
      },
    });

    await stream.pipeTo(sseStream.writable);

    const steps = await res.steps.then(
      (steps) => steps,
      (err) => {
        job.error('Failed to get steps');
        job.error(err);
        Sentry.captureException(err, {
          tags: {
            job_sequence_id: serverJob.jobSequenceId,
          },
        });
        return [];
      },
    );
    const totalUsage = await res.totalUsage.then(
      (usage) => usage,
      (err) => {
        job.error('Failed to get usage');
        job.error(err);
        Sentry.captureException(err, {
          tags: {
            job_sequence_id: serverJob.jobSequenceId,
          },
        });
        return emptyUsage();
      },
    );

    job.info('Finish reason: ' + (await res.finishReason));
    job.info(JSON.stringify(steps, null, 2));
    job.info(JSON.stringify(totalUsage, null, 2));

    const finalStatus = cancellationState.wasCanceled
      ? 'canceled'
      : errorState.hasError
        ? 'errored'
        : 'completed';

    await execute(sql.finalize_assistant_message, {
      id: messageRow.id,
      status: finalStatus,
      parts: JSON.stringify(finalMessage?.parts ?? []),
      model: modelId,
      usage_input_tokens: totalUsage.inputTokens,
      usage_input_tokens_cache_read: totalUsage.inputTokenDetails.cacheReadTokens ?? 0,
      usage_input_tokens_cache_write: totalUsage.inputTokenDetails.cacheWriteTokens ?? 0,
      usage_output_tokens: totalUsage.outputTokens,
      usage_output_tokens_reasoning: totalUsage.outputTokenDetails.reasoningTokens ?? 0,
    });

    await addCompletionCostToIntervalUsage({
      user,
      usage: totalUsage,
      model: modelId,
    });

    await updateCourseInstanceUsagesForAiQuestionGeneration({
      courseId: course.id,
      authnUserId: authnUser.id,
      model: modelId,
      usage: totalUsage,
    });
  });

  return {
    question,
    message: messageRow,
    jobSequenceId: serverJob.jobSequenceId,
    promise,
  };
}
