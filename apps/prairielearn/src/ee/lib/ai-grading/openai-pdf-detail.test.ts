import { describe, expect, it, vi } from 'vitest';

import { withOpenAiHighPdfDetail } from './openai-pdf-detail.js';

describe('withOpenAiHighPdfDetail', () => {
  it('sets high detail on PDF input files without changing other inputs', async () => {
    let receivedInit: RequestInit | undefined;
    const fetchFunction: typeof fetch = async (_input, init) => {
      receivedInit = init;
      return new Response();
    };
    const body = {
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Grade this proof.' },
            {
              type: 'input_file',
              filename: 'proof.pdf',
              file_data: 'data:application/pdf;base64,cGRm',
            },
            { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=', detail: 'auto' },
          ],
        },
      ],
    };

    await withOpenAiHighPdfDetail(fetchFunction)('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(JSON.parse(receivedInit?.body as string)).toEqual({
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Grade this proof.' },
            {
              type: 'input_file',
              filename: 'proof.pdf',
              file_data: 'data:application/pdf;base64,cGRm',
              detail: 'high',
            },
            { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=', detail: 'auto' },
          ],
        },
      ],
    });
  });

  it('forwards bodies without input files unchanged', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () => new Response());
    const init = { method: 'POST', body: 'not JSON' };

    await withOpenAiHighPdfDetail(fetchFunction)('https://api.openai.com/v1/responses', init);

    expect(fetchFunction).toHaveBeenCalledWith('https://api.openai.com/v1/responses', init);
  });

  it('forwards non-JSON input file bodies unchanged', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () => new Response());
    const init = { method: 'POST', body: 'not JSON with an "input_file" token' };

    await withOpenAiHighPdfDetail(fetchFunction)('https://api.openai.com/v1/responses', init);

    expect(fetchFunction).toHaveBeenCalledWith('https://api.openai.com/v1/responses', init);
  });
});
