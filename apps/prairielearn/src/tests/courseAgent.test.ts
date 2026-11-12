import { once } from 'node:events';
import { type IncomingMessage, createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { execa } from 'execa';
import fs from 'fs-extra';
import { io } from 'socket.io-client';
import * as tar from 'tar';
import { dir as temporaryDirectory } from 'tmp-promise';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  UsageDecisionSchema,
  type UsageReport,
  emptyUsage,
} from '@prairielearn/course-agent-types';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';

import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { selectCourseAgentConversationUsage } from '../ee/models/course-agent-usage-report.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  insertCoursePermissionsByUserUid,
  selectCoursePermissionForUser,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { updateCourseColumn } from '../models/course.js';
import { selectUserById } from '../models/user.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;

function createClient(user: User) {
  return createCourseTrpcClient({
    courseId: '1',
    urlBase: siteUrl,
    csrfToken: generatePrefixCsrfToken(
      { url: '/pl/course/1/trpc', authn_user_id: user.id },
      config.secretKey,
    ),
  });
}

function createConversation(user: User) {
  return insertCourseAgentConversation({
    course_id: '1',
    user_id: user.id,
    agent_conversation_id: crypto.randomUUID(),
    title: 'Test conversation',
  });
}

function historyUrl(conversationId: string) {
  return `${siteUrl}/pl/course/1/course_agent/conversations/${conversationId}/get-messages`;
}

