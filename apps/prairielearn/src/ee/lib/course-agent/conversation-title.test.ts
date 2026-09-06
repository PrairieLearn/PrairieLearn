import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import {
  fallbackConversationTitle,
  isGreeting,
  nameCourseAgentConversation,
} from './conversation-title.js';

const model = {
  selectCourseAgentHistory: vi.fn(),
  claimCourseAgentTitle: vi.fn(),
  updateCourseAgentTitle: vi.fn(),
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const testConfig = {
  courseAgentRuntime: 'cloudflare' as const,
  courseAgentCapabilitySecret: 'test-secret',
};
const fetchMock = vi.fn();
const exchange = (prompt: string, response = 'Created three questions.') => [
  { role: 'user', run_id: prompt, content: prompt },
  { role: 'assistant', run_id: prompt, content: response },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  model.selectCourseAgentHistory.mockResolvedValue({
    messages: exchange('Create a numerical methods assessment'),
  });
  model.claimCourseAgentTitle.mockResolvedValue({ user_id: '1', course_id: '2' });
  fetchMock.mockResolvedValue(Response.json({ title: 'Numerical methods assessment' }));
});
afterEach(() => vi.unstubAllGlobals());

it('defers greetings without claiming a title or calling the model', async () => {
  model.selectCourseAgentHistory.mockResolvedValue({ messages: exchange('Hi!') });
  await withConfig(testConfig, () => nameCourseAgentConversation(conversationId, model));
  expect(model.claimCourseAgentTitle).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(isGreeting('Hi, create an assessment')).toBe(false);
});

it('waits for a reply and uses the first substantive completed exchange only', async () => {
  model.selectCourseAgentHistory.mockResolvedValue({
    messages: [
      ...exchange('hi'),
      ...exchange('Create a numerical methods assessment'),
      ...exchange('Add five more questions'),
    ],
  });
  await withConfig(testConfig, () => nameCourseAgentConversation(conversationId, model));
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  const capability = JSON.parse(Buffer.from(body.capability.split('.')[2], 'base64url').toString());
  expect(capability).toMatchObject({
    type: 'course-agent-title',
    conversationId,
    prompt: 'Create a numerical methods assessment',
    response: 'Created three questions.',
  });
  expect(model.updateCourseAgentTitle).toHaveBeenCalledWith(
    conversationId,
    'Create a numerical methods assessment',
    'Numerical methods assessment',
  );
  model.selectCourseAgentHistory.mockResolvedValue({
    messages: [{ role: 'user', run_id: 'pending', content: 'Create an exam' }],
  });
  await withConfig(testConfig, () => nameCourseAgentConversation(conversationId, model));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('claims naming only once across simultaneous completion and reload requests', async () => {
  model.claimCourseAgentTitle
    .mockResolvedValue(null)
    .mockResolvedValueOnce({ user_id: '1', course_id: '2' });
  await withConfig(testConfig, () =>
    Promise.all([
      nameCourseAgentConversation(conversationId, model),
      nameCourseAgentConversation(conversationId, model),
    ]),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(model.updateCourseAgentTitle).toHaveBeenCalledTimes(1);
});

it('leaves the saved fallback in place if the Worker rejects naming', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
  await withConfig(testConfig, async () => {
    await expect(nameCourseAgentConversation(conversationId, model)).rejects.toThrow('503');
  });
  expect(model.claimCourseAgentTitle).toHaveBeenCalledWith(
    conversationId,
    'Create a numerical methods assessment',
  );
  expect(model.updateCourseAgentTitle).not.toHaveBeenCalled();
});

it('bounds title inputs and never calls a model in fake mode', async () => {
  model.selectCourseAgentHistory.mockResolvedValue({
    messages: exchange('a'.repeat(20000), 'b'.repeat(20000)),
  });
  await withConfig(testConfig, () => nameCourseAgentConversation(conversationId, model));
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  const capability = JSON.parse(Buffer.from(body.capability.split('.')[2], 'base64url').toString());
  expect(capability.prompt).toHaveLength(4000);
  expect(capability.response).toHaveLength(4000);
  expect(fallbackConversationTitle('a'.repeat(20000))).toHaveLength(80);
  expect(fallbackConversationTitle('New conversation')).not.toBe('New conversation');
  fetchMock.mockClear();
  await withConfig({ courseAgentRuntime: 'fake' }, () =>
    nameCourseAgentConversation(conversationId, model),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
