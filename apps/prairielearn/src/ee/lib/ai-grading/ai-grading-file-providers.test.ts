import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createAiGradingOpenAI } from './ai-grading-openai-provider.js';
import { generateSubmissionContent } from './ai-grading-util.js';

const code = 'def square(x):\n    return x * x  # café\n';
const text = `Submitted file: answer.py\n\n${code}`;

describe('submitted code provider requests', () => {
  it.each([
    {
      name: 'OpenAI',
      model: (fetch: typeof globalThis.fetch) =>
        createAiGradingOpenAI({ apiKey: 'test-key', fetch })('gpt-5.6-terra'),
      response: {
        id: 'resp_test',
        created_at: 0,
        model: 'gpt-5.6-terra',
        output: [
          {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Correct', annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
      expectedBody: { input: [{ role: 'user', content: [{ type: 'input_text', text }] }] },
    },
    {
      name: 'Anthropic',
      model: (fetch: typeof globalThis.fetch) =>
        createAnthropic({ apiKey: 'test-key', fetch })('claude-sonnet-5'),
      response: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: 'Correct' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      expectedBody: { messages: [{ role: 'user', content: [{ type: 'text', text }] }] },
    },
    {
      name: 'Google',
      model: (fetch: typeof globalThis.fetch) =>
        createGoogleGenerativeAI({ apiKey: 'test-key', fetch })('gemini-3.8-flash'),
      response: {
        candidates: [
          { content: { role: 'model', parts: [{ text: 'Correct' }] }, finishReason: 'STOP' },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      },
      expectedBody: { contents: [{ role: 'user', parts: [{ text }] }] },
    },
  ])('sends decoded code as native text to $name', async ({ model, response, expectedBody }) => {
    const fetchFunction = vi.fn<typeof fetch>(async () => Response.json(response));
    const result = await generateText({
      model: model(fetchFunction),
      messages: [
        {
          role: 'user',
          content: generateSubmissionContent({
            submission_text: '',
            submitted_answer: {
              _files: [{ name: 'answer.py', contents: Buffer.from(code).toString('base64') }],
            },
          }),
        },
      ],
    });

    expect(result.text).toBe('Correct');
    expect(fetchFunction).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchFunction.mock.calls[0][1]?.body as string)).toMatchObject(expectedBody);
  });
});
