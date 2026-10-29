import { getAgentByName } from 'agents';
import { describe, expect, it, vi } from 'vitest';

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
});
