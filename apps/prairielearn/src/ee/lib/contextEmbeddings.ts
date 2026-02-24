import * as path from 'path';

import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { type EmbeddingModel, embed } from 'ai';
import fs from 'fs-extra';
import klaw from 'klaw';

import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { type ServerJob, createServerJob } from '../../lib/server-jobs.js';

import {
  type DocumentChunk,
  buildContextForSingleElementDoc,
} from './context-parsers/documentation.js';
import { buildContextForQuestion } from './context-parsers/template-questions.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Converts an embedding array to a pgvector-compatible string.
 *
 * @param vec The embedding vector to convert.
 * @returns A pgvector-compatible representation of the embedding vector.
 */
function vectorToString(vec: number[]) {
  return `[${vec.join(', ')}]`;
}

/**
 * Converts a PrairieLearn authenticated user ID to a OpenAI user ID.
 *
 * @param authnUserId The PrairieLearn authenticated user ID.
 * @returns An OpenAI user ID (for internal tracking).
 */
function openAiUserFromAuthn(authnUserId: string): string {
  return `user_${authnUserId}`;
}

/**
 * Converts text to a semantic embedding.
 *
 * @param embeddingModel The embedding model to use.
 * @param text The document text to embed.
 * @param openAiUser The OpenAI userstring requesting the embedding.
 * @returns The resultant document embedding.
 */
async function createEmbedding(
  embeddingModel: EmbeddingModel,
  text: string,
  openAiUser: string,
): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      openai: {
        user: openAiUser,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return embedding;
}

/**
 * Inserts a document chunk into the vector store.
 *
 * @param embeddingModel The embedding model to use.
 * @param filepath The filepath of the document to add.
 * @param doc The document chunk to add.
 * @param job The server job calling this function.
 * @param openAiUser The OpenAI user string for the user requesting the adding of the document chunk.
 */
async function insertDocumentChunk(
  embeddingModel: EmbeddingModel,
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

  if (chunk?.doc_text === doc.text) {
    job.info(
      `Chunk for ${filepath} (${doc.chunkId || 'no chunk ID'}) already exists in the database. Skipping.`,
    );
    return;
  }

  job.info(`Inserting chunk for ${filepath} (${doc.chunkId || 'no chunk ID'}) into the database.`);
  const embedding = await createEmbedding(embeddingModel, doc.text, openAiUser);
  await execute(sql.insert_embedding, {
    doc_path: filepath,
    doc_text: doc.text,
    embedding: vectorToString(embedding),
    chunk_id: doc.chunkId,
  });
}

/**
 * Creates a job to synchronize predefined context (consisting of example course questions + element docs) with the vector store.
 *
 * @param embeddingModel The embedding model to use.
 * @param authnUserId The OpenAI user string of the user requesting the sync.
 * @returns The job ID of the synchronization job.
 */
export async function syncContextDocuments(embeddingModel: EmbeddingModel, authnUserId: string) {
  const serverJob = await createServerJob({
    type: 'sync_question_generation_context',
    description: 'Generate embeddings for context documents',
    userId: authnUserId,
    authnUserId,
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

      const questionContext = await buildContextForQuestion(path.dirname(file.path));
      if (questionContext) {
        await insertDocumentChunk(
          embeddingModel,
          path.relative(REPOSITORY_ROOT_PATH, file.path),
          { text: questionContext.context, chunkId: '' },
          job,
          openAiUserFromAuthn(authnUserId),
        );
        allowedFilepaths.push(path.relative(REPOSITORY_ROOT_PATH, file.path));
      }
    }

    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements');
    const elementChunkIds: string[] = [];
    for await (const file of klaw(elementDocsPath)) {
      if (file.stats.isDirectory()) continue;

      const filename = path.basename(file.path);
      // Skip index.md and non-markdown files
      if (filename === 'index.md' || !filename.endsWith('.md')) continue;

      // Extract element name from filename (e.g., "pl-multiple-choice.md" -> "pl-multiple-choice")
      const elementName = path.basename(file.path, '.md');

      const fileText = await fs.readFile(file.path, { encoding: 'utf-8' });
      const doc = buildContextForSingleElementDoc(fileText, elementName);

      if (doc) {
        const relativePath = path.relative(REPOSITORY_ROOT_PATH, file.path);
        await insertDocumentChunk(
          embeddingModel,
          relativePath,
          doc,
          job,
          openAiUserFromAuthn(authnUserId),
        );
        allowedFilepaths.push(relativePath);
        elementChunkIds.push(doc.chunkId);
      }
    }

    await execute(sql.delete_unused_doc_chunks, {
      doc_paths: allowedFilepaths,
      // The example course questions have no chunk IDs.
      chunk_ids: elementChunkIds.concat(['']),
    });
  });
  return serverJob.jobSequenceId;
}
