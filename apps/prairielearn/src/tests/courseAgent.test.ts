import { once } from 'node:events';
import { type IncomingMessage, createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { execa } from 'execa';
import fs from 'fs-extra';
import { Redis } from 'ioredis';
import { io } from 'socket.io-client';
import * as tar from 'tar';
import { dir as temporaryDirectory } from 'tmp-promise';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  type BudgetRequest,
  BudgetResponseSchema,
  emptyUsage,
} from '@prairielearn/course-agent-types';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';

import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { RedisRateLimiter } from '../lib/redis-rate-limiter.js';
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
    cacheKeyPrefix: config.cacheKeyPrefix,
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
    config.cacheKeyPrefix = `${originalConfig.cacheKeyPrefix}course-agent-test:${crypto.randomUUID()}:`;
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

  test('grants credit to an administrator without explicit course permissions', async () => {
    const administrator = await selectUserById('1');
    expect(
      await selectCoursePermissionForUser({ course_id: '1', user_id: administrator.id }),
    ).toBeNull();
    await withUser(administrator, () =>
      expect(createClient(administrator).courseAgent.list.query()).resolves.toEqual([]),
    );
    const conversation = await createConversation(administrator);
    const response = await fetch(
      `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/usage`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usageReportCount: 1,
          usageDelta: emptyUsage(),
          requestCredit: true,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(BudgetResponseSchema.parse(await response.json()).allocation).toMatchObject({
      status: 'granted',
      grantedMilliDollars: 3000,
    });
  });

  test('rejects duplicate and skipped reports and preserves final usage after access revocation', async () => {
    const conversation = await createConversation(owner);
    const url = `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/usage`;
    const report = (body: BudgetRequest, token = 'test-token') =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const request: BudgetRequest = {
      usageReportCount: 1,
      usageDelta: { ...emptyUsage(), inputTokens: 10000, outputTokens: 2000, costMilliDollars: 40 },
      requestCredit: true,
    };
    expect((await report(request, 'wrong')).status).toBe(401);
    // A Worker still sending the second configured token is accepted during rotation.
    const accepted = await report(request, 'next-token');
    expect(accepted.status).toBe(200);
    const first = BudgetResponseSchema.parse(await accepted.json());
    expect(first.allocation).toMatchObject({ status: 'granted', grantedMilliDollars: 3000 });
    const skipped = await report({
      ...request,
      usageReportCount: 3,
      usageDelta: { ...emptyUsage(), costMilliDollars: 50000 },
    });
    expect(skipped.status).toBe(409);
    expect(await skipped.json()).toEqual({
      message: 'The usage report is out of order.',
    });
    expect((await report(request)).status).toBe(409);
    expect(
      (await report({ ...request, usageDelta: { ...request.usageDelta, costMilliDollars: 80 } }))
        .status,
    ).toBe(409);
    let saved = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: owner.id,
    });
    expect(saved).toMatchObject({
      usage_input_tokens: 10000,
      usage_output_tokens: 2000,
      usage_cost_milli_dollars: 40,
      usage_report_count: 1,
    });
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    const final = {
      usageReportCount: 2,
      usageDelta: { ...emptyUsage(), outputTokens: 500, costMilliDollars: 10 },
      requestCredit: true,
    };
    const denied = await report(final);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      usageReportCount: 2,
      allocation: { status: 'denied', reason: 'not_allowed' },
    });
    expect(
      (
        await report({
          usageReportCount: 3,
          usageDelta: { ...emptyUsage(), costMilliDollars: 5 },
          requestCredit: false,
        })
      ).status,
    ).toBe(200);
    saved = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: owner.id,
    });
    expect(saved).toMatchObject({
      usage_output_tokens: 2500,
      usage_cost_milli_dollars: 55,
      usage_report_count: 3,
    });
    expect((await report(request)).status).toBe(409);
  });

  test('limits actual hourly spend per user without charging credit pulls or report retries', async () => {
    const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl!);
    const limiter = new RedisRateLimiter({
      redis: () => redis,
      keyPrefix: () => config.cacheKeyPrefix + 'course-agent-usage:',
      intervalSeconds: 3600,
    });
    const report = (
      agentId: string,
      usageReportCount: number,
      costMilliDollars: number,
      requestCredit = true,
    ) =>
      fetch(`${siteUrl}/pl/api/course-agent/conversations/${agentId}/usage`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usageReportCount,
          usageDelta: { ...emptyUsage(), costMilliDollars },
          requestCredit,
        }),
      });
    try {
      const a = await createConversation(owner);
      const b = await createConversation(owner);
      expect((await report(a.agent_conversation_id, 1, 40000, false)).status).toBe(200);
      expect((await report(a.agent_conversation_id, 1, 40000, false)).status).toBe(409);
      expect((await report(b.agent_conversation_id, 1, 0)).status).toBe(200);
      expect(await limiter.getIntervalUsage(`user:${owner.id}`)).toBe(40000);
      expect((await report(a.agent_conversation_id, 2, 9000)).status).toBe(200);
      const denied = await report(b.agent_conversation_id, 2, 1000);
      expect(denied.status).toBe(429);
      expect(denied.headers.get('Retry-After')).not.toBeNull();
      expect(BudgetResponseSchema.parse(await denied.json()).allocation).toMatchObject({
        status: 'denied',
        reason: 'hourly_limit',
      });
      expect((await report(a.agent_conversation_id, 3, 0)).status).toBe(429);
      expect(await limiter.getIntervalUsage(`user:${owner.id}`)).toBe(50000);
      const keys = await redis.keys(`${config.cacheKeyPrefix}course-agent-usage:*`);
      expect(keys).toHaveLength(1);
      expect(await redis.pttl(keys[0])).toBeGreaterThan(0);
      const other = await createConversation(otherOwner);
      expect((await report(other.agent_conversation_id, 1, 0)).status).toBe(200);
      const nextHour = Math.floor(Date.now() / 3_600_000) * 3_600_000 + 3_600_000;
      const now = vi.spyOn(Date, 'now').mockReturnValue(nextHour);
      try {
        const renewed = await report(a.agent_conversation_id, 4, 0);
        expect(renewed.status).toBe(200);
        expect(BudgetResponseSchema.parse(await renewed.json()).allocation).toEqual({
          status: 'granted',
          grantedMilliDollars: 3000,
          expiresAt: new Date(nextHour + 3_600_000).toISOString(),
        });
        expect(await limiter.getIntervalUsage(`user:${owner.id}`)).toBe(0);
      } finally {
        now.mockRestore();
      }
    } finally {
      await limiter.close();
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
