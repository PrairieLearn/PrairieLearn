import { beforeEach, expect, it, vi } from 'vitest';

import type { AuthzData } from '../../../lib/authz-data-lib.js';
import type { Course, User } from '../../../lib/db-types.js';

const mock = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  respond: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('../../../models/course-agent.js', () => ({
  selectOptionalCourseAgentPushApproval: mock.select,
  updateCourseAgentPushApproval: mock.update,
}));
vi.mock('./ephemeral-runtime.js', () => ({ respondToCourseAgentPushApproval: mock.respond }));
vi.mock('./publication.js', () => ({
  publishCourseAgentApproval: mock.publish,
  courseAgentErrorMessage: (error: Error) => error.message,
  CourseAgentPublicationError: class extends Error {},
}));

import { resolveCourseAgentApproval } from './approval-decisions.js';

const options = {
  course: { id: 'course', example_course: false } as Course,
  user: { id: 'owner' } as User,
  authzData: { user: { id: 'owner' }, has_course_permission_own: true } as AuthzData,
  approvalId: 'approval',
  decision: 'approve' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  let saved = {
    id: 'approval',
    conversation_id: '7f24782b-8d68-4904-a280-85f3f029a57c',
    status: 'pending',
    result: null as Record<string, unknown> | null,
  };
  mock.select.mockImplementation(async () => saved);
  mock.update.mockImplementation(async ({ status, expectedStatuses, result }) => {
    if (!expectedStatuses.includes(saved.status)) return null;
    saved = { ...saved, status, result };
    return saved;
  });
  mock.publish.mockResolvedValue({ message: 'Published', commitSha: 'commit', jobSequenceId: '1' });
});

it('redelivers a committed decision after transport failure without publishing twice', async () => {
  mock.respond
    .mockResolvedValueOnce({ accepted: true })
    .mockRejectedValueOnce(new Error('Worker disconnected'));
  await expect(resolveCourseAgentApproval(options)).rejects.toThrow('Worker disconnected');
  await expect(resolveCourseAgentApproval(options)).resolves.toMatchObject({
    status: 'completed',
    published: true,
  });
  expect(mock.publish).toHaveBeenCalledOnce();
  expect(mock.respond).toHaveBeenLastCalledWith(
    expect.objectContaining({
      decision: 'completed',
      result: expect.objectContaining({ commitSha: 'commit' }),
    }),
  );
});

it('denies and retries denial without publishing', async () => {
  await resolveCourseAgentApproval({ ...options, decision: 'deny' });
  await resolveCourseAgentApproval({ ...options, decision: 'deny' });
  expect(mock.publish).not.toHaveBeenCalled();
  expect(mock.respond).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'denied' }));
});

it('rejects a caller without current ownership before accessing the approval', async () => {
  await expect(
    resolveCourseAgentApproval({
      ...options,
      authzData: { ...options.authzData, has_course_permission_own: false },
    }),
  ).rejects.toThrow('ownership');
  expect(mock.select).not.toHaveBeenCalled();
  expect(mock.publish).not.toHaveBeenCalled();
});
