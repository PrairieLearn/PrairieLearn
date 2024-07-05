import { OpenAI } from 'openai';

import { loadSqlEquiv, queryRows, queryOptionalRow } from '@prairielearn/postgres';

import { QuestionGenerationContextEmbeddingSchema } from '../../lib/db-types.js';
import { ServerJob } from '../../lib/server-jobs.js';

import { DocumentChunk } from './context-parsers/documentation.js';

const sql = loadSqlEquiv(import.meta.url);

export function vectorToString(vec: number[]) {
  return `[${vec.join(', ')}]`;
}

export function openAiUserFromLocals(locals: Record<string, any>): string {
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
