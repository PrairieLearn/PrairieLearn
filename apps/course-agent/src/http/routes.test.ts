import { getAgentByName } from 'agents';
import { describe, expect, it, vi } from 'vitest';

import { TITLE_INSTRUCTIONS } from '../conversation/instructions.js';

import app from './routes.js';

vi.mock('agents', () => ({ getAgentByName: vi.fn() }));
vi.mock('../monitoring.js', () => ({ reportError: vi.fn() }));

describe('private course agent service', () => {
  it('rejects an unauthorized request before looking up a conversation', async () => {
    const response = await app.request(
      '/conversations',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      },
      { PL_SERVICE_TOKEN: 'test-token' } as Env,
    );
    expect(response.status).toBe(401);
    expect(getAgentByName).not.toHaveBeenCalled();
  });

  it('generates a title with the agent model and its title instructions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', content: [{ type: 'output_text', text: ' Add a limits question\n' }] },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await app.request(
        '/titles',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Please add a question about limits' }),
        },
        { PL_SERVICE_TOKEN: 'test-token', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model' } as Env,
      );
      expect(await response.json()).toEqual({ title: 'Add a limits question' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        model: 'model',
        instructions: TITLE_INSTRUCTIONS,
        input: 'Please add a question about limits',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
