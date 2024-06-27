import { makeOpenAI } from './openai.js';

export async function createEmbedding(text: string, uid: string | undefined = undefined) {
  const embedding = await makeOpenAI().embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    user: uid,
  });

  return embedding.data[0].embedding;
}
