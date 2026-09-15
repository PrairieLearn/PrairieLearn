import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  createAiGradingOpenAICompatible,
  listOpenAiCompatibleModels,
} from './ai-grading-openai-compatible.js';

describe('createAiGradingOpenAICompatible', () => {
  it('sends chat completions to the custom base URL', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: 'campus-llama',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Correct' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );

    const provider = createAiGradingOpenAICompatible({
      name: 'campus',
      baseURL: 'https://llm.example.edu/v1/',
      apiKey: 'test-key',
      fetch: fetchFunction,
    });

    const result = await generateText({
      model: provider.chat('campus-llama'),
      prompt: 'Grade this',
    });

    expect(result.text).toBe('Correct');
    expect(fetchFunction).toHaveBeenCalled();
    const [url, init] = fetchFunction.mock.calls[0];
    expect(String(url)).toContain('https://llm.example.edu/v1/chat/completions');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
  });
});

describe('listOpenAiCompatibleModels', () => {
  it('reads model ids from /models', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [{ id: 'campus-llama' }, { id: 'campus-qwen' }],
      }),
    );

    const models = await listOpenAiCompatibleModels({
      baseURL: 'https://llm.example.edu/v1',
      apiKey: 'test-key',
      fetchFunction,
    });

    expect(models).toEqual(['campus-llama', 'campus-qwen']);
    expect(String(fetchFunction.mock.calls[0][0])).toBe('https://llm.example.edu/v1/models');
  });
});
