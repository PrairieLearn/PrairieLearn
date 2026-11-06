import { describe, expect, it } from 'vitest';

import { SEARCH_REFUSAL, modelRequestRefusal, prepareSearchRequest } from './model-requests.js';

describe('modelRequestRefusal', () => {
  it('allows the client-run tools Codex declares', () => {
    expect(
      modelRequestRefusal({
        tools: [{ type: 'function' }, { type: 'custom' }, { type: 'namespace', tools: [] }],
      }),
    ).toBeNull();
  });

  it('refuses hosted tools that reach other sites', () => {
    for (const type of ['web_search', 'mcp', 'web_search_preview']) {
      expect(modelRequestRefusal({ tools: [{ type: 'function' }, { type }] })).not.toBeNull();
    }
  });
});

describe('prepareSearchRequest', () => {
  const request = {
    id: 'session',
    model: 'gpt-6-luna',
    input: [{ type: 'message', role: 'user', content: [] }],
    settings: { external_web_access: true, filters: { blocked_domains: ['example.com'] } },
  };

  it('forwards browsing commands with fixed settings', () => {
    const commands = {
      search_query: [{ q: 'pl-number-input', domains: ['prairielearn.com'] }],
      open: [{ ref_id: 'https://docs.prairielearn.com/elements/pl-number-input/' }],
      find: [{ ref_id: 'turn0view0', pattern: 'rtol' }],
      response_length: 'short',
    };
    expect(prepareSearchRequest({ ...request, commands })).toEqual({
      forward: {
        ...request,
        commands,
        settings: { allowed_callers: ['direct'], external_web_access: true },
      },
      operations: 3,
    });
  });

  it('refuses commands it does not know', () => {
    for (const commands of [
      { search_query: [{ q: 'x' }], submit_form: [{ ref_id: 'turn0view0' }] },
      { open: { ref_id: 'https://example.com' } },
      undefined,
    ]) {
      expect(prepareSearchRequest({ ...request, commands })).toEqual({ refusal: SEARCH_REFUSAL });
    }
  });
});
