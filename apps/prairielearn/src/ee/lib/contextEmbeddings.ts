import { OpenAI } from 'openai';
import fs from 'fs-extra';
import klaw from 'klaw';

import { loadSqlEquiv, queryRows, queryOptionalRow } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { DocumentChunk, buildContextForElementDocs } from './context-parsers/documentation.js';
import * as path from "path";
import { REPOSITORY_ROOT_PATH } from "../../../lib/paths.js";

import { buildContextForQuestion } from './context-parsers/template-questions.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Converts an embedding array to a pgvector-compatible string
 * @param vec the embedding vector to convert
 * @returns a pgvector-compatible representation
 */
export function vectorToString(vec: number[]) {
  return `[${vec.join(', ')}]`;
}

/**
 * Converts a PrairieLearn authenticated user ID to a OpenAI user ID
 * @param authnUserId the PrairieLearn authenticated user ID
 * @returns an OpenAI user ID (for internal tracking)
 */
export function openAiUserFromAuthn(authnUserId: string): string {
  return `user_${authnUserId}`;
}

/**
 * Converts text to a semantic embedding
 * @param client the OpenAI client to use
 * @param text the document text to embed
 * @param openAiUser the openAI userstring requesting the embeddng
 * @returns the resultat document embedding
 */
export async function createEmbedding(client: OpenAI, text: string, openAiUser: string) {
  const embedding = await client.embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    user: openAiUser,
  });

  return embedding.data[0].embedding;
}

/**
 * Inserts a document chunk into the vectorstore
 * @param client the openAI client to use
 * @param filepath the filepath of the document to add
 * @param doc the document chunk to add
 * @param job the server job calling this
 * @param openAiUser the openAI userstring requesting the adding of the document chunk 
 * @returns none
 */
export async function insertDocumentChunk(
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

/**
 * Creates a job to synchronize predefined context (example course questions + element docs) with the vectorstore
 * @param client the openAI client to use 
 * @param authnUserId the openAI userstring of the user requesting the sync
 * @returns the job ID of the job doing the sync
 */
export async function syncContextDocuments(client: OpenAI, authnUserId: string) {
  const serverJob = await createServerJob({
    type: 'sync_question_generation_context',
    description: 'Generate embeddings for context documents',
  });

  serverJob.executeInBackground(async (job) => {
    const templateQuestionsPath = path.join(
      REPOSITORY_ROOT_PATH,
      'exampleCourse/questions/template'
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
        openAiUserFromAuthn(authnUserId)
      );
    }

    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md');
    const fileText = await fs.readFile(elementDocsPath, { encoding: 'utf-8' });
    const files = await buildContextForElementDocs(fileText);
    for (const doc of files) {
      await insertDocumentChunk(client, elementDocsPath, doc, job, openAiUserFromAuthn(authnUserId));
    }
  });
  return serverJob.jobSequenceId;
}
