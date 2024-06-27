import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import klaw from 'klaw';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows, queryOptionalRow } from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { DocumentChunk, buildContextForElementDocs } from './context-parsers/context-docs.js';
import { buildContextForQuestion } from './context-parsers/context-template.js';
import { createEmbedding } from './embeddings.js';
import { AIGeneratePage } from './instructorAIGenerate.html.js';
import { makeOpenAI } from './openai.js';

const router = express.Router();
const ADDITIONAL_SYNC_DIRECTORIES: string[] = [
  path.join(REPOSITORY_ROOT_PATH, 'exampleCourse/questions/template'),
  path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md'),
];

const sql = loadSqlEquiv(import.meta.url);

const QuestionGenerationContextEmbeddingSchema = z.object({
  id: IdSchema,
  doc_text: z.string(),
  doc_path: z.string(),
  embedding: z.string(),
  chunk_id: z.string(),
});

function convertVecToVecstring(vec: number[]) {
  return '[' + vec.join(', ') + ']';
}

function getOpenAIUserstring(locals): string {
  return `user_${locals.authn_user.user_id}`;
}

async function insertDocumentChunk(
  filepath: string,
  doc: DocumentChunk,
  job: ServerJob,
  uid: string,
) {
  const chunk = await queryOptionalRow(
    sql.check_doc_chunk_exists,
    { doc_path: filepath, chunk_id: doc.chunkID },
    QuestionGenerationContextEmbeddingSchema,
  );

  if (chunk && chunk.doc_text === doc.text) {
    job.info('chunk already in DB, skipping');
    return;
  }

  const embedding = await createEmbedding(doc.text, uid);
  await queryRows(
    sql.insert_embedding,
    {
      doc_path: filepath,
      doc_text: doc.text,
      embedding: convertVecToVecstring(embedding),
      chunk_id: doc.chunkID,
    },
    QuestionGenerationContextEmbeddingSchema,
  );
}

async function runGenerate(locals, prompt) {
  const serverJob = await createServerJob({
    courseId: locals.course ? locals.course.id : null,
    type: 'llm_question_generate',
    description: 'Generate a question using the LLM',
  });

  serverJob.executeInBackground(async (job) => {
    job.info(`prompt is ${prompt}`);
    const embedding = await createEmbedding(prompt, getOpenAIUserstring(locals));
    job.info(embedding.toString());

    const docs = await queryRows(
      sql.select_nearby_documents,
      { embedding: convertVecToVecstring(embedding), limit: 5 },
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

        Keep in mind you are not just generating an example; you are generating an actual question that the user will use directly.
        `;

    job.info(`system prompt is: ${sysPrompt}`);

    //TODO [very important]: normalize to prevent prompt injection attacks

    const completion = await makeOpenAI().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: prompt },
      ],
      user: getOpenAIUserstring(locals),
    });

    const completionText = completion.choices[0].message.content;

    job.info(`completion is ${completionText}`);

    job.info(`used ${completion?.usage?.total_tokens} OpenAI tokens to generate response.`);

    //TODO: Process generated documents
  });

  return serverJob.jobSequenceId;
}

async function runResync(locals) {
  const serverJob = await createServerJob({
    type: 'resync_question_generation_context',
    description: 'Copy all possible documents to the context vectorstore',
  });

  serverJob.executeInBackground(async (job) => {
    const filesAll = ADDITIONAL_SYNC_DIRECTORIES.map((dir) => {
      return klaw(dir);
    });

    for (const directory of filesAll) {
      for await (const file of directory) {
        if (file.stats.isDirectory()) {
          continue;
        }

        job.info(`processing ${file.path}`);

        //special cases: /docs/, /template/.../question.html
        const questionTemplateSelector = /^.*\/template\/.+\/question\.html$/;
        const elementDocsSelector = /^.*\/docs\/.+$/;

        if (questionTemplateSelector.test(file.path)) {
          const fileText = await buildContextForQuestion(path.dirname(file.path));
          await insertDocumentChunk(
            file.path,
            { text: fileText, chunkID: '' },
            job,
            getOpenAIUserstring(locals),
          );
        } else if (elementDocsSelector.test(file.path)) {
          const fileText = await fs.readFile(file.path, { encoding: 'utf-8' });
          const files = await buildContextForElementDocs(fileText);
          for (const doc of files) {
            await insertDocumentChunk(file.path, doc, job, getOpenAIUserstring(locals));
          }
        }
      }
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
    if (req.body.__action === 'ai_generate') {
      const jobSequenceId = await runGenerate(res.locals, req.body.prompt);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'resync') {
      const jobSequenceId = await runResync(res.locals);
      res.redirect('/pl/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
