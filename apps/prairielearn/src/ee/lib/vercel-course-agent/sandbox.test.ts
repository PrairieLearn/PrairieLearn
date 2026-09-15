import { beforeEach, expect, test, vi } from 'vitest';

import { config } from '../../../lib/config.js';

import { createSandboxAgent, sandboxLifetimeMs } from './sandbox.js';

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  command: vi.fn(),
  stop: vi.fn(),
  install: vi.fn(),
  agent: vi.fn(),
}));
vi.mock('@vercel/sandbox', () => ({ Sandbox: { create: fake.create } }));
vi.mock('@ai-sdk/sandbox-vercel', () => ({ createVercelSandbox: () => ({}) }));
vi.mock('./git-auth.js', () => ({
  withGitAuth: () => ({ createSession: async () => ({ addRequestTransformations: fake.install }) }),
}));
vi.mock('@ai-sdk/harness/agent', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HarnessAgent: vi.fn(function (options: unknown) {
    fake.agent(options);
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  config.vercelCourseAgent = {
    token: 'vercel-token',
    teamId: 'team',
    projectId: 'project',
    openAiApiKey: 'openai-key',
    githubPat: 'git-pat',
  };
  fake.create.mockResolvedValue({ runCommand: fake.command, stop: fake.stop });
  fake.command.mockResolvedValue({ exitCode: 0 });
  fake.stop.mockResolvedValue(undefined);
});

const repository = { url: 'https://github.com/example/course.git', branch: 'course-content' };

test('installs credentials before cloning the configured branch and starts the agent in course/', async () => {
  await createSandboxAgent(repository);
  expect(fake.create).toHaveBeenCalledWith(
    expect.objectContaining({ persistent: false, timeout: sandboxLifetimeMs }),
  );
  expect(fake.install.mock.invocationCallOrder[0]).toBeLessThan(
    fake.command.mock.invocationCallOrder[0],
  );
  expect(fake.command).toHaveBeenCalledWith({
    cmd: 'git',
    args: [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      'course-content',
      '--config',
      'user.name=PrairieLearn course agent',
      '--config',
      'user.email=course-agent@prairielearn.org',
      '--',
      repository.url,
      'course',
    ],
  });
  expect(fake.agent).toHaveBeenCalledWith(
    expect.objectContaining({ sandboxConfig: { workDir: 'course' } }),
  );
  expect(JSON.stringify(fake.command.mock.calls)).not.toContain('git-pat');
});

test('stops failed clones before exposing a native agent', async () => {
  fake.command.mockResolvedValue({ exitCode: 128 });
  await expect(createSandboxAgent(repository)).rejects.toThrow('Course checkout failed');
  expect(fake.stop).toHaveBeenCalledOnce();
  expect(fake.agent).not.toHaveBeenCalled();
});
