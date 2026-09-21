import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import * as github from '../lib/github.js';
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
const sql = loadSqlEquiv(import.meta.url);

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

describe('Course GitHub access', { concurrent: false }, () => {
  let owner: User;
  const grant = vi.spyOn(github, 'addGithubRepositoryAdmin');
  beforeAll(helperServer.before());
  beforeAll(async () => {
    owner = await getOrCreateUser({
      uid: 'owner@example.com',
      name: 'Course Owner',
      uin: 'owner',
      email: 'owner@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: owner.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'other-owner@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });
  beforeEach(() => {
    const previous = config.isEnterprise;
    config.isEnterprise = true;
    return () => {
      config.isEnterprise = previous;
    };
  });
  beforeEach(async () => {
    grant.mockReset().mockResolvedValue({ invited: false });
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await setRepository('git@github.com:PrairieLearn/pl-course.git');
    await execute(sql.update_example_course, { example_course: false });
  });
  afterAll(() => grant.mockRestore());
  afterAll(helperServer.after);

  test.each([true, false])('Owner can grant access (invited: %s)', async (invited) => {
    grant.mockResolvedValue({ invited });
    await withUser(owner, async () =>
      withConfig({ githubClientToken: 'test-token' }, async () => {
        const result = await createClient(owner).githubAccess.grant.mutate({
          username: '  course-owner  ',
        });
        expect(result).toEqual({ username: 'course-owner', invited });
        expect(grant).toHaveBeenCalledExactlyOnceWith('PrairieLearn', 'pl-course', 'course-owner');
      }),
    );
  });

  test('supports the PrairieLearn organization using HTTPS regardless of case', async () => {
    await setRepository('https://github.com/prairielearn/pl-course.git');
    await withUser(owner, async () =>
      withConfig({ githubClientToken: 'test-token' }, async () => {
        await createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' });
        expect(grant).toHaveBeenCalledExactlyOnceWith('prairielearn', 'pl-course', 'course-owner');
      }),
    );
  });

  test.each(['Previewer', 'Viewer', 'Editor'] as const)(
    'blocks %s on the server and shows Staff guidance',
    async (role) => {
      await updateCoursePermissionsRole({
        course_id: '1',
        user_id: owner.id,
        course_role: role,
        authn_user_id: '1',
      });
      await withUser(owner, async () =>
        withConfig({ githubClientToken: 'test-token' }, async () => {
          await expect(
            createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
          ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
          const page = await fetchCheerio(settingsUrl);
          expect(page.status).toBe(200);
          expect(page.$('section').text()).toContain('ask one of the course Owners');
          expect(
            page
              .$('section a')
              .filter((_, a) => page.$(a).text() === 'see Staff list')
              .attr('href'),
          ).toBe('/pl/course/1/course_admin/staff');
          expect(page.$('section button').text()).not.toContain('Grant myself access');
          expect(grant).not.toHaveBeenCalled();
        }),
      );
    },
  );

  test('requires a valid CSRF token', async () => {
    await withUser(owner, async () => {
      await expect(
        createClient(owner, 'invalid').githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      expect(grant).not.toHaveBeenCalled();
    });
  });

  test.each(['', 'name@example.com', 'https://github.com/name', 'a'.repeat(40)])(
    'rejects invalid username %s',
    async (username) => {
      await withUser(owner, async () => {
        await expect(
          createClient(owner).githubAccess.grant.mutate({ username }),
        ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
        expect(grant).not.toHaveBeenCalled();
      });
    },
  );

  test.each([
    'git@gitlab.com:PrairieLearn/pl-course.git',
    'https://github.com/University/pl-course.git',
    'git@github.example.com:PrairieLearn/pl-course.git',
  ])('explains and blocks unsupported repository %s', async (repository) => {
    await setRepository(repository);
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      const page = await fetchCheerio(settingsUrl);
      expect(page.$('section').text()).toContain(
        'PrairieLearn can only grant access to repositories in the PrairieLearn organization on',
      );
      expect(page.$('section button').text()).not.toContain('Grant myself access');
      expect(grant).not.toHaveBeenCalled();
    });
  });

  test('hides and blocks access without Enterprise Edition', async () => {
    await withUser(owner, async () =>
      withConfig({ isEnterprise: false, githubClientToken: 'test-token' }, async () => {
        await expect(
          createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        const page = await fetchCheerio(settingsUrl);
        expect(page.$('#github-access-heading').length).toBe(0);
        expect(grant).not.toHaveBeenCalled();
      }),
    );
  });

  test('hides and blocks courses without a repository', async () => {
    await setRepository('');
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      const page = await fetchCheerio(settingsUrl);
      expect(page.$('#github-access-heading').length).toBe(0);
      expect(grant).not.toHaveBeenCalled();
    });
  });

  test('hides and blocks example courses', async () => {
    await execute(sql.update_example_course, { example_course: true });
    await withUser(owner, async () => {
      await expect(
        createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      const page = await fetchCheerio(settingsUrl);
      expect(page.$('#github-access-heading').length).toBe(0);
      expect(grant).not.toHaveBeenCalled();
    });
  });

  test('explains when GitHub integration is unavailable', async () => {
    await withUser(owner, async () =>
      withConfig({ githubClientToken: null }, async () => {
        await expect(
          createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
        ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } });
        const page = await fetchCheerio(settingsUrl);
        expect(page.$('section').text()).toContain(
          'GitHub access cannot be granted on this server',
        );
        expect(grant).not.toHaveBeenCalled();
      }),
    );
  });

  test.each([403, 404, 422, 500])(
    'returns actionable errors without exposing GitHub internals (%s)',
    async (status) => {
      grant.mockRejectedValue(Object.assign(new Error('private upstream detail'), { status }));
      await withUser(owner, async () =>
        withConfig({ githubClientToken: 'test-token' }, async () => {
          await expect(
            createClient(owner).githubAccess.grant.mutate({ username: 'course-owner' }),
          ).rejects.toThrow(/contact support/);
        }),
      );
    },
  );
});
