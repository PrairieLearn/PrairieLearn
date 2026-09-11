import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import { nameCourseAgentConversation } from './conversation-title.js';

const model = { updateCourseAgentTitle: vi.fn() };
const input = {
  runId: '22222222-2222-4222-8222-222222222222',
  conversationId: '11111111-1111-4111-8111-111111111111',
  userId: '1',
  courseId: '2',
  prompt: 'Create a numerical methods assessment',
};
const testConfig = {
  courseAgentRuntime: 'cloudflare' as const,
  courseAgentCapabilitySecret: 'test-secret',
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ title: 'Numerical methods assessment' }));
});
afterEach(() => vi.unstubAllGlobals());

it('leaves the title untouched until generation finishes', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await withConfig(testConfig, async () => {
    const naming = nameCourseAgentConversation(input, model);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(model.updateCourseAgentTitle).not.toHaveBeenCalled();
    finish(Response.json({ title: 'Numerical methods assessment' }));
    await naming;
  });
  expect(model.updateCourseAgentTitle).toHaveBeenCalledExactlyOnceWith(
    input.conversationId,
    'Numerical methods assessment',
  );
});

it('accepts greetings without waiting for an assistant reply', async () => {
  await withConfig(testConfig, () =>
    nameCourseAgentConversation({ ...input, prompt: 'Hi!' }, model),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  const capability = JSON.parse(Buffer.from(body.capability.split('.')[2], 'base64url').toString());
  expect(capability).toMatchObject({ type: 'course-agent-title', prompt: 'Hi!' });
  expect(capability).not.toHaveProperty('response');
});

it('leaves New conversation in place if naming fails', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
  await withConfig(testConfig, async () => {
    await expect(nameCourseAgentConversation(input, model)).rejects.toThrow('503');
  });
  expect(model.updateCourseAgentTitle).not.toHaveBeenCalled();
});

it('bounds title inputs and uses a deterministic title without model calls in fake mode', async () => {
  await withConfig(testConfig, () =>
    nameCourseAgentConversation({ ...input, prompt: 'a'.repeat(20000) }, model),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  const capability = JSON.parse(Buffer.from(body.capability.split('.')[2], 'base64url').toString());
  expect(capability.prompt).toHaveLength(4000);
  fetchMock.mockClear();
  await withConfig({ courseAgentRuntime: 'fake' }, () => nameCourseAgentConversation(input, model));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(model.updateCourseAgentTitle).toHaveBeenLastCalledWith(input.conversationId, input.prompt);
});
