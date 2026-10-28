import { once } from 'node:events';
import { createServer } from 'node:http';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  type BudgetRequest,
  BudgetResponseSchema,
  emptyUsage,
} from '@prairielearn/course-agent-types';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { RedisRateLimiter } from '../lib/redis-rate-limiter.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { updateCourseColumn } from '../models/course.js';
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
  const serviceConversationId = crypto.randomUUID();
  const serviceRequests: { path: string; body: unknown; authorization: string | undefined }[] = [];
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    serviceRequests.push({
      path: request.url!,
      body: body ? JSON.parse(body) : null,
      authorization: request.headers.authorization,
    });
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = request.url === '/conversations' ? 201 : 200;
    response.end(
      JSON.stringify(
        request.url === '/conversations' ? { id: serviceConversationId } : { recovered: true },
      ),
    );
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

  // Enterprise routes must be mounted before starting the test server.
  beforeAll(async () => {
    service.listen(0, '127.0.0.1');
    await once(service, 'listening');
    const address = service.address();
    if (!address || typeof address === 'string') throw new Error('Expected a service TCP address');
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: `http://127.0.0.1:${address.port}`,
      courseAgentServiceToken: 'test-token',
      features: { ...config.features, 'course-agent': true },
    });
  });
  beforeAll(helperServer.before());
  beforeAll(async () => {
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

  test('records usage and credit once across retries, and preserves final usage after access revocation', async () => {
    const conversation = await createConversation(owner);
    const url = `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/usage`;
    const report = (body: BudgetRequest, token = 'test-token') =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const request: BudgetRequest = {
      sequence: 1,
      usageDelta: { ...emptyUsage(), inputTokens: 10000, outputTokens: 2000, costMilliDollars: 40 },
      requestCredit: true,
    };
    expect((await report(request, 'wrong')).status).toBe(401);
    const accepted = await report(request);
    expect(accepted.status).toBe(200);
    const first = BudgetResponseSchema.parse(await accepted.json());
    expect(first.allocation).toMatchObject({ status: 'granted', grantedMilliDollars: 3000 });
    expect(await (await report(request)).json()).toEqual(first);
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
    });
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    const final = {
      sequence: 2,
      usageDelta: { ...emptyUsage(), outputTokens: 500, costMilliDollars: 10 },
      requestCredit: true,
    };
    const denied = await report(final);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      sequence: 2,
      allocation: { status: 'denied', reason: 'not_allowed' },
    });
    expect(
      (
        await report({
          sequence: 3,
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
    expect(saved).toMatchObject({ usage_output_tokens: 2500, usage_cost_milli_dollars: 55 });
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
      sequence: number,
      costMilliDollars: number,
      requestCredit = true,
    ) =>
      fetch(`${siteUrl}/pl/api/course-agent/conversations/${agentId}/usage`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence,
          usageDelta: { ...emptyUsage(), costMilliDollars },
          requestCredit,
        }),
      });
    try {
      const a = await createConversation(owner);
      const b = await createConversation(owner);
      expect((await report(a.agent_conversation_id, 1, 40000, false)).status).toBe(200);
      expect((await report(a.agent_conversation_id, 1, 40000, false)).status).toBe(200);
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

  test('lists the current user’s conversations without exposing another owner’s', async () => {
    const own = await createConversation(owner);
    const others = await createConversation(otherOwner);
    await withUser(owner, async () => {
      const ids = (await createClient(owner).courseAgent.list.query()).map((c) => c.id);
      expect(ids).toContain(own.id);
      expect(ids).not.toContain(others.id);
    });
  });

  test('rejects reading another owner’s conversation', async () => {
    const others = await createConversation(otherOwner);
    await withUser(owner, async () => {
      expect((await fetch(historyUrl(others.id))).status).toBe(404);
    });
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
    const conversation = await withUser(owner, () =>
      createClient(owner).courseAgent.create.mutate({ text: 'First message' }),
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
    await withUser(owner, async () => {
      const client = createClient(owner);
      const before = await client.courseAgent.list.query();
      await expect(
        client.courseAgent.create.mutate({ text: 'First message' }),
      ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
      });
      expect(await client.courseAgent.list.query()).toEqual(before);
    });
    expect(serviceRequests).toEqual([]);
  });

  test('admits recovery only for the authenticated creator', async () => {
    const own = await createConversation(owner);
    const other = await createConversation(otherOwner);
    await withUser(owner, async () => {
      const client = createClient(owner);
      await expect(
        client.courseAgent.resume.mutate({ conversationId: other.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect(await client.courseAgent.resume.mutate({ conversationId: own.id })).toEqual({
        recovered: true,
      });
    });
    expect(serviceRequests).toEqual([
      {
        path: `/conversations/${own.agent_conversation_id}/resume`,
        body: null,
        authorization: 'Bearer test-token',
      },
    ]);
  });
});
