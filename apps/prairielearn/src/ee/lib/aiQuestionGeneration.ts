import { OpenAI } from 'openai';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { createEmbedding, openAiUserFromAuthn, vectorToString } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);

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

async function makeContext(client: OpenAI, prompt: string, authnUserId): Promise<string> {
  const embedding = await createEmbedding(client, prompt, openAiUserFromAuthn(authnUserId));

  const docs = await queryRows(
    sql.select_nearby_documents,
    { embedding: vectorToString(embedding), limit: 5 },
    QuestionGenerationContextEmbeddingSchema,
  );

  const contextDocs = docs.map((doc) => doc.doc_text);
  const context = contextDocs.join('\n\n');
  return context;
}

function extractFromCompletion(completion, job: ServerJob): void {
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
 * @param prompt The prompt for how to generate a question.
 * @returns A server job ID for the generation task and a promise to return the associated saved data on completion.
 */
export async function generateQuestion(
  client: OpenAI,
  courseId: string | undefined,
  authnUserId: string,
  prompt: string,
) {
  const serverJob = await createServerJob({
    courseId,
    type: 'ai_question_generate',
    description: 'Generate a question with AI',
  });

  const jobPromise = serverJob.execute(async (job) => {
    job.info(`prompt is ${prompt}`);

    const context = await makeContext(client, prompt, authnUserId);

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
        { role: 'user', content: prompt },
      ],
      user: openAiUserFromAuthn(authnUserId),
    });

    extractFromCompletion(completion, job);
    job.data['prompt'] = prompt;
    job.data['generation'] = completion.choices[0].message.content;
    job.data['context'] = context;
  });

  return { jobSequenceId: serverJob.jobSequenceId, completionPromise: jobPromise };
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
  courseId: string | undefined,
  authnUserId: string,
  originalPrompt: string,
  revisionPrompt: string,
  originalHTML: string,
  originalPython: string,
) {
  const serverJob = await createServerJob({
    courseId,
    type: 'llm_question_regen',
    description: 'Revise a question using the LLM',
  });

  const jobPromise = serverJob.execute(async (job) => {
    job.info(`prompt is ${revisionPrompt}`);

    const context = await makeContext(client, originalPrompt, authnUserId);
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

    //TODO [very important]: normalize to prevent prompt injection attacks

    const completion = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: revisionPrompt },
      ],
      user: openAiUserFromAuthn(authnUserId),
    });

    extractFromCompletion(completion, job);
    job.data['prompt'] = revisionPrompt;
    job.data['originalPrompt'] = originalPrompt;
    job.data['generation'] = completion.choices[0].message.content;
    job.data['context'] = context;
  });

  return { jobSequenceId: serverJob.jobSequenceId, completionPromise: jobPromise };
}
