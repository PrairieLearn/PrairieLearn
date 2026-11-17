import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { updateCourseColumn } from '../models/course.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const settingsUrl = `${siteUrl}/pl/course/1/course_admin/settings`;

function createClient(user: User, csrfToken?: string) {
  return createCourseTrpcClient({
    courseId: '1',
    urlBase: siteUrl,
    csrfToken:
      csrfToken ??
      generatePrefixCsrfToken(
        { url: '/pl/course/1/trpc', authn_user_id: user.id },
        config.secretKey,
      ),
  });
}

async function setRepository(repository: string) {
  await updateCourseColumn({
    courseId: '1',
    columnName: 'repository',
    value: repository,
    authnUserId: '1',
  });
}

describe('Course GitHub access', () => {
  let owner: User;
  const githubFetch = vi.fn<typeof fetch>();
  beforeAll(helperServer.before());
  beforeAll(async () => {
    owner = await getOrCreateUser({ uid: 'owner@example.com', name: 'Course Owner', uin: 'owner' });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: owner.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });
  beforeEach(async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await setRepository('git@github.com:PrairieLearn/pl-course.git');
    const previous = {
      isEnterprise: config.isEnterprise,
      githubClientToken: config.githubClientToken,
    };
    config.isEnterprise = true;
    config.githubClientToken = 'test-token';
    githubFetch.mockReset().mockRejectedValue(new Error('Unexpected GitHub request'));
    const realFetch = fetch;
    // Keep PL requests real so the tests exercise the router and GitHub helper together.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return url.origin === 'https://api.github.com'
        ? githubFetch(input, init)
        : realFetch(input, init);
    });
    return () => {
      fetchSpy.mockRestore();
      Object.assign(config, previous);
    };
  });
  afterAll(helperServer.after);

  test.each([201, 204])('Owner grants Admin access through GitHub (%s)', async (status) => {
    githubFetch.mockResolvedValueOnce(
      status === 204
        ? new Response(null, { status })
        : Response.json({ id: 123, permissions: 'admin' }, { status }),
    );
    await withUser(owner, async () => {
      expect(
        await createClient(owner).githubAccess.grant.mutate({ username: '  course-owner  ' }),
      ).toEqual({ username: 'course-owner', invited: status === 201 });
    });
    expect(githubFetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.github.com/repos/PrairieLearn/pl-course/collaborators/course-owner',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ permission: 'admin' }) }),
    );
  });

  test('upgrades a pending invitation to Admin', async () => {
    githubFetch
      .mockResolvedValueOnce(Response.json({ id: 123, permissions: 'write' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ id: 123, permissions: 'admin' }));
    await withUser(owner, async () => {
      expect(
        await createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).toEqual({ username: 'course-owner', invited: true });
    });
    expect(githubFetch).toHaveBeenCalledTimes(2);
    expect(githubFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/PrairieLearn/pl-course/invitations/123',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ permissions: 'admin' }) }),
    );
  });

  test('blocks non-Owners on the server', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      expect(githubFetch).not.toHaveBeenCalled();
    });
  });

  test('requires a valid CSRF token', async () => {
    await withUser(owner, async () => {
      await expect(
        createClient(owner, 'invalid').githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      expect(githubFetch).not.toHaveBeenCalled();
    });
  });

  test.each([
    'git@gitlab.com:PrairieLearn/pl-course.git',
    'https://github.com/University/pl-course.git',
  ])('explains and blocks unsupported repository %s', async (repository) => {
    await setRepository(repository);
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      const page = await fetchCheerio(settingsUrl);
      expect(page.$('section').text()).toContain('PrairieLearn can only grant access');
      expect(page.$('section button').text()).not.toContain('Grant myself access');
      expect(githubFetch).not.toHaveBeenCalled();
    });
  });

  test.each([
    { isEnterprise: false, githubClientToken: 'test-token', code: 'FORBIDDEN' },
    { isEnterprise: true, githubClientToken: null, code: 'PRECONDITION_FAILED' },
  ])('hides and blocks access with configuration $code', async ({ code, ...configuration }) => {
    await withUser(owner, async () =>
      withConfig(configuration, async () => {
        await expect(
          createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
        ).rejects.toMatchObject({ data: { code } });
        const page = await fetchCheerio(settingsUrl);
        expect(page.$('#github-access-heading').length).toBe(0);
        expect(githubFetch).not.toHaveBeenCalled();
      }),
    );
  });

  test('reports a GitHub failure without claiming success', async () => {
    githubFetch.mockResolvedValueOnce(
      Response.json({ message: 'private upstream detail' }, { status: 422 }),
    );
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringContaining('contact support'),
      });
    });
  });
});
