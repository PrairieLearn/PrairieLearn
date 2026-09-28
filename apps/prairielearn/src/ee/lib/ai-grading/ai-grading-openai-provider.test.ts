import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createAiGradingOpenAI } from './ai-grading-openai-provider.js';
import { generateSubmissionContent } from './ai-grading-util.js';

describe('createAiGradingOpenAI', () => {
  it('sends submission PDFs with high detail through the OpenAI provider', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: 'resp_test',
        created_at: 0,
        model: 'gpt-5.4-mini-2026-03-17',
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
      }),
    );
    const provider = createAiGradingOpenAI({
      apiKey: 'test-key',
      organization: 'test-org',
      fetch: fetchFunction,
    });

    const result = await generateText({
      model: provider('gpt-5.4-mini-2026-03-17'),
      messages: [
        {
          role: 'user',
          content: generateSubmissionContent({
            submission_text:
              '<div data-ai-grading-file-name="answer.pdf"></div><div data-ai-grading-file-name="answer.png"></div>',
            submitted_answer: {
              _files: [
                { name: 'answer.pdf', contents: 'cGRm' },
                { name: 'answer.png', contents: 'aW1hZ2U=' },
              ],
            },
          }),
        },
      ],
    });

    expect(result.text).toBe('Correct');
    expect(fetchFunction).toHaveBeenCalledOnce();
    const [url, init] = fetchFunction.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('openai-organization')).toBe('test-org');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'gpt-5.4-mini-2026-03-17',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Submitted file: answer.pdf' },
            {
              type: 'input_file',
              filename: 'answer.pdf',
              file_data: 'data:application/pdf;base64,cGRm',
              detail: 'high',
            },
            { type: 'input_text', text: 'Submitted file: answer.png' },
            { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=', detail: 'auto' },
          ],
        },
      ],
    });
  });
});
