import { type OpenAI } from 'openai';
import * as parse5 from 'parse5';
import { z } from 'zod';

import { loadSqlEquiv, queryRows, queryRow, queryAsync } from '@prairielearn/postgres';

import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { QuestionGenerationContextEmbeddingSchema, QuestionSchema } from '../../lib/db-types.js';
import { type ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { createEmbedding, openAiUserFromAuthn, vectorToString } from './contextEmbeddings.js';
import { validateHTML } from './validateHTML.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Generates the common preamble with general PrairieLearn information for the LLM
 *
 * @param context Relevant example documents, formatted into one string.
 * @returns A string, the prompt preamble.
 */
function promptPreamble(context: string): string {
  return `# Introduction

You are an assistant that helps instructors write questions for PrairieLearn.

A question has a \`question.html\` file that can contain standard HTML, CSS, and JavaScript. It also includes PrairieLearn elements like \`<pl-multiple-choice>\` and \`<pl-number-input>\`.

A question may also have a \`server.py\` file that can randomly generate unique parameters and answers, and which can also assign grades to student submissions. \`server.py\` may be omitted if it's not necessary.

## Generating random parameters

\`server.py\` may define a \`generate\` function. \`generate\` has a single parameter \`data\` which can be modified by reference. It has the following properties:

- \`params\`: A dictionary. Random parameters, choices, etc. can be written here for later retrieval.

## Using random parameters

Parameters can be read in \`question.html\` with Mustache syntax. For instance, if \`server.py\` contains \`data["params"]["answer"]\`, it can be read with \`{{ params.answer }}\` in \`question.html\`.

# Context

Here is some context that may help you respond to the user. This context may include example questions, documentation, or other information that may be helpful.

${context}

`;
}

/**
 * Builds the context string, consisting of relevant documents.
 *
 * @param client The OpenAI client to use.
 * @param prompt The user's question generation prompt.
 * @param promptUserInput The user's indication of how to create student input boxes.
 * @param mandatoryElementNames Elements that we must pull documentation for.
 * @param authnUserId The user's authenticated user ID.
 * @returns A string of all relevant context documents.
 */
async function makeContext(
  client: OpenAI,
  prompt: string,
  promptUserInput: string | undefined,
  mandatoryElementNames: string[],
  authnUserId: string,
): Promise<string> {
  const embedding = await createEmbedding(client, prompt, openAiUserFromAuthn(authnUserId));

  // Identify all elements that we are using *and* have documentation document chunks.
  const mandatoryElements =
    mandatoryElementNames.length > 0
      ? await queryRows(
          sql.select_documents_by_chunk_id,
          {
            doc_path: 'docs/elements.md',
            chunk_ids: mandatoryElementNames,
          },
          QuestionGenerationContextEmbeddingSchema,
        )
      : [];

  const numElements = Math.max(5 - mandatoryElements.length, 0);

  const docs = await queryRows(
    sql.select_nearby_documents,
    { embedding: vectorToString(embedding), limit: numElements },
    QuestionGenerationContextEmbeddingSchema,
  );

  // If a prompt specifies how user input is handled, try to find documentation for those types of input
  // and save as last doc. Regeneration prompts don't use this, so promptUserInput may be undefined.
  if (promptUserInput !== undefined) {
    const embeddingUserInput = await createEmbedding(
      client,
      promptUserInput,
      openAiUserFromAuthn(authnUserId),
    );

    const elementDoc = await queryRow(
      sql.select_nearby_documents_from_file,
      {
        embedding: vectorToString(embeddingUserInput),
        doc_path: 'docs/elements.md',
        limit: 1,
      },
      QuestionGenerationContextEmbeddingSchema,
    );
    if (numElements > 0 && !docs.some((doc) => doc.doc_text === elementDoc.doc_text)) {
      // Override the last (least relevant) doc.
      docs[numElements - 1] = elementDoc;
    }
  }

  return docs
    .concat(mandatoryElements)
    .map((doc) => doc.doc_text)
    .join('\n\n');
}

/**
 * Extracts the generated HTML and Python code from an OpenAI completion into job parameters.
 *
 * @param completion The completion to extract from.
 * @param job The job whose data we want to extract into.
 */
function extractFromCompletion(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  job: ServerJob,
): { html?: string; python?: string } {
  const completionText = completion.choices[0].message.content;

  job.info(`completion is ${completionText}`);

  job.info(`used ${completion?.usage?.total_tokens} OpenAI tokens to generate response.`);

  const pythonSelector = /```python\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;
  const htmlSelector = /```html\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;

  const html = completionText?.match(htmlSelector)?.groups?.code;
  const python = completionText?.match(pythonSelector)?.groups?.code;

  const out = {};

  if (html !== undefined) {
    job.info(`extracted html file: ${html}`);
    out['html'] = html;
  }

  if (python !== undefined) {
    job.info(`extracted python file: ${python}`);
    out['python'] = python;
  }

  return out;
}

/**
 * Generates the HTML and Python code for a new question using an LLM.
 *
 * @param client The OpenAI client to use.
 * @param courseId The ID of the current course.
 * @param authnUserId The authenticated user's ID.
 * @param promptGeneral The prompt for how to generate a question.
 * @param promptUserInput The prompt for how to take user input.
 * @param promptGrading The prompt for how to grade user input.
 * @param userId The ID of the generating/saving user.
 * @param hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privlidges.
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function generateQuestion({
  client,
  courseId,
  authnUserId,
  promptGeneral,
  promptUserInput,
  promptGrading,
  userId,
  hasCoursePermissionEdit,
}: {
  client: OpenAI;
  courseId: string;
  authnUserId: string;
  promptGeneral: string;
  promptUserInput: string;
  promptGrading: string;
  userId?: string | undefined;
  hasCoursePermissionEdit?: boolean | undefined;
}): Promise<{
  jobSequenceId: string;
  questionQid: string;
  htmlResult: string | undefined;
  pythonResult: string | undefined;
}> {
  const serverJob = await createServerJob({
    courseId,
    type: 'ai_question_generate',
    description: 'Generate a question with AI',
    authnUserId,
  });

  const jobData = await serverJob.execute(async (job) => {
    const userPrompt = `${promptGeneral}
    
    You should provide the following input methods for students to answer: ${promptUserInput}
    
    To calculate the right answer, you should: ${promptGrading}`;

    job.info(`prompt is ${userPrompt}`);

    const context = await makeContext(client, userPrompt, promptUserInput, [], authnUserId);

    const sysPrompt = `
${promptPreamble(context)}
# Prompt

A user will now request your help in creating a question. Respond in a friendly but concise way. Include \`question.html\` and \`server.py\` in Markdown code fences in your response, and tag each code fence with the language (either \`html\` or \`python\`). Omit \`server.py\` if the question does not require it (for instance, if the question does not require randomization).

Keep in mind you are not just generating an example; you are generating an actual question that the user will use directly.`;

    job.info(`system prompt is: ${sysPrompt}`);

    // TODO [very important]: normalize to prevent prompt injection attacks
    const completion = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ],
      user: openAiUserFromAuthn(authnUserId),
    });

    const results = extractFromCompletion(completion, job);
    const html = results?.html;

    let errors: string[] = [];
    if (html && typeof html === 'string') {
      errors = validateHTML(html, false, !!results?.python);
    } else {
      errors = ['Please generate a question.html file.'];
    }

    if (userId !== undefined && hasCoursePermissionEdit !== undefined) {
      const files = {};

      if (results?.html) {
        files['question.html'] = results?.html;
      }

      if (results?.python) {
        files['server.py'] = results?.python;
      }

      const draftNumber = await queryRow(sql.update_draft_number, { course_id: courseId }, z.number());

      const client = getCourseFilesClient();

      const qid = `__drafts__/draft_${draftNumber}`;

      await client.createQuestion.mutate({
        course_id: courseId,
        user_id: userId,
        authn_user_id: authnUserId,
        has_course_permission_edit: hasCoursePermissionEdit,
        qid,
        title: `draft ${draftNumber}`,
        files,
      });

      await queryAsync(sql.insert_draft_info, {
        qid,
        course_id: courseId,
        creator_id: authnUserId,
      });

      await queryAsync(sql.insert_prompt_info, {
        qid,
        course_id: courseId,
        prompting_uid: authnUserId,
        prompt_type: 'initial_prompt',
        user_prompt: userPrompt,
        context,
        response: completion.choices[0].message.content,
        title: 'temporary draft placeholder (todo: fix)',
        uuid: `draft_${draftNumber}_todo_fix`,
        html: results?.html,
        python: results?.python,
        errors,
        completion,
      });
      job.data['questionQid'] = qid;
    }

    job.data.html = html;
    job.data.python = results?.python;

    if (errors.length > 0 && typeof job.data.questionQid === 'string') {
      await regenInternal(
        job,
        client,
        authnUserId,
        userPrompt,
        `Please fix the following issues: \n${errors.join('\n')}`,
        html || '',
        typeof results?.python === 'string' ? results?.python : undefined,
        0,
        true,
        job.data.questionQid,
        courseId,
        userId,
        hasCoursePermissionEdit,
      );
    }
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
    questionQid: jobData.data.questionQid,
    htmlResult: jobData.data.html,
    pythonResult: jobData.data.python,
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
 *
 * @param client The OpenAI client to use.
 * @param authnUserId The authenticated user's ID.
 * @param originalPrompt The prompt creating the original generation.
 * @param revisionPrompt A prompt with user instructions on how to revise the question.
 * @param originalHTML The question.html file to revise.
 * @param originalPython The server.py file to revise.
 * @param numRegens Number of times that regen could be called.
 * @param isAutomated Whether the regeneration was the result of an automated check or a human revision prompt.
 * @param questionQid The qid of the question to edit.
 * @param courseId The ID of the current course.
 * @param userId The ID of the generating/saving user.
 * @param hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privlidges.
 */
async function regenInternal(
  job: ServerJob,
  client: OpenAI,
  authnUserId: string,
  originalPrompt: string,
  revisionPrompt: string,
  originalHTML: string,
  originalPython: string | undefined,
  numRegens: number,
  isAutomated: boolean,
  questionQid: string | undefined,
  courseId: string,
  userId?: string | undefined,
  hasCoursePermissionEdit?: boolean | undefined,
) {
  job.info(`prompt is ${revisionPrompt}`);

  let tags: string[] = [];
  if (originalHTML) {
    const ast = parse5.parseFragment(originalHTML);
    tags = Array.from(traverseForTagNames(ast));
  }

  const context = await makeContext(client, originalPrompt, undefined, tags, authnUserId);

  const sysPrompt = `
${promptPreamble(context)}
# Previous Generations

A user previously used the assistant to generate a question with following prompt:

${originalPrompt}

You generated the following:

${
  originalHTML === undefined
    ? ''
    : `\`\`\`html
${originalHTML}
\`\`\``
}

${
  originalPython === undefined
    ? ''
    : `\`\`\`python
${originalPython}
\`\`\``
}

# Prompt

A user will now request your help in in revising the question that you generated. Respond in a friendly but concise way. Include \`question.html\` and \`server.py\` in Markdown code fences in your response, and tag each code fence with the language (either \`html\` or \`python\`). Omit \`server.py\` if the question does not require it (for instance, if the question does not require randomization).

Keep in mind you are not just generating an example; you are generating an actual question that the user will use directly.
`;

  job.info(`system prompt is: ${sysPrompt}`);

  // TODO [very important]: normalize to prevent prompt injection attacks

  const completion = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: revisionPrompt },
    ],
    user: openAiUserFromAuthn(authnUserId),
  });

  const results = extractFromCompletion(completion, job);

  const html = results?.html || originalHTML;

  let errors: string[] = [];

  if (html && typeof html === 'string') {
    errors = validateHTML(html, false, !!results?.python);
  }

  if (userId !== undefined && hasCoursePermissionEdit !== undefined) {
    await queryAsync(sql.insert_prompt_info, {
      qid: questionQid,
      course_id: courseId,
      prompting_uid: authnUserId,
      prompt_type: isAutomated ? 'autorevision' : 'human_revision',
      user_prompt: revisionPrompt,
      context,
      response: completion.choices[0].message.content,
      title: 'temporary draft placeholder (todo: fix)',
      uuid: `${questionQid}_todo_fix`,
      html: results?.html,
      python: results?.python,
      errors,
      completion,
    });

    const question = await queryRow(
      sql.select_question_by_qid_and_course,
      { qid: questionQid, course_id: courseId },
      QuestionSchema,
    );

    const files: Record<string, string> = {};
    if (results?.html) {
      files['question.html'] = results?.html;
    }

    if (results?.python) {
      files['server.py'] = results?.python;
    }

    const client = getCourseFilesClient();

    if (question.qid) {
      await client.updateQuestionFiles.mutate({
        course_id: courseId,
        user_id: userId,
        authn_user_id: authnUserId,
        has_course_permission_edit: hasCoursePermissionEdit,
        question_id: question.qid,
        files,
      });
    }
  }

  job.data.html = html;
  job.data.python = results.python;

  if (errors.length > 0 && numRegens > 0) {
    const autoRevisionPrompt = `Please fix the following issues: \n${errors.join('\n')}`;
    await regenInternal(
      job,
      client,
      authnUserId,
      originalPrompt,
      autoRevisionPrompt,
      html,
      typeof job?.data?.python === 'string' ? job?.data?.python : undefined,
      numRegens - 1,
      true,
      questionQid,
      courseId,
      userId,
      hasCoursePermissionEdit,
    );
  }
}

