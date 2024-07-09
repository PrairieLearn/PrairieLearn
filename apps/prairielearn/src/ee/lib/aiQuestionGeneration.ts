import { OpenAI } from 'openai';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { createServerJob } from '../../lib/server-jobs.js';

import { createEmbedding, openAiUserFromAuthn, vectorToString } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Generates the HTML and Python code for a new question using an LLM
 *
 * @param client the OpenAI client to use
 * @param courseId the ID of the current course
 * @param authnUserId the authenticated user's ID
 * @param prompt the prompt for how to generate a question
 * @returns a server job ID for the generation task
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

  serverJob.executeInBackground(async (job) => {
    job.info(`prompt is ${prompt}`);
    const embedding = await createEmbedding(client, prompt, openAiUserFromAuthn(authnUserId));
    job.info(embedding.toString());

    const docs = await queryRows(
      sql.select_nearby_documents,
      { embedding: vectorToString(embedding), limit: 5 },
      QuestionGenerationContextEmbeddingSchema,
    );

    const contextDocs = docs.map((doc) => doc.doc_text);
    const context = contextDocs.join('\n\n');

    const sysPrompt = `
# Introduction

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

    const completionText = completion.choices[0].message.content;

    job.info(`completion is ${completionText}`);

    job.info(`used ${completion?.usage?.total_tokens} OpenAI tokens to generate response.`);

    // TODO: Process generated documents
  });

  return serverJob.jobSequenceId;
}
