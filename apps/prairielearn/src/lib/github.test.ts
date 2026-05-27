import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

const { orgsGet, orgsGetMembershipForUser } = vi.hoisted(() => ({
  orgsGet: vi.fn(),
  orgsGetMembershipForUser: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return {
      orgs: {
        get: orgsGet,
        getMembershipForUser: orgsGetMembershipForUser,
      },
    };
  }),
}));

const {
  checkGithubOrgAccess,
  courseRepoContentUrl,
  httpPrefixForCourseRepo,
  isPlatformDefaultOrg,
} = await import('./github.js');

beforeEach(() => {
  orgsGet.mockReset();
  orgsGetMembershipForUser.mockReset();
});

describe('isPlatformDefaultOrg', () => {
  it('matches case-insensitively against config.githubCourseOwner', async () => {
    await withConfig({ githubCourseOwner: 'PrairieLearn' }, () => {
      assert.isTrue(isPlatformDefaultOrg('PrairieLearn'));
      assert.isTrue(isPlatformDefaultOrg('prairielearn'));
      assert.isTrue(isPlatformDefaultOrg('PRAIRIELEARN'));
      assert.isFalse(isPlatformDefaultOrg('SomeOtherOrg'));
    });
  });
});

describe('checkGithubOrgAccess', () => {
  it('returns no_client when githubClientToken is unset', async () => {
    await withConfig({ githubClientToken: null, githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'no_client' });
    });
  });

  it('returns no_machine_user when githubMachineUser is unset', async () => {
    await withConfig({ githubClientToken: 'token', githubMachineUser: null }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'no_machine_user' });
    });
  });

  it('returns org_unreachable when orgs.get returns 404', async () => {
    orgsGet.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'org_unreachable' });
    });
  });

  it('returns org_unreachable when orgs.get returns 403', async () => {
    orgsGet.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'org_unreachable' });
    });
  });

  it('returns not_a_member when membership query returns 404', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { status: 404 }),
    );
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'not_a_member' });
    });
  });

  it('treats pending membership state as not_a_member with detail', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockResolvedValueOnce({ data: { state: 'pending' } });
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'not_a_member', detail: 'pending' });
    });
  });

  it('returns ok when both calls succeed with active membership', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockResolvedValueOnce({ data: { state: 'active' } });
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess('SomeOrg');
      assert.deepEqual(result, { ok: true });
    });
  });

  it('rethrows unexpected (non-404/403) errors from orgs.get', async () => {
    orgsGet.mockRejectedValueOnce(Object.assign(new Error('upstream broken'), { status: 500 }));
    await withConfig({ githubClientToken: 'token', githubMachineUser: 'pl-bot' }, async () => {
      await expect(checkGithubOrgAccess('SomeOrg')).rejects.toThrow('upstream broken');
    });
  });
});

describe('Github library', () => {
  describe('httpPrefixforCourseRepo', () => {
    it('Converts to HTTPS prefix when repo has proper format', () => {
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username/repo.git'),
        'https://github.com/username/repo',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username2/repo-other.git'),
        'https://github.com/username2/repo-other',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username3/repo-yet-another'),
        'https://github.com/username3/repo-yet-another',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:onemore/repository.git/'),
        'https://github.com/onemore/repository',
      );
    });

    it('Returns null if repo uses a different format', () => {
      assert.isNull(httpPrefixForCourseRepo('https://github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('https://www.github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('git@gitlab.com:username/repo.git'));
    });

    it('Returns null if repo is not provided', () => {
      assert.isNull(httpPrefixForCourseRepo(''));
      assert.isNull(httpPrefixForCourseRepo(null));
    });
  });

  describe('courseRepoContentUrl', () => {
    it('Computes a URL for the example course', () => {
      const course = { repository: 'IRRELEVANT', branch: 'IRRELEVANT', example_course: true };
      assert.equal(
        courseRepoContentUrl(course),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse',
      );
      assert.equal(
        courseRepoContentUrl(course, 'questions/addNumbers'),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/addNumbers',
      );
      assert.equal(
        courseRepoContentUrl(course, '/courseInstances/Sp15'),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/courseInstances/Sp15',
      );
    });

    it('Computes a URL for a non-example course when repo has proper format', () => {
      const course = {
        repository: 'git@github.com:username/repo.git',
        branch: 'master',
        example_course: false,
      };
      assert.equal(courseRepoContentUrl(course), 'https://github.com/username/repo/tree/master');
      assert.equal(
        courseRepoContentUrl(course, 'questions/addNumbers'),
        'https://github.com/username/repo/tree/master/questions/addNumbers',
      );
      assert.equal(
        courseRepoContentUrl(course, '/courseInstances/Sp15'),
        'https://github.com/username/repo/tree/master/courseInstances/Sp15',
      );
    });

    it('Returns null if repo is not provided', () => {
      const course = { repository: null, branch: 'master', example_course: false };
      assert.isNull(courseRepoContentUrl(course));
      assert.isNull(courseRepoContentUrl(course, 'questions/addNumbers'));
      assert.isNull(courseRepoContentUrl(course, '/courseInstances/Sp15'));
    });
  });
});
