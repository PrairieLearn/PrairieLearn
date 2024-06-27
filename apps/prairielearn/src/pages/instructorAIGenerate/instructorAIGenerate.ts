import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import klaw from 'klaw';
import { OpenAI } from 'openai';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows, queryOptionalRow } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { IdSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { DocumentChunk, buildContextForElementDocs } from './context-parsers/documentation.js';
import { buildContextForQuestion } from './context-parsers/template-questions.js';
import { AIGeneratePage } from './instructorAIGenerate.html.js';

const router = express.Router();

const sql = loadSqlEquiv(import.meta.url);

const QuestionGenerationContextEmbeddingSchema = z.object({
  id: IdSchema,
  doc_text: z.string(),
  doc_path: z.string(),
  embedding: z.string(),
  chunk_id: z.string(),
});

function vectorToString(vec: number[]) {
  return `[${vec.join(', ')}]`;
}

function openAiUserFromLocals(locals: Record<string, any>): string {
  return `user_${locals.authn_user.user_id}`;
}

export async function createEmbedding(client: OpenAI, text: string, openAiUser: string) {
  const embedding = await client.embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    user: openAiUser,
  });

  return embedding.data[0].embedding;
}

async function insertDocumentChunk(
  client: OpenAI,
  filepath: string,
  doc: DocumentChunk,
  job: ServerJob,
  openAiUser: string,
) {
  const chunk = await queryOptionalRow(
    sql.check_doc_chunk_exists,
    { doc_path: filepath, chunk_id: doc.chunkId },
    QuestionGenerationContextEmbeddingSchema,
  );

  if (chunk && chunk.doc_text === doc.text) {
    job.info(`Chunk for ${filepath} (${doc.chunkId}}) already exists in the database. Skipping.`);
    return;
  }

  job.info(`Inserting chunk for ${filepath} (${doc.chunkId}) into the database.`);
  const embedding = await createEmbedding(client, doc.text, openAiUser);
  await queryRows(
    sql.insert_embedding,
    {
      doc_path: filepath,
      doc_text: doc.text,
      embedding: vectorToString(embedding),
      chunk_id: doc.chunkId,
    },
    QuestionGenerationContextEmbeddingSchema,
  );
}

async function generateQuestion(client: OpenAI, locals: Record<string, any>, prompt: string) {
  const serverJob = await createServerJob({
    courseId: locals.course ? locals.course.id : null,
    type: 'llm_question_generate',
    description: 'Generate a question with an LLM',
  });

  serverJob.executeInBackground(async (job) => {
    job.info(`prompt is ${prompt}`);
    const embedding = await createEmbedding(client, prompt, openAiUserFromLocals(locals));
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
      user: openAiUserFromLocals(locals),
    });

    const completionText = completion.choices[0].message.content;

    job.info(`completion is ${completionText}`);

    job.info(`used ${completion?.usage?.total_tokens} OpenAI tokens to generate response.`);

    // TODO: Process generated documents
  });

  return serverJob.jobSequenceId;
}

async function syncContextDocuments(client: OpenAI, locals: Record<string, any>) {
  const serverJob = await createServerJob({
    type: 'sync_question_generation_context',
    description: 'Generate embeddings for context documents',
  });

  serverJob.executeInBackground(async (job) => {
    const templateQuestionsPath = path.join(
      REPOSITORY_ROOT_PATH,
      'exampleCourse/questions/template',
    );
    for await (const file of klaw(templateQuestionsPath)) {
      if (file.stats.isDirectory()) continue;

      const filename = path.basename(file.path);
      if (filename !== 'question.html') continue;

      const fileText = await buildContextForQuestion(path.dirname(file.path));
      await insertDocumentChunk(
        client,
        file.path,
        { text: fileText, chunkId: '' },
        job,
        openAiUserFromLocals(locals),
      );
    }

    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md');
    const fileText = await fs.readFile(elementDocsPath, { encoding: 'utf-8' });
    const files = await buildContextForElementDocs(fileText);
    for (const doc of files) {
      await insertDocumentChunk(client, elementDocsPath, doc, job, openAiUserFromLocals(locals));
    }
  });
  return serverJob.jobSequenceId;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(AIGeneratePage({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!config.openAiApiKey || !config.openAiOrganization) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }
    const client = new OpenAI({
      apiKey: config.openAiApiKey,
      organization: config.openAiOrganization,
    });

    if (req.body.__action === 'generate_question') {
      const jobSequenceId = await generateQuestion(client, res.locals, req.body.prompt);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'sync_context_documents') {
      const jobSequenceId = await syncContextDocuments(client, res.locals);
      res.redirect('/pl/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
