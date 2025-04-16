CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS question_generation_context_embeddings (
  id bigserial PRIMARY KEY,
  doc_text text,
  doc_path varchar(1024),
  embedding vector (1536),
  chunk_id text,
  UNIQUE (doc_path, chunk_id)
);

CREATE INDEX ON question_generation_context_embeddings USING hnsw (embedding vector_cosine_ops);
