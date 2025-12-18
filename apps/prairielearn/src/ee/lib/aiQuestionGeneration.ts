import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import {
  type EmbeddingModel,
  type GenerateTextResult,
  type LanguageModel,
  type LanguageModelUsage,
  generateText,
} from 'ai';
import * as parse5 from 'parse5';

import { Cache } from '@prairielearn/cache';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type OpenAIModelId,
  calculateResponseCost,
  emptyUsage,
  formatPrompt,
  logResponseUsage,
  mergeUsage,
} from '../../lib/ai.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { chalk } from '../../lib/chalk.js';
import { config } from '../../lib/config.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import {
  IdSchema,
  type Issue,
  QuestionGenerationContextEmbeddingSchema,
} from '../../lib/db-types.js';
import { getAndRenderVariant } from '../../lib/question-render.js';
import { type ServerJob, createServerJob } from '../../lib/server-jobs.js';
import { updateCourseInstanceUsagesForAiQuestionGeneration } from '../../models/course-instance-usages.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById, selectQuestionByQid } from '../../models/question.js';
import { selectUserById } from '../../models/user.js';

import { createEmbedding, openAiUserFromAuthn, vectorToString } from './contextEmbeddings.js';
import { validateHTML } from './validateHTML.js';

const sql = loadSqlEquiv(import.meta.url);

// We're still using `4o` for question generation as it seems to have better
// cost/performance characteristics. We'll revisit moving to a newer model in
// the future.
export const QUESTION_GENERATION_OPENAI_MODEL = 'gpt-4o-2024-11-20' satisfies OpenAIModelId;

const NUM_TOTAL_ATTEMPTS = 2;

/**
 * Generates the common preamble with general PrairieLearn information for the LLM
 *
 * @param context Relevant example documents, formatted into one string.
 * @returns A string, the prompt preamble.
 */
