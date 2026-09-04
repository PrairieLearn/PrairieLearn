import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

import { assert, describe, expect, it, vi } from 'vitest';

import { courseGithubReadParams, githubReadUrl, proxyCourseGithubRead } from './github.js';

describe('course repository credential broker', () => {
  it('authorizes the Durable Object ID rather than the sandbox name', async () => {
    const sandboxId = 'course-agent-11111111-1111-4111-8111-111111111111';
    const containerId = 'a'.repeat(64);
    const namespace = { idFromName: vi.fn(() => ({ toString: () => containerId })) };
    const params = courseGithubReadParams(namespace, sandboxId, 'PrairieLearn/course');
    expect(namespace.idFromName).toHaveBeenCalledWith(sandboxId);
    expect(params.containerId).toBe(containerId);
    const request = new Request(
      'https://github.com/PrairieLearn/course.git/info/refs?service=git-upload-pack',
      { headers: { authorization: `Basic ${btoa('x-access-token:proxy-read')}` } },
    );
    const forward = vi.fn<typeof fetch>(async () => new Response('ok'));
    const env = { COURSE_AGENT_GITHUB_PAT: 'test-pat' };
    expect(
      (await proxyCourseGithubRead(request, env, { containerId, params }, forward)).status,
    ).toBe(200);
    expect(
      (await proxyCourseGithubRead(request, env, { containerId: sandboxId, params }, forward))
        .status,
    ).toBe(403);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['GET', '/PrairieLearn/other.git/info/refs?service=git-upload-pack'],
    ['GET', '/PrairieLearn/course.git/info/refs?service=git-receive-pack'],
    ['POST', '/PrairieLearn/course.git/git-receive-pack'],
    ['GET', '/PrairieLearn/course.git/settings?service=git-upload-pack'],
    ['POST', '/PrairieLearn/course.git/extra/git-upload-pack'],
  ])('rejects unauthorized %s %s before requesting credentials', async (method, path) => {
    const forward = vi.fn<typeof fetch>();
    const response = await proxyCourseGithubRead(
      new Request(`https://github.com${path}`, { method }),
      { COURSE_AGENT_GITHUB_PAT: 'test-pat' },
      {
        containerId: 'container',
        params: { containerId: 'container', repository: 'PrairieLearn/course' },
      },
      forward,
    );
    expect(response.status).toBe(403);
    expect(forward).not.toHaveBeenCalled();
  });

  it('challenges a real Git client before forwarding its authenticated discovery request', async () => {
    const authorizations: (string | undefined)[] = [];
    const forward = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get('authorization')).toBe(`Basic ${btoa('x-access-token:test-pat')}`);
      const ref = `${'a'.repeat(40)} HEAD\n`;
      const packet = `${(ref.length + 4).toString(16).padStart(4, '0')}${ref}`;
      return new Response(`001e# service=git-upload-pack\n0000${packet}0000`, {
        headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' },
      });
    });
    const server = createServer(async (request, response) => {
      authorizations.push(request.headers.authorization);
      const result = await proxyCourseGithubRead(
        new Request(`https://github.com${request.url}`, {
          headers: request.headers.authorization
            ? { authorization: request.headers.authorization }
            : {},
        }),
        { COURSE_AGENT_GITHUB_PAT: 'test-pat' },
        {
          containerId: 'container',
          params: { containerId: 'container', repository: 'PrairieLearn/course' },
        },
        forward,
      );
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.writeHead(result.status);
      response.end(await result.text());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert(address && typeof address === 'object');
      await promisify(execFile)(
        'git',
        [
          'ls-remote',
          `http://x-access-token:proxy-read@127.0.0.1:${address.port}/PrairieLearn/course.git`,
        ],
        {
          env: {
            PATH: process.env.PATH,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_TERMINAL_PROMPT: '0',
          },
        },
      );
      expect(authorizations).toEqual([undefined, `Basic ${btoa('x-access-token:proxy-read')}`]);
      expect(forward).toHaveBeenCalledTimes(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('injects the PAT only for upload-pack on the configured repository', async () => {
    const fetchImplementation: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      return Response.json({ authorization: request.headers.get('authorization') });
    };
    const context = {
      containerId: 'sandbox-1',
      params: { containerId: 'sandbox-1', repository: 'PrairieLearn/course' },
    };
    const response = await proxyCourseGithubRead(
      new Request('https://github.com/PrairieLearn/course.git/info/refs?service=git-upload-pack', {
        headers: { authorization: `Basic ${btoa('x-access-token:proxy-read')}` },
      }),
      { COURSE_AGENT_GITHUB_PAT: 'real-secret' },
      context,
      fetchImplementation,
    );
    expect(await response.json()).toEqual({
      authorization: `Basic ${btoa('x-access-token:real-secret')}`,
    });
    expect(
      (
        await proxyCourseGithubRead(
          new Request('https://github.com/PrairieLearn/course.git/git-receive-pack', {
            method: 'POST',
            headers: { authorization: `Basic ${btoa('x-access-token:proxy-read')}` },
          }),
          { COURSE_AGENT_GITHUB_PAT: 'real-secret' },
          context,
          fetchImplementation,
        )
      ).status,
    ).toBe(403);
  });

  it('normalizes supported GitHub repository URLs', () => {
    expect(githubReadUrl('git@github.com:PrairieLearn/course.git')).toBe(
      'https://x-access-token:proxy-read@github.com/PrairieLearn/course.git',
    );
    expect(() => githubReadUrl('https://example.com/course.git')).toThrow('github.com');
  });
});
