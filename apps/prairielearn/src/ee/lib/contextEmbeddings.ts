import * as path from 'path';

import type { OpenAIProvider } from '@ai-sdk/openai';
import { embed } from 'ai';
import fs from 'fs-extra';
import klaw from 'klaw';

import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { type ServerJob, createServerJob } from '../../lib/server-jobs.js';

import { type DocumentChunk, buildContextForElementDocs } from './context-parsers/documentation.js';
import { buildContextForQuestion } from './context-parsers/template-questions.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Converts an embedding array to a pgvector-compatible string.
 *
 * @param vec The embedding vector to convert.
 * @returns A pgvector-compatible representation of the embedding vector.
 */
export function vectorToString(vec: number[]) {
  return `[${vec.join(', ')}]`;
}

/**
 * Converts a PrairieLearn authenticated user ID to a OpenAI user ID.
 *
 * @param authnUserId The PrairieLearn authenticated user ID.
 * @returns An OpenAI user ID (for internal tracking).
 */
export function openAiUserFromAuthn(authnUserId: string): string {
  return `user_${authnUserId}`;
}

/**
 * Converts text to a semantic embedding.
 *
 * @param openai The OpenAI provider to use.
 * @param text The document text to embed.
 * @param openAiUser The OpenAI userstring requesting the embeddng.
 * @returns The resultant document embedding.
 */
export async function createEmbedding(
  openai: OpenAIProvider,
  text: string,
  openAiUser: string,
): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel('text-embedding-3-small'),
    value: text,
    providerOptions: {
      openai: {
        user: openAiUser,
      },
    },
  });

  return embedding;
}

/**
 * Inserts a document chunk into the vectorstore.
 *
 * @param openai The OpenAI provider to use.
 * @param filepath The filepath of the document to add.
 * @param doc The document chunk to add.
 * @param job The server job calling this function.
 * @param openAiUser The OpenAI userstring requesting the adding of the document chunk.
 */
async function insertDocumentChunk(
  openai: OpenAIProvider,
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
  const embedding = await createEmbedding(openai, doc.text, openAiUser);
  await execute(sql.insert_embedding, {
    doc_path: filepath,
    doc_text: doc.text,
    embedding: vectorToString(embedding),
    chunk_id: doc.chunkId,
  });
}

/**
 * Creates a job to synchronize predefined context (consisting of example course questions + element docs) with the vectorstore.
 *
 * @param client The OpenAI provider to use.
 * @param authnUserId The OpenAI userstring of the user requesting the sync.
 * @returns The job ID of the synchronization job.
 */
export async function syncContextDocuments(client: OpenAIProvider, authnUserId: string) {
  const serverJob = await createServerJob({
    type: 'sync_question_generation_context',
    description: 'Generate embeddings for context documents',
  });

  serverJob.executeInBackground(async (job) => {
    const templateQuestionsPath = path.join(
      REPOSITORY_ROOT_PATH,
      'exampleCourse/questions/template',
    );
    const allowedFilepaths: string[] = [];
    for await (const file of klaw(templateQuestionsPath)) {
      if (file.stats.isDirectory()) continue;

      const filename = path.basename(file.path);
      if (filename !== 'question.html') continue;

      const fileText = await buildContextForQuestion(path.dirname(file.path));
      if (fileText) {
        await insertDocumentChunk(
          client,
          path.relative(REPOSITORY_ROOT_PATH, file.path),
          { text: fileText, chunkId: '' },
          job,
          openAiUserFromAuthn(authnUserId),
        );
        allowedFilepaths.push(path.relative(REPOSITORY_ROOT_PATH, file.path));
      }
    }

    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md');
    allowedFilepaths.push(path.relative(REPOSITORY_ROOT_PATH, elementDocsPath));
    const fileText = await fs.readFile(elementDocsPath, { encoding: 'utf-8' });
    const files = buildContextForElementDocs(fileText);
    for (const doc of files) {
      await insertDocumentChunk(
        client,
        path.relative(REPOSITORY_ROOT_PATH, elementDocsPath),
        doc,
        job,
        openAiUserFromAuthn(authnUserId),
      );
    }

    await execute(sql.delete_unused_doc_chunks, {
      doc_paths: allowedFilepaths,
      chunk_ids: files.map((doc) => doc.chunkId).concat(['']),
    });
  });
  return serverJob.jobSequenceId;
}