describe('Course agent access and conversation privacy', () => {
  let serviceConversationId = crypto.randomUUID();
  const serviceRequests: { path: string; body: unknown; authorization: string | undefined }[] = [];
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const body = bytes.toString();
    serviceRequests.push({
      path: request.url!,
      body:
        request.headers['content-type'] === 'application/gzip'
          ? bytes
          : body
            ? JSON.parse(body)
            : null,
      authorization: request.headers.authorization,
    });
    response.setHeader('Content-Type', 'application/json');
    const creating = request.url === '/conversations' || request.url === '/conversations/local';
    response.statusCode = creating ? 201 : 200;
    response.end(JSON.stringify(creating ? { id: serviceConversationId } : { recovered: true }));
  });
  let owner: User;
  let otherOwner: User;
  const originalConfig = {
    isEnterprise: config.isEnterprise,
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
    features: config.features,
  };

  beforeAll(async () => {
    service.listen(0, '127.0.0.1');
    await once(service, 'listening');
    const address = service.address();
    if (!address || typeof address === 'string') throw new Error('Expected a service TCP address');
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: `http://127.0.0.1:${address.port}`,
      courseAgentServiceToken: ['test-token', 'next-token'],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before()();
    owner = await getOrCreateUser({ uid: 'owner@example.com', name: 'Course Owner', uin: 'owner' });
    otherOwner = await getOrCreateUser({
      uid: 'other-owner@example.com',
      name: 'Other Owner',
      uin: 'other-owner',
    });
    for (const user of [owner, otherOwner]) {
      await insertCoursePermissionsByUserUid({
        course_id: '1',
        uid: user.uid,
        course_role: 'Owner',
        authn_user_id: '1',
      });
    }
  });
  beforeEach(async () => {
    serviceConversationId = crypto.randomUUID();
    serviceRequests.length = 0;
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    service.close();
    await once(service, 'close');
  });
  afterAll(() => Object.assign(config, originalConfig));

  function report(agentId: string, body: UsageReport, token = 'test-token') {
    return fetch(`${siteUrl}/pl/api/course-agent/conversations/${agentId}/usage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function usageReport(outputTokens = 0): UsageReport {
    return {
      reportId: crypto.randomUUID(),
      model: 'gpt-6-luna',
      usage: { ...emptyUsage(), outputTokens },
    };
  }

  async function decision(response: Response) {
    expect(response.status).toBe(200);
    return UsageDecisionSchema.parse(await response.json());
  }

  test('allows an administrator without explicit course permissions', async () => {
    const administrator = await selectUserById('1');
    expect(
      await selectCoursePermissionForUser({ course_id: '1', user_id: administrator.id }),
    ).toBeNull();
    await withUser(administrator, () =>
      expect(createClient(administrator).courseAgent.list.query()).resolves.toEqual([]),
    );
    const conversation = await createConversation(administrator);
    expect(await decision(await report(conversation.agent_conversation_id, usageReport()))).toEqual(
      { status: 'allowed' },
    );
  });

  test('records each report once and keeps final usage after access is revoked', async () => {
    const conversation = await createConversation(owner);
    const agentId = conversation.agent_conversation_id;
    const first: UsageReport = {
      reportId: crypto.randomUUID(),
      model: 'gpt-6-luna',
      usage: { ...emptyUsage(), inputTokens: 10_000, cachedInputTokens: 8000, outputTokens: 2000 },
    };
    expect((await report(agentId, first, 'wrong')).status).toBe(401);
    // A Worker still sending the second configured token is accepted during rotation.
    expect(await decision(await report(agentId, first, 'next-token'))).toEqual({
      status: 'allowed',
    });
    // A retry after a lost reply is answered again without counting the usage twice.
    expect(await decision(await report(agentId, first))).toEqual({ status: 'allowed' });
    // The first recording stands even if a buggy retry resends different usage.
    expect(await decision(await report(agentId, { ...first, usage: emptyUsage() }))).toEqual({
      status: 'allowed',
    });
    expect((await report(agentId, { ...usageReport(), model: 'unpriced' })).status).toBe(400);
    // gpt-6-luna: 2000 uncached and 8000 cached input tokens plus 2000 output tokens is $0.00128.
    expect(await selectCourseAgentConversationUsage(conversation.id)).toEqual({
      input_tokens: 10_000,
      input_tokens_cache_read: 8000,
      output_tokens: 2000,
      output_tokens_reasoning: 0,
      cost_milli_dollars: 2,
    });
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    expect(await decision(await report(agentId, usageReport(500)))).toEqual({
      status: 'denied',
      reason: 'not_allowed',
    });
    expect(await selectCourseAgentConversationUsage(conversation.id)).toMatchObject({
      output_tokens: 2500,
    });
  });

  test('limits hourly spending per user across conversations', async () => {
    const a = (await createConversation(owner)).agent_conversation_id;
    const b = (await createConversation(owner)).agent_conversation_id;
    // gpt-6-luna output costs $0.50 per million tokens, so 80M tokens is $40.
    expect(await decision(await report(a, usageReport(80_000_000)))).toEqual({
      status: 'allowed',
    });
    expect(await decision(await report(b, usageReport(18_000_000)))).toEqual({
      status: 'allowed',
    });
    const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    expect(await decision(await report(a, usageReport(2_000_000)))).toEqual({
      status: 'denied',
      reason: 'hourly_limit',
      retryAt: new Date(hourStart + 3_600_000).toISOString(),
    });
    expect(await decision(await report(b, usageReport()))).toMatchObject({ status: 'denied' });
    const other = await createConversation(otherOwner);
    expect(await decision(await report(other.agent_conversation_id, usageReport()))).toEqual({
      status: 'allowed',
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(hourStart + 3_600_000);
    try {
      expect(await decision(await report(a, usageReport()))).toEqual({ status: 'allowed' });
    } finally {
      now.mockRestore();
    }
  });

  test('rejects API and history access when the feature is disabled', async () => {
    const conversation = await createConversation(owner);
    await withUser(owner, () =>
      withConfig({ features: { 'course-agent': false } }, async () => {
        await expect(createClient(owner).courseAgent.list.query()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        expect((await fetch(historyUrl(conversation.id))).status).toBe(403);
        await expect(
          createClient(owner).courseAgent.resume.mutate({ conversationId: conversation.id }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      }),
    );
  });

  test('rejects API and history access for non-owners', async () => {
    const conversation = await createConversation(owner);
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    await withUser(owner, async () => {
      await expect(createClient(owner).courseAgent.list.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      expect((await fetch(historyUrl(conversation.id))).status).toBe(403);
      await expect(
        createClient(owner).courseAgent.resume.mutate({ conversationId: conversation.id }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
  });

  test('keeps conversations private to their creator, including other course owners', async () => {
    const own = await createConversation(owner);
    const other = await createConversation(otherOwner);
    await withUser(owner, async () => {
      const client = createClient(owner);
      const ids = (await client.courseAgent.list.query()).map((c) => c.id);
      expect(ids).toContain(own.id);
      expect(ids).not.toContain(other.id);
      expect((await fetch(historyUrl(other.id))).status).toBe(404);
      await expect(
        client.courseAgent.resume.mutate({ conversationId: other.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect(await client.courseAgent.resume.mutate({ conversationId: own.id })).toEqual({
        recovered: true,
      });
      await expect(
        client.courseAgent.setTitle.mutate({ conversationId: other.id, title: 'Renamed' }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect(
        await client.courseAgent.setTitle.mutate({ conversationId: own.id, title: 'Renamed' }),
      ).toMatchObject({ id: own.id, title: 'Renamed' });
    });
    expect(serviceRequests.map((request) => request.path)).toEqual([
      `/conversations/${own.agent_conversation_id}/resume`,
    ]);
  });

  test('binds creation to the authorized course repository and branch', async () => {
    await updateCourseColumn({
      courseId: '1',
      columnName: 'repository',
      value: 'git@github.com:PrairieLearn/test-course.git',
      authnUserId: owner.id,
    });
    await updateCourseColumn({
      courseId: '1',
      columnName: 'branch',
      value: 'pilot-edits',
      authnUserId: owner.id,
    });
    const conversation = await withConfig({ fileEditorUseGit: true }, () =>
      withUser(owner, () =>
        createClient(owner).courseAgent.create.mutate({ text: 'First message' }),
      ),
    );
    expect(serviceRequests).toEqual([
      {
        path: '/conversations',
        body: { repository: 'PrairieLearn/test-course', branch: 'pilot-edits' },
        authorization: 'Bearer test-token',
      },
    ]);
    const stored = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: owner.id,
    });
    expect(stored!.agent_conversation_id).toBe(serviceConversationId);
  });

  test('rejects unbound creation before calling the service or recording a conversation', async () => {
    await updateCourseColumn({
      courseId: '1',
      columnName: 'repository',
      value: 'https://gitlab.com/course/repo',
      authnUserId: owner.id,
    });
    await withConfig({ fileEditorUseGit: true }, () =>
      withUser(owner, async () => {
        const client = createClient(owner);
        const before = await client.courseAgent.list.query();
        await expect(
          client.courseAgent.create.mutate({ text: 'First message' }),
        ).rejects.toMatchObject({
          data: { code: 'BAD_REQUEST' },
        });
        expect(await client.courseAgent.list.query()).toEqual(before);
      }),
    );
    expect(serviceRequests).toEqual([]);
  });

  test('initializes from current local files and course-only Git history in dev mode', async () => {
    const fixture = await fs.mkdtemp(path.join(TEST_COURSE_PATH, '.course-agent-local-'));
    const output = await temporaryDirectory({ unsafeCleanup: true });
    try {
      await fs.writeFile(path.join(fixture, 'question.html'), 'Uncommitted local course contents');
      await fs.outputFile(path.join(fixture, '.git', 'config'), 'Host repository metadata');
      await updateCourseColumn({
        courseId: '1',
        columnName: 'repository',
        value: '',
        authnUserId: owner.id,
      });
      await withConfig({ devMode: true, fileEditorUseGit: false }, () =>
        withUser(owner, () =>
          createClient(owner).courseAgent.create.mutate({ text: 'Read my local changes' }),
        ),
      );
      expect(serviceRequests).toHaveLength(1);
      expect(serviceRequests[0]).toMatchObject({
        path: '/conversations/local',
        authorization: 'Bearer test-token',
      });
      const archivePath = path.join(output.path, 'source.tar.gz');
      await fs.writeFile(archivePath, serviceRequests[0].body as Buffer);
      await tar.extract({ file: archivePath, cwd: output.path });
      const course = path.join(output.path, 'testCourse');
      const copied = path.join(course, path.basename(fixture));
      expect(await fs.readFile(path.join(copied, 'question.html'), 'utf8')).toBe(
        'Uncommitted local course contents',
      );
      expect(await fs.pathExists(path.join(copied, '.git'))).toBe(false);
      const { stdout: objects } = await execa('git', ['rev-list', '--objects', '--all'], {
        cwd: course,
      });
      const historicalPaths = objects
        .split('\n')
        .filter((line) => line.includes(' '))
        .map((line) => line.slice(line.indexOf(' ') + 1))
        .filter(Boolean);
      expect(historicalPaths).toContain('testCourse/infoCourse.json');
      expect(
        historicalPaths.every((entry) => entry === 'testCourse' || entry.startsWith('testCourse/')),
      ).toBe(true);
    } finally {
      await fs.remove(fixture);
      await output.cleanup();
    }
  });

  // startServer() closes unknown upgrade paths; its Socket.IO exemption must stay intact.
  // Force WebSocket: polling fallback could hide an accidentally rejected upgrade.
  test('allows Socket.IO WebSocket upgrades alongside chat', async () => {
    const socket = io(siteUrl, {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
        socket.connect();
      });
    } finally {
      socket.disconnect();
    }
  });

  test('proxies a slow WebSocket handshake with non-ASCII course context', async () => {
    const title = 'Mécanique — 日本語 📚';
    await updateCourseColumn({
      courseId: '1',
      columnName: 'title',
      value: title,
      authnUserId: owner.id,
    });
    const conversation = await createConversation(owner);
    const upstream = withResolvers<IncomingMessage>();
    const service = createServer(async (req, res) => {
      upstream.resolve(req);
      // Engine.IO used to close other protocols' unanswered upgrades after one second.
      await sleep(1250);
      res.writeHead(101, { Upgrade: 'websocket', Connection: 'Upgrade' });
      res.end();
    });
    service.listen(0, '127.0.0.1');
    await once(service, 'listening');
    const { port } = service.address() as AddressInfo;
    try {
      await withUser(owner, () =>
        withConfig({ courseAgentServiceUrl: `http://127.0.0.1:${port}` }, async () => {
          const path = `/pl/course/1/course_agent/conversations/${conversation.id}`;
          const csrfToken = generatePrefixCsrfToken(
            { url: path, authn_user_id: owner.id },
            config.secretKey,
          );
          const handshake = request(`${siteUrl}${path}?csrfToken=${csrfToken}`, {
            headers: { Connection: 'Upgrade', Upgrade: 'websocket', Cookie: 'browser=secret' },
          });
          const upgraded = withResolvers<number | undefined>();
          handshake.once('error', upgraded.reject);
          handshake.once('response', (response) => {
            response.resume();
            upgraded.resolve(response.statusCode);
          });
          handshake.once('upgrade', (response, socket) => {
            socket.destroy();
            upgraded.resolve(response.statusCode);
          });
          handshake.end();
          expect(await upgraded.promise).toBe(101);
          const forwarded = await upstream.promise;
          expect(forwarded.url).toBe(`/conversations/${conversation.agent_conversation_id}`);
          expect(forwarded.headers.authorization).toBe('Bearer test-token');
          expect(forwarded.headers.cookie).toBeUndefined();
          expect(
            JSON.parse(decodeURIComponent(forwarded.headers['x-pl-course-context'] as string)),
          ).toMatchObject({ courseTitle: title });
        }),
      );
    } finally {
      service.close();
      await once(service, 'close');
    }
  });
});
