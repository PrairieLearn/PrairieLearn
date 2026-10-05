import { afterEach, expect, test, vi } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import { provider } from './service.js';

vi.mock('../../../models/course.js', () => ({
  selectCourseById: async () => ({
    deleted_at: null,
    example_course: false,
    repository: 'https://github.com/org/course',
    branch: 'main',
  }),
}));
vi.mock('./access.js', () => ({ hasCourseAgentOwnerAccess: async () => true }));

afterEach(() => vi.unstubAllGlobals());

const scope = { course_id: '1', user_id: '2', authn_user_id: '2' };
const conversation = {
  id: '1',
  course_id: '1',
  user_id: '2',
  external_id: '00000000-0000-4000-8000-000000000000',
  title: 'Test',
  repository: 'org/course',
  branch: 'main',
  operation_number: 0,
  created_at: new Date(),
};
const settings = {
  workerUrl: 'http://localhost:8791',
  serviceToken: 'local-fixture-service-token-not-a-secret',
};

test('reports an unsent message without leaking a configure transport error', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('sensitive upstream details'));
  vi.stubGlobal('fetch', fetcher);
  await withConfig({ isEnterprise: true, courseAgent: settings }, async () => {
    await expect(provider(scope, conversation, true)).rejects.toMatchObject({
      status: 502,
      message:
        'Course agent connection failed. Your message was not sent. Check the Worker is running, then retry the send.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
