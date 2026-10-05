import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as courses from '../../../models/course.js';
import { withConfig } from '../../../tests/utils/config.js';

import * as access from './access.js';
import { provider } from './service.js';

beforeEach(() => {
  // Tests share loaded modules; spies replace their existing live bindings too.
  vi.spyOn(courses, 'selectCourseById').mockResolvedValue({
    ai_grading_free_credit_redemptions_used: 0,
    announcement_color: null,
    announcement_html: null,
    branch: 'main',
    commit_hash: null,
    course_instance_enrollment_limit: null,
    created_at: new Date(),
    deleted_at: null,
    display_timezone: 'America/Chicago',
    draft_number: 0,
    example_course: false,
    id: '1',
    institution_id: '1',
    json_comment: null,
    options: {},
    path: '/test/course',
    questions_receive_user_data: false,
    repository: 'https://github.com/org/course',
    sharing_name: null,
    sharing_token: '',
    short_name: 'Test',
    show_getting_started: false,
    sync_errors: null,
    sync_job_sequence_id: null,
    sync_warnings: null,
    template_course: false,
    title: 'Test',
    yearly_enrollment_limit: null,
  });
  vi.spyOn(access, 'hasCourseAgentOwnerAccess').mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  maxConcurrentPerUser: 2,
  maxConcurrentPerCourse: 5,
  maxRequestsPerHour: 30,
  dailyCostLimit: 20,
  pricing: { 'fixture-model': { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 } },
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

test.each(['{}', 'not JSON'])(
  'rejects malformed configuration response %s before sending',
  async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await withConfig({ isEnterprise: true, courseAgent: settings }, async () => {
      await expect(provider(scope, conversation, true)).rejects.toMatchObject({
        status: 502,
        message:
          'The course agent Worker returned an invalid configuration response. Your message was not sent. Check the Worker, then retry the send.',
      });
    });
  },
);

test('accepts a configured model with complete pricing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ model: 'fixture-model' })));
  await withConfig({ isEnterprise: true, courseAgent: settings }, async () => {
    await expect(provider(scope, conversation, true)).resolves.toBeDefined();
  });
});
