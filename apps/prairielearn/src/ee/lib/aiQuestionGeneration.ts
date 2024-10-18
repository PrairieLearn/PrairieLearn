import { type OpenAI } from 'openai';
import * as parse5 from 'parse5';

import { loadSqlEquiv, queryRows, queryRow } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
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
): void {
  const completionText = completion.choices[0].message.content;

  job.info(`completion is ${completionText}`);

  job.info(`used ${completion?.usage?.total_tokens} OpenAI tokens to generate response.`);

  const pythonSelector = /```python\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;
  const htmlSelector = /```html\n(?<code>([^`]|`[^`]|``[^`]|\n)*)```/;

  const html = completionText?.match(htmlSelector)?.groups?.code;
  const python = completionText?.match(pythonSelector)?.groups?.code;

  if (html !== undefined) {
    job.info(`extracted html file: ${html}`);
    job.data['html'] = html;
  }

  if (python !== undefined) {
    job.info(`extracted python file: ${python}`);
    job.data['python'] = python;
  }
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
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function generateQuestion({
  client,
  courseId,
  authnUserId,
  promptGeneral,
  promptUserInput,
  promptGrading,
}: {
  client: OpenAI;
  courseId: string | undefined;
  authnUserId: string;
  promptGeneral: string;
  promptUserInput: string;
  promptGrading: string;
}): Promise<{
  jobSequenceId: string;
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

    extractFromCompletion(completion, job);
    const html = job?.data?.html;

    job.data['initialGenerationErrors'] = [];
    job.data['prompt'] = userPrompt;
    job.data['generation'] = completion.choices[0].message.content;
    job.data['context'] = context;
    job.data['completion'] = completion;

    if (html && typeof html === 'string') {
      const errors = validateHTML(html, false, !!job?.data?.python);
      job.data['initialGenerationErrors'] = errors;
      job.data['finalGenerationErrors'] = errors;
      if (errors.length > 0) {
        await regenInternal(
          job,
          client,
          authnUserId,
          userPrompt,
          `Please fix the following issues: \n${errors.join('\n')}`,
          html,
          typeof job?.data?.python === 'string' ? job?.data?.python : undefined,
          0,
          false,
        );
      }
    } else {
      await regenInternal(
        job,
        client,
        authnUserId,
        userPrompt,
        'Please generate a question.html file.',
        '',
        typeof job?.data?.python === 'string' ? job?.data?.python : undefined,
        0,
        false,
      );
    }
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
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
 * @param courseId The ID of the current course.
 * @param authnUserId The authenticated user's ID.
 * @param originalPrompt The prompt creating the original generation.
 * @param revisionPrompt A prompt with user instructions on how to revise the question.
 * @param originalHTML The question.html file to revise.
 * @param originalPython The server.py file to revise.
 * @param numRegens Number of times that regen could be called.
 * @param saveInitialErrors Whether to save initial error checking results in the job data.
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
  saveInitialErrors: boolean,
) {
  job.info(`prompt is ${revisionPrompt}`);

  let tags: string[] = [];
  if (originalHTML) {
    const ast = parse5.parseFragment(originalHTML);
    tags = Array.from(traverseForTagNames(ast));
  }

  const context = await makeContext(client, originalPrompt, undefined, tags, authnUserId);
  if (saveInitialErrors) {
    job.data['context'] = context;
  }

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

  extractFromCompletion(completion, job);
  job.data['generation'] = completion.choices[0].message.content;
  job.data['completion'] = completion;

  const html = job?.data?.html || originalHTML;

  if (saveInitialErrors) {
    job.data['initialGenerationErrors'] = [];
  }
  job.data['finalGenerationErrors'] = [];

  if (html && typeof html === 'string') {
    const errors = validateHTML(html, false, !!job?.data?.python);
    if (saveInitialErrors) {
      job.data['initialGenerationErrors'] = errors;
    }
    job.data['finalGenerationErrors'] = errors;
    if (errors.length > 0 && numRegens > 0) {
      const autoRevisionPrompt = `Please fix the following issues: \n${errors.join('\n')}`;
      job.data['autoRevisionPrompt'] = autoRevisionPrompt;
      await regenInternal(
        job,
        client,
        authnUserId,
        originalPrompt,
        autoRevisionPrompt,
        html,
        typeof job?.data?.python === 'string' ? job?.data?.python : undefined,
        numRegens - 1,
        false,
      );
    }
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
    job.data['prompt'] = revisionPrompt;
    job.data['originalPrompt'] = originalPrompt;

    await regenInternal(
      job,
      client,
      authnUserId,
      originalPrompt,
      revisionPrompt,
      originalHTML,
      originalPython,
      1,
      true,
    );
  });

  return {
    jobSequenceId: serverJob.jobSequenceId,
    htmlResult: jobData.data.html,
    pythonResult: jobData.data.python,
  };
}
