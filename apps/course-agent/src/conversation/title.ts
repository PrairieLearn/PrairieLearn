import { z } from 'zod';

import { TITLE_INSTRUCTIONS } from './instructions.js';

const ResponseSchema = z.object({
  output: z.array(
    z.object({
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});

/** Summarizes a conversation's first prompt with the same model as the agent. */
export async function generateTitle(env: Env, prompt: string, signal: AbortSignal) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      instructions: TITLE_INSTRUCTIONS,
      input: prompt,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Title request failed with status ${response.status}`);
  const { output } = ResponseSchema.parse(await response.json());
  return output
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text ?? '')
    .join('')
    .trim();
}
