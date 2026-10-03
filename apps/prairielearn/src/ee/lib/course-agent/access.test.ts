import { beforeEach, expect, test, vi } from 'vitest';

import { selectCoursePermissionForUser } from '../../../models/course-permissions.js';

import { hasCourseAgentOwnerAccess } from './access.js';

vi.mock('../../../models/course-permissions.js', () => ({
  selectCoursePermissionForUser: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

const scope = { course_id: '1', user_id: '2', authn_user_id: '3' };

test('requires both authenticated and effective users to own the course', async () => {
  vi.mocked(selectCoursePermissionForUser).mockResolvedValue('Owner');
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(true);
  expect(selectCoursePermissionForUser).toHaveBeenCalledWith({ course_id: '1', user_id: '2' });
  expect(selectCoursePermissionForUser).toHaveBeenCalledWith({ course_id: '1', user_id: '3' });
});

test.each(['Editor', 'Viewer', null] as const)('rejects effective role %s', async (role) => {
  vi.mocked(selectCoursePermissionForUser)
    .mockResolvedValueOnce(role)
    .mockResolvedValueOnce('Owner');
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(false);
});

test('rejects an authenticated administrator without course ownership', async () => {
  vi.mocked(selectCoursePermissionForUser)
    .mockResolvedValueOnce('Owner')
    .mockResolvedValueOnce(null);
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(false);
});