/**
 * Revises a question using the LLM based on user input.
 *
 * @param client The OpenAI client to use.
 * @param courseId The ID of the current course.
 * @param authnUserId The authenticated user's ID.
 * @param originalPrompt The prompt creating the original generation.
 * @param revisionPrompt A prompt with user instructions on how to revise the question.
 * @param originalHTML The question.html file to revise.
 * @param originalPython The server.py file to revise.
 * @param userId The ID of the generating/saving user.
 * @param hasCoursePermissionEdit Whether the saving generating/saving has course permission edit privlidges.
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function regenerateQuestion(
  client: OpenAI,
  courseId: string,
  authnUserId: string,
  originalPrompt: string,
  revisionPrompt: string,
  originalHTML: string,
  originalPython: string,
  questionQid: string | undefined,
  userId?: string | undefined,
  hasCoursePermissionEdit?: boolean | undefined,
): Promise<{
  jobSequenceId: string;
  htmlResult: string | undefined;
  pythonResult: string | undefined;
}> {
  const serverJob = await createServerJob({
    courseId,
    type: 'ai_question_regenerate',
    description: 'Revise a question using the LLM',
    authnUserId,
  });

  const jobData = await serverJob.execute(async (job) => {
    await regenInternal(
      job,
      client,
      authnUserId,
      originalPrompt,
      revisionPrompt,
      originalHTML,
      originalPython,
      1,
      false,
      questionQid,
      courseId,
      userId,
      hasCoursePermissionEdit,
    );
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
    htmlResult: jobData.data.html,
    pythonResult: jobData.data.python,
  };
}
