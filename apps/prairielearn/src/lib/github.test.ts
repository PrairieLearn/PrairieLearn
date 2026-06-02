import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import { parseGithubRepository } from './github-utils.js';
import {
  addMachineAccessToRepo,
  checkGithubOrgAccess,
  courseRepoContentUrl,
  httpPrefixForCourseRepo,
} from './github.js';

const orgsGet = vi.fn();
const orgsGetMembershipForUser = vi.fn();
const reposAddCollaborator = vi.fn();
const teamsAddOrUpdateRepoPermissionsInOrg = vi.fn();

const orgAccessClient = {
  orgs: { get: orgsGet, getMembershipForUser: orgsGetMembershipForUser },
} as unknown as Parameters<typeof checkGithubOrgAccess>[0];

const repoAccessClient = {
  repos: { addCollaborator: reposAddCollaborator },
  teams: { addOrUpdateRepoPermissionsInOrg: teamsAddOrUpdateRepoPermissionsInOrg },
} as unknown as Parameters<typeof addMachineAccessToRepo>[0];

const job = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn() };

beforeEach(() => {
  orgsGet.mockReset();
  orgsGetMembershipForUser.mockReset();
  reposAddCollaborator.mockReset();
  teamsAddOrUpdateRepoPermissionsInOrg.mockReset();
});

describe('checkGithubOrgAccess', () => {
  it('returns org_unreachable when the org cannot be fetched', async () => {
    orgsGet.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    await withConfig({ githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess(orgAccessClient, 'SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'org_unreachable' });
    });
  });

  it('returns not_a_member when the membership query 404s', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { status: 404 }),
    );
    await withConfig({ githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess(orgAccessClient, 'SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'not_a_member' });
    });
  });

  it('treats pending membership as pending_invitation', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockResolvedValueOnce({ data: { state: 'pending' } });
    await withConfig({ githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess(orgAccessClient, 'SomeOrg');
      assert.deepEqual(result, { ok: false, reason: 'pending_invitation' });
    });
  });

  it('returns ok for active membership', async () => {
    orgsGet.mockResolvedValueOnce({ data: {} });
    orgsGetMembershipForUser.mockResolvedValueOnce({ data: { state: 'active' } });
    await withConfig({ githubMachineUser: 'pl-bot' }, async () => {
      const result = await checkGithubOrgAccess(orgAccessClient, 'SomeOrg');
      assert.deepEqual(result, { ok: true });
    });
  });

  it('rethrows unexpected (non-404/403) errors', async () => {
    orgsGet.mockRejectedValueOnce(Object.assign(new Error('upstream broken'), { status: 500 }));
    await withConfig({ githubMachineUser: 'pl-bot' }, async () => {
      await expect(checkGithubOrgAccess(orgAccessClient, 'SomeOrg')).rejects.toThrow(
        'upstream broken',
      );
    });
  });
});

describe('addMachineAccessToRepo', () => {
  it('adds the machine team for the platform default org', async () => {
    await withConfig(
      {
        githubCourseOwner: 'PrairieLearn',
        githubMachineTeam: 'machine',
        githubMachineUser: 'pl-bot',
      },
      async () => {
        await addMachineAccessToRepo(repoAccessClient, 'prairielearn', 'test-course', job);
      },
    );

    expect(reposAddCollaborator).not.toHaveBeenCalled();
    expect(teamsAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
      owner: 'prairielearn',
      org: 'prairielearn',
      repo: 'test-course',
      team_slug: 'machine',
      permission: 'admin',
    });
  });

  it('adds the machine user directly for a custom org', async () => {
    await withConfig(
      { githubCourseOwner: 'PrairieLearn', githubMachineUser: 'pl-bot' },
      async () => {
        await addMachineAccessToRepo(repoAccessClient, 'CustomOrg', 'test-course', job);
      },
    );

    expect(teamsAddOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled();
    expect(reposAddCollaborator).toHaveBeenCalledWith({
      owner: 'CustomOrg',
      repo: 'test-course',
      username: 'pl-bot',
      permission: 'admin',
    });
  });

  it('rejects a custom org when the machine user is not configured', async () => {
    await withConfig({ githubCourseOwner: 'PrairieLearn', githubMachineUser: null }, async () => {
      await expect(
        addMachineAccessToRepo(repoAccessClient, 'CustomOrg', 'test-course', job),
      ).rejects.toThrow('GitHub machine user is not configured');
    });
  });
});

describe('parseGithubRepository', () => {
  it('parses GitHub SSH and HTTPS URLs, ignoring optional .git and slashes', () => {
    assert.deepEqual(parseGithubRepository('git@github.com:Org/repo.git'), {
      owner: 'Org',
      repo: 'repo',
    });
    assert.deepEqual(parseGithubRepository('git@github.com:/Org/repo'), {
      owner: 'Org',
      repo: 'repo',
    });
    assert.deepEqual(parseGithubRepository('https://github.com/Org/repo.git/'), {
      owner: 'Org',
      repo: 'repo',
    });
  });

  it('returns null for non-GitHub URLs', () => {
    assert.isNull(parseGithubRepository('git@gitlab.com:u/r.git'));
    assert.isNull(parseGithubRepository(''));
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