function promptPreamble(context: string): string {
  return formatPrompt([
    '# Introduction',
    'You are an assistant that helps instructors write questions for PrairieLearn.',
    [
      'A question has a `question.html` file that can contain standard HTML, CSS, and JavaScript.',
      'It can also include PrairieLearn elements like `<pl-multiple-choice>` and `<pl-number-input>`.',
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
    '# Context',
    [
      'Here is some context that may help you respond to the user.',
      'This context may include example questions, documentation, or other information that may be helpful.',
    ],
    context,
  ]);
}

async function checkRender(
  status: 'success' | 'error',
  errors: string[],
  courseId: string,
  userId: string,
  questionId: string,
) {
  // If there was any issue generating the question, we won't yet check rendering.
  if (status === 'error' || errors.length > 0) return [];

  const question = await selectQuestionById(questionId);
  const course = await selectCourseById(courseId);
  const user = await selectUserById(userId);

  const locals = {
    // The URL prefix doesn't matter here since we won't ever show the result to the user.
    urlPrefix: '',
    question,
    course,
    user,
    authn_user: user, // We don't have a separate authn user in this case.
    is_administrator: false,
  };
  await getAndRenderVariant(null, null, locals, {
    // Needed so that we can read the error output below.
    issuesLoadExtraData: true,
  });

  // Errors should generally have stack traces. If they don't, we'll filter
  // them out, but they may not help us much.
  return ((locals as any).issues as Issue[])
    .map((issue) => issue.system_data?.courseErrData?.outputBoth as string | undefined)
    .filter((output) => output !== undefined)
    .map((output) => {
      return `When trying to render, your code created an error with the following output:\n\n\`\`\`${output}\`\`\`\n\nPlease fix it.`;
    });
}

/**
 * Builds the context string, consisting of relevant documents.
 *
 * @param embeddingModel The embedding model to use.
 * @param prompt The user's question generation prompt.
 * @param mandatoryElementNames Elements that we must pull documentation for.
 * @param authnUserId The user's authenticated user ID.
 * @returns A string of all relevant context documents.
 */
export async function makeContext(
  embeddingModel: EmbeddingModel,
  prompt: string,
  mandatoryElementNames: string[],
  authnUserId: string,
): Promise<string> {
  const embedding = await createEmbedding(embeddingModel, prompt, openAiUserFromAuthn(authnUserId));

  // Identify all elements that we are using *and* have documentation document chunks.
  const mandatoryElements =
    mandatoryElementNames.length > 0
      ? await queryRows(
          sql.select_documents_by_chunk_id,
          {
            doc_path_pattern: 'docs/elements/%',
            chunk_ids: mandatoryElementNames,
          },
          QuestionGenerationContextEmbeddingSchema,
        )
      : [];

  // The number of additional elements and documentation document chunks to include after accounting for all mandatory elements.
  const numAdditionalDocs = Math.max(5 - mandatoryElements.length, 0);

  const docs = await queryRows(
    sql.select_nearby_documents,
    { embedding: vectorToString(embedding), limit: numAdditionalDocs },
    QuestionGenerationContextEmbeddingSchema,
  );

  // Ensure that documentation for at least one element is always included.
  const elementDoc = await queryOptionalRow(
    sql.select_nearby_documents_from_file,
    {
      embedding: vectorToString(embedding),
      doc_path_pattern: 'docs/elements/%',
      limit: 1,
    },
    QuestionGenerationContextEmbeddingSchema,
  );
  if (elementDoc == null) {
    throw new Error(
      'Document embeddings not found. Ensure you have generated embeddings in the administrator settings page.',
    );
  }
  if (numAdditionalDocs > 0 && !docs.some((doc) => doc.doc_text === elementDoc.doc_text)) {
    // Override the last (least relevant) doc.
    docs[numAdditionalDocs - 1] = elementDoc;
  }

  return docs
    .concat(mandatoryElements)
    .map((doc) => doc.doc_text)
    .join('\n\n');
}

/**
 * Extracts the generated HTML and Python code from an OpenAI completion into job parameters.
 *
 * @param response The completion to extract from.
 * @param job The job whose data we want to extract into.
 */
function extractFromResponse(
  response: GenerateTextResult<any, any>,
  job: ServerJob,
): { html?: string; python?: string } {
  const completionText = response.text;

  job.info(`${chalk.bold('Completion:')}\n\n${completionText}\n`);

  logResponseUsage({ response, logger: job });

  const pythonSelector = /```python\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;
  const htmlSelector = /```html\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;

  const html = completionText.match(htmlSelector)?.groups?.code.trim();
  const python = completionText.match(pythonSelector)?.groups?.code.trim();

  const out: { html?: string; python?: string } = {};

  if (html !== undefined) {
    job.info(`\nextracted question.html:\n\n\`\`\`\n${html}\n\`\`\`\n\n`);
    out.html = html + '\n';
  }

  if (python !== undefined) {
    job.info(`\nextracted server.py:\n\n\`\`\`\n${python}\n\`\`\`\n\n`);
    out.python = python + '\n';
  }

  return out;
}

/**
 * Returns the AI question generation cache used for rate limiting.
 */
let aiQuestionGenerationCache: Cache | undefined;
export async function getAiQuestionGenerationCache() {
  // The cache variable is outside the function to avoid creating multiple instances of the same cache in the same process.
  if (aiQuestionGenerationCache) return aiQuestionGenerationCache;
  aiQuestionGenerationCache = new Cache();
  await aiQuestionGenerationCache.init({
    type: config.nonVolatileCacheType,
    keyPrefix: config.cacheKeyPrefix,
    redisUrl: config.nonVolatileRedisUrl,
  });
  return aiQuestionGenerationCache;
}

/**
 * Approximate the cost of the prompt, in US dollars.
 * Accounts for the cost of prompt, system, and completion tokens.
 */
export function approximatePromptCost({
  model,
  prompt,
}: {
  model: keyof (typeof config)['costPerMillionTokens'];
  prompt: string;
}) {
  const modelPricing = config.costPerMillionTokens[model];

  // There are approximately 4 characters per token (source: https://platform.openai.com/tokenizer),
  // so we divide the length of the prompt by 4 to approximate the number of prompt tokens.
  // Also, on average, we generate 3750 system tokens per prompt.
  const approxInputTokenCost = ((prompt.length / 4 + 3750) * modelPricing.input) / 1e6;

  // On average, we generate 1000 completion tokens per prompt. This includes reasoning tokens.
  const approxOutputTokenCost = (1000 * modelPricing.output) / 1e6;

  return approxInputTokenCost + approxOutputTokenCost;
}

const AI_QUESTION_GENERATION_RATE_LIMIT_INTERVAL_MS = 3600 * 1000; // 1 hour

/**
 * Retrieve the Redis key for a user's current AI question generation interval usage
 */
function getIntervalUsageKey(userId: number) {
  const intervalStart = Date.now() - (Date.now() % AI_QUESTION_GENERATION_RATE_LIMIT_INTERVAL_MS);
  return `ai-question-generation-usage:user:${userId}:interval:${intervalStart}`;
}

/**
 * Retrieve the user's AI question generation usage in the last hour interval, in US dollars
 */
export async function getIntervalUsage({ userId }: { userId: number }) {
  const cache = await getAiQuestionGenerationCache();
  return (await cache.get<number>(getIntervalUsageKey(userId))) ?? 0;
}

/**
 * Add the cost of a completion to the usage of the user for the current interval.
 */
export async function addCompletionCostToIntervalUsage({
  userId,
  usage,
  intervalCost,
}: {
  userId: number;
  usage: LanguageModelUsage | undefined;
  intervalCost: number;
}) {
  const cache = await getAiQuestionGenerationCache();

  const completionCost = calculateResponseCost({
    model: QUESTION_GENERATION_OPENAI_MODEL,
    usage,
  });

  // Date.now() % AI_QUESTION_GENERATION_RATE_LIMIT_INTERVAL_MS is the number of milliseconds since the beginning of the interval.
  const timeRemainingInInterval =
    AI_QUESTION_GENERATION_RATE_LIMIT_INTERVAL_MS -
    (Date.now() % AI_QUESTION_GENERATION_RATE_LIMIT_INTERVAL_MS);

  cache.set(getIntervalUsageKey(userId), intervalCost + completionCost, timeRemainingInInterval);
}

/**
 * Generates the HTML and Python code for a new question using an LLM.
 * @param params
 * @param params.model The language model to use.
 * @param params.embeddingModel The embedding model to use.
 * @param params.courseId The ID of the current course.
 * @param params.authnUserId The authenticated user's ID.
 * @param params.prompt The prompt for how to generate a question.
 * @param params.userId The ID of the generating/saving user.
 * @param params.hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privileges.
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function generateQuestion({
  model,
  embeddingModel,
  courseId,
  authnUserId,
  prompt,
  userId,
  hasCoursePermissionEdit,
}: {
  model: LanguageModel;
  embeddingModel: EmbeddingModel;
  courseId: string;
  authnUserId: string;
  prompt: string;
  userId: string;
  hasCoursePermissionEdit: boolean;
}): Promise<{
  jobSequenceId: string;
  questionId: string;
  htmlResult: string | undefined;
  pythonResult: string | undefined;
  /**
   * The context about our elements and example questions that was provided
   * to the LLM.
   */
  context: string | undefined;
  /**
   * Usage details for prompt tokens. If auto-regeneration was triggered,
   * includes sum across all prompts.
   */
  usage: LanguageModelUsage;
}> {
  const serverJob = await createServerJob({
    courseId,
    type: 'ai_question_generate',
    description: 'Generate a question with AI',
    authnUserId,
  });

  let usage = emptyUsage();

  const jobData = await serverJob.execute(async (job) => {
    const context = await makeContext(embeddingModel, prompt, [], authnUserId);

    const instructions = formatPrompt([
      promptPreamble(context),
      '# Prompt',
      [
        'A user will now ask you to create a question.',
        'Respond in a friendly but concise way.',
        'Include the contents of `question.html` and `server.py` in separate Markdown code fences, and mark each code fence with the language (either `html` or `python`).',
        'Omit `server.py` if the question does not require it (for instance, if the question does not require randomization).',
      ],
      'Here is an example of a well-formed response:',
      [
        '```html\n<!-- Question HTML goes here -->\n```',
        '```python\ndef generate(data):\n  # Code goes here\n```',
      ],
      [
        'In their prompt, they may explain how to calculate the correct answer; this is just for the backend.',
        'Do NOT display the method to calculate the correct answer in your `question.html` unless otherwise requested.',
      ],
      'Keep in mind you are not just generating an example; you are generating an actual question that the user will use directly.',
    ]);

    job.info(`${chalk.bold('Instructions:')}\n\n${instructions}`);
    job.info(`\n\n${chalk.bold('Prompt:')}\n\n${prompt}`);

    const response = await generateText({
      model,
      system: instructions,
      prompt,
      providerOptions: {
        openai: {
          safetyIdentifier: openAiUserFromAuthn(authnUserId),
        } satisfies OpenAIResponsesProviderOptions,
      },
    });

    const results = extractFromResponse(response, job);
    const html = results.html;

    let errors: string[] = [];
    if (html && typeof html === 'string') {
      errors = validateHTML(html, !!results.python);
    } else {
      errors = ['Please generate a question.html file.'];
    }

    const files: {
      'question.html'?: string;
      'server.py'?: string;
    } = {};
    if (results.html) {
      files['question.html'] = results.html;
    }
    if (results.python) {
      files['server.py'] = results.python;
    }

    const courseFilesClient = getCourseFilesClient();

    const saveResults = await courseFilesClient.createQuestion.mutate({
      course_id: courseId,
      user_id: userId,
      authn_user_id: authnUserId,
      has_course_permission_edit: hasCoursePermissionEdit,
      is_draft: true,
      files,
    });

    if (saveResults.status === 'error') {
      job.fail(`Adding question as draft failed (job sequence: ${saveResults.job_sequence_id})`);
      return;
    }

    await execute(sql.insert_draft_question_metadata, {
      question_id: saveResults.question_id,
      creator_id: authnUserId,
    });

    const ai_question_generation_prompt_id = await queryRow(
      sql.insert_ai_question_generation_prompt,
      {
        question_id: saveResults.question_id,
        prompting_user_id: authnUserId,
        prompt_type: 'initial',
        user_prompt: prompt,
        system_prompt: instructions,
        response: response.text,
        html: results.html,
        python: results.python,
        errors,
        completion: response,
        job_sequence_id: serverJob.jobSequenceId,
      },
      IdSchema,
    );

    job.data.questionId = saveResults.question_id;
    job.data.questionQid = saveResults.question_qid;

    // Aggregate usage information.
    usage = mergeUsage(usage, response.usage);

    await updateCourseInstanceUsagesForAiQuestionGeneration({
      promptId: ai_question_generation_prompt_id,
      authnUserId,
      model: QUESTION_GENERATION_OPENAI_MODEL,
      usage: response.usage,
    });

    job.data.html = html;
    job.data.python = results.python;
    job.data.context = context;

    errors.push(
      ...(await checkRender(saveResults.status, errors, courseId, userId, saveResults.question_id)),
    );

    if (errors.length > 0 && typeof job.data.questionQid === 'string') {
      const { usage: newUsage } = await regenInternal({
        job,
        model,
        embeddingModel,
        authnUserId,
        originalPrompt: prompt,
        revisionPrompt: `Please fix the following issues: \n${errors.join('\n')}`,
        originalHTML: html || '',
        originalPython: results.python,
        remainingAttempts: NUM_TOTAL_ATTEMPTS - 1,
        isAutomated: true,
        questionId: saveResults.question_id,
        courseId,
        userId,
        hasCoursePermissionEdit,
        questionQid: saveResults.question_qid,
        jobSequenceId: serverJob.jobSequenceId,
      });

      // Aggregate usage information.
      usage = mergeUsage(usage, newUsage);
    }

    job.data.promptTokens = usage.inputTokens;
    job.data.completionTokens = usage.outputTokens;
    job.data.usage = usage;
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
    questionId: jobData.data.questionId,
    htmlResult: jobData.data.html,
    pythonResult: jobData.data.python,
    context: jobData.data.context,
    usage,
  };
}

/**
 * Gets all of the tag names in an HTML parse tree.
 * @param ast The tree to use.
 * @returns All tag names in the tree.
 */
function traverseForTagNames(ast: any): Set<string> {
  const nodeNames = new Set<string>([ast.nodeName]);
  if (ast.childNodes) {
    for (const child of ast.childNodes) {
      traverseForTagNames(child).forEach((name) => nodeNames.add(name));
    }
  }
  return nodeNames;
}

/**
 * Revises a question using the LLM based on user input.
 * @param params
 * @param params.job The server job to use.
 * @param params.model The language model to use.
 * @param params.embeddingModel The embedding model to use.
 * @param params.authnUserId The authenticated user's ID.
 * @param params.originalPrompt The prompt creating the original generation.
 * @param params.revisionPrompt A prompt with user instructions on how to revise the question.
 * @param params.originalHTML The question.html file to revise.
 * @param params.originalPython The server.py file to revise.
 * @param params.remainingAttempts Number of times that regen could be called.
 * @param params.isAutomated Whether the regeneration was the result of an automated check or a human revision prompt.
 * @param params.questionId The ID of the question to edit.
 * @param params.questionQid The qid of the question to edit.
 * @param params.courseId The ID of the current course.
 * @param params.userId The ID of the generating/saving user.
 * @param params.hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privlidges.
 * @param params.jobSequenceId The ID of the server job.
 */
async function regenInternal({
  job,
  model,
  embeddingModel,
  authnUserId,
  originalPrompt,
  revisionPrompt,
  originalHTML,
  originalPython,
  remainingAttempts,
  isAutomated,
  questionId,
  questionQid,
  courseId,
  userId,
  hasCoursePermissionEdit,
  jobSequenceId,
}: {
  job: ServerJob;
  model: LanguageModel;
  embeddingModel: EmbeddingModel;
  authnUserId: string;
  originalPrompt: string;
  revisionPrompt: string;
  originalHTML: string | undefined;
  originalPython: string | undefined;
  remainingAttempts: number;
  isAutomated: boolean;
  questionId: string;
  questionQid: string | undefined;
  courseId: string;
  userId: string;
  hasCoursePermissionEdit: boolean;
  jobSequenceId: string;
}): Promise<{ usage: LanguageModelUsage | undefined }> {
  let tags: string[] = [];
  if (originalHTML) {
    const ast = parse5.parseFragment(originalHTML);
    tags = Array.from(traverseForTagNames(ast));
  }

  const context = await makeContext(embeddingModel, originalPrompt, tags, authnUserId);

  const instructions = formatPrompt([
    promptPreamble(context),
    '# Previous generation',
    'A user previously asked you to generate a question with following prompt:',
    originalPrompt,
    'You generated the following:',
    originalHTML === undefined ? '' : `\`\`\`html\n${originalHTML}\`\`\``,
    originalPython === undefined ? '' : `\`\`\`python\n${originalPython}\`\`\``,
    '# Prompt',
    [
      'A user will now ask you to revise the question that you generated.',
      'Respond in a friendly but concise way. Include the contents of `question.html` and `server.py` in separate Markdown code fences, and mark each code fence with the language (either `html` or `python`).',
      'Omit `server.py` if the question does not require it (for instance, if the question does not require randomization).',
      'You MUST NOT mention the previous generation or error(s) in any way.',
    ],
    'Keep in mind you are not just generating an example; you are generating an actual question that the user will use directly.',
  ]);

  job.info(`${chalk.bold('Instructions:')}\n\n${instructions}`);
  job.info(`${chalk.bold('Revision prompt:')}\n\n${revisionPrompt}`);

  const response = await generateText({
    model,
    system: instructions,
    prompt: revisionPrompt,
    providerOptions: {
      openai: {
        safetyIdentifier: openAiUserFromAuthn(authnUserId),
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  const results = extractFromResponse(response, job);

  const html = results.html || originalHTML;
  const python = results.python || originalPython;

  let errors: string[] = [];

  if (html && typeof html === 'string') {
    errors = validateHTML(html, !!python);
  }

  const ai_question_generation_prompt_id = await queryRow(
    sql.insert_ai_question_generation_prompt,
    {
      question_id: questionId,
      prompting_user_id: authnUserId,
      prompt_type: isAutomated ? 'auto_revision' : 'human_revision',
      user_prompt: revisionPrompt,
      system_prompt: instructions,
      response: response.text,
      html,
      python,
      errors,
      completion: response,
      job_sequence_id: jobSequenceId,
    },
    IdSchema,
  );

  const files: Record<string, string> = {};
  if (html) {
    files['question.html'] = b64EncodeUnicode(html);
  }
  if (python) {
    files['server.py'] = b64EncodeUnicode(python);
  }

  const courseFilesClient = getCourseFilesClient();

  const result = await courseFilesClient.updateQuestionFiles.mutate({
    course_id: courseId,
    user_id: userId,
    authn_user_id: authnUserId,
    has_course_permission_edit: hasCoursePermissionEdit,
    question_id: questionId,
    files,
  });

  if (result.status === 'error') {
    job.fail(`Draft mutation failed (job sequence: ${result.job_sequence_id})`);
    return { usage: response.usage };
  }

  await updateCourseInstanceUsagesForAiQuestionGeneration({
    promptId: ai_question_generation_prompt_id,
    authnUserId,
    model: QUESTION_GENERATION_OPENAI_MODEL,
    usage: response.usage,
  });

  job.data.html = html;
  job.data.python = python;

  errors.push(...(await checkRender(result.status, errors, courseId, userId, questionId)));

  let usage = response.usage;

  if (errors.length > 0 && remainingAttempts > 0) {
    const auto_revisionPrompt = `Please fix the following issues: \n${errors.join('\n')}`;
    const { usage: newUsage } = await regenInternal({
      job,
      model,
      embeddingModel,
      authnUserId,
      originalPrompt,
      revisionPrompt: auto_revisionPrompt,
      originalHTML: html,
      originalPython: python,
      remainingAttempts: remainingAttempts - 1,
      isAutomated: true,
      questionId,
      questionQid,
      courseId,
      userId,
      hasCoursePermissionEdit,
      jobSequenceId,
    });

    // Aggregate usage information.
    usage = mergeUsage(usage, newUsage);
  }

  return { usage };
}

/**
 * Revises a question using the LLM based on user input.
 *
 * @param params
 * @param params.model The language model to use.
 * @param params.embeddingModel The embedding model to use.
 * @param params.courseId The ID of the current course.
 * @param params.authnUserId The authenticated user's ID.
 * @param params.originalPrompt The prompt creating the original generation.
 * @param params.revisionPrompt A prompt with user instructions on how to revise the question.
 * @param params.originalHTML The question.html file to revise.
 * @param params.originalPython The server.py file to revise.
 * @param params.questionQid The qid of the question to edit.
 * @param params.userId The ID of the generating/saving user.
 * @param params.hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privileges.
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function regenerateQuestion({
  model,
  embeddingModel,
  courseId,
  authnUserId,
  originalPrompt,
  revisionPrompt,
  originalHTML,
  originalPython,
  questionQid,
  userId,
  hasCoursePermissionEdit,
}: {
  model: LanguageModel;
  embeddingModel: EmbeddingModel;
  courseId: string;
  authnUserId: string;
  originalPrompt: string;
  revisionPrompt: string;
  originalHTML: string;
  originalPython: string;
  questionQid: string;
  userId: string;
  hasCoursePermissionEdit: boolean;
}): Promise<{
  jobSequenceId: string;
  htmlResult: string | undefined;
  pythonResult: string | undefined;
  usage: LanguageModelUsage | undefined;
}> {
  const serverJob = await createServerJob({
    courseId,
    type: 'ai_question_regenerate',
    description: 'Revise a question using the LLM',
    authnUserId,
  });

  const question = await selectQuestionByQid({ qid: questionQid, course_id: courseId });

  let usage = emptyUsage();

  const jobData = await serverJob.execute(async (job) => {
    job.data.questionQid = questionQid;
    const { usage: newUsage } = await regenInternal({
      job,
      model,
      embeddingModel,
      authnUserId,
      originalPrompt,
      revisionPrompt,
      originalHTML,
      originalPython,
      remainingAttempts: NUM_TOTAL_ATTEMPTS,
      isAutomated: false,
      questionId: question.id,
      questionQid,
      courseId,
      userId,
      hasCoursePermissionEdit,
      jobSequenceId: serverJob.jobSequenceId,
    });

    usage = mergeUsage(usage, newUsage);

    job.data.promptTokens = usage.inputTokens;
    job.data.completionTokens = usage.outputTokens;
    job.data.usage = usage;
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
    htmlResult: jobData.data.html,
    pythonResult: jobData.data.python,
    usage,
  };
}
