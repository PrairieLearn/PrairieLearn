import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as coursePermissions from '../../../models/course-permissions.js';

import { hasCourseAgentOwnerAccess } from './access.js';

beforeEach(() => {
  vi.spyOn(coursePermissions, 'selectCoursePermissionForUser');
});
afterEach(() => vi.restoreAllMocks());

const scope = { course_id: '1', user_id: '2', authn_user_id: '3' };

test('requires both authenticated and effective users to own the course', async () => {
  vi.mocked(coursePermissions.selectCoursePermissionForUser).mockResolvedValue('Owner');
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(true);
  expect(coursePermissions.selectCoursePermissionForUser).toHaveBeenCalledWith({
    course_id: '1',
    user_id: '2',
  });
  expect(coursePermissions.selectCoursePermissionForUser).toHaveBeenCalledWith({
    course_id: '1',
    user_id: '3',
  });
});

test.each(['Editor', 'Viewer', null] as const)('rejects effective role %s', async (role) => {
  vi.mocked(coursePermissions.selectCoursePermissionForUser)
    .mockResolvedValueOnce(role)
    .mockResolvedValueOnce('Owner');
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(false);
});

test('rejects an authenticated administrator without course ownership', async () => {
  vi.mocked(coursePermissions.selectCoursePermissionForUser)
    .mockResolvedValueOnce('Owner')
    .mockResolvedValueOnce(null);
  expect(await hasCourseAgentOwnerAccess(scope)).toBe(false);
});
