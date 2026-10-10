import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';

import { serviceHeaders } from '@prairielearn/course-agent-contract';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { closeAgentAccounting, getAgentAccounting } from '../ee/lib/course-agent/accounting.js';
import api from '../ee/lib/course-agent/api.js';
import { ConfigSchema, config } from '../lib/config.js';
import { createConversation, selectConversation } from '../models/course-agent-conversation.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { updateCourseColumn } from '../models/course.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(new URL('courseAgent.test.sql', import.meta.url).href);
beforeAll(helperServer.before());
afterAll(helperServer.after);
it('authenticates scope and settles the original receipt after owner access is revoked', async () => {
  const settings = ConfigSchema.shape.courseAgent.parse({
    workerUrl: 'http://localhost:8791',
    serviceToken: 'local-fixture-service-token-not-a-secret',
    accountingEpoch: randomUUID(),
  })!;
  const prefix = 'course-agent-api-test:' + randomUUID() + ':';
  const user = await selectOrInsertUserByUid('course-agent-api-' + randomUUID() + '@example.com');
  const { id: courseId } = await queryRow(sql.course, z.object({ id: z.string() }));
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  await updateCourseColumn({
    courseId,
    columnName: 'repository',
    value: 'https://github.com/org/course',
    authnUserId: user.id,
  });
  await updateCourseColumn({ courseId, columnName: 'branch', value: 'main', authnUserId: user.id });
  const actor = { course_id: courseId, user_id: user.id, authn_user_id: user.id };
  const conversation = await createConversation(actor, {
    title: 'API test',
    repository: 'org/course',
    branch: 'main',
  });
  const scope = {
    conversationId: conversation.external_id,
    courseId,
    userId: user.id,
    authnUserId: user.id,
  };
  const app = express();
  app.use('/pl/api/course-automation/v1', api);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const redis = new Redis<'legacy'>('redis://localhost:6379');
  const key = prefix + 'course-agent:ledger';
  await redis.hset(
    key,
    'epoch',
    settings.accountingEpoch,
    'server_run_id',
    /run_id:(\w+)/.exec(await redis.info('server'))![1],
  );

  async function call(path: string, body: unknown, override = scope) {
    const route = '/pl/api/course-automation/v1' + path,
      json = JSON.stringify(body);
    return fetch(origin + route, {
      method: 'POST',
      headers: await serviceHeaders(settings.serviceToken, 'pl-api', 'POST', route, override, {
        body: json,
      }),
      body: json,
    });
  }
  try {
    await withConfig(
      {
        isEnterprise: true,
        courseAgent: settings,
        cacheKeyPrefix: prefix,
        nonVolatileRedisUrl: 'redis://localhost:6379',
        githubClientToken: 'fixture-no-network',
        features: { 'course-agent': true },
        costPerMillionTokens: {
          ...config.costPerMillionTokens,
          'gpt-6-astra': { input: 1, cachedInput: 0.5, cacheWrite: 1, output: 1 },
        },
      },
      async () => {
        const unsigned = await fetch(origin + '/pl/api/course-automation/v1/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        expect(unsigned.status).toBe(401);
        const route = '/pl/api/course-automation/v1/permissions';
        const malformed = await fetch(origin + route, {
          method: 'POST',
          headers: await serviceHeaders(settings.serviceToken, 'pl-api', 'POST', route, scope, {
            body: '{',
          }),
          body: '{',
        });
        expect(malformed.status).toBe(400);
        expect(await malformed.json()).toMatchObject({ code: 'invalid_json', retryable: false });
        expect((await call('/permissions', {}, { ...scope, userId: '999999' })).status).toBe(404);
        expect(await (await call('/context-status', {})).json()).toEqual({ status: 'present' });
        expect(
          await (
            await call('/context-status', {}, { ...scope, conversationId: randomUUID() })
          ).json(),
        ).toEqual({ status: 'absent' });
        const actionId = randomUUID();
        const grantResponse = await call('/execution/authorize', {
          actionId,
          commandId: actionId,
          createdAt: Date.now(),
        });
        expect(grantResponse.status).toBe(200);
        const grant = await grantResponse.json();
        const reservation = {
          modelRequestId: randomUUID(),
          actionId,
          capacityGrantId: grant.id,
          requestDigest: 'a'.repeat(64),
          model: 'gpt-6-astra',
          inputTokenUpperBound: 100,
          requestedMaxOutputTokens: 100,
          createdAt: Date.now(),
        };
        const reserve = await call('/model/reserve', reservation);
        expect(reserve.status).toBe(200);
        const funded = await reserve.json();
        expect(
          (await call('/model/reserve', { ...reservation, requestDigest: 'b'.repeat(64) })).status,
        ).toBe(409);
        await updateCoursePermissionsRole({
          course_id: courseId,
          user_id: user.id,
          course_role: 'None',
          authn_user_id: user.id,
        });
        expect((await call('/permissions', {})).status).toBe(403);
        expect(await (await call('/model/reserve', reservation)).json()).toEqual(funded);
        const settlement = {
          kind: 'measured',
          reservationId: funded.reservationId,
          responseId: 'fixture-response',
          usage: { input: 100, cached: 0, cacheWrite: 0, output: 25 },
        };
        expect((await call('/model/settle', settlement)).status).toBe(200);
        expect((await call('/model/settle', settlement)).status).toBe(200);
        expect((await call('/model/settle', { ...settlement, responseId: 'changed' })).status).toBe(
          409,
        );
        expect((await call('/execution/release', { actionId, grantId: grant.id })).status).toBe(
          200,
        );
        const state = z
          .object({ hours: z.record(z.string(), z.number()) })
          .parse(await getAgentAccounting().status(scope));
        expect(Object.values(state.hours)).toEqual([125]);
        const finishedAt = Date.now();
        expect((await call('/conversations/finished', { finishedAt })).status).toBe(200);
        expect((await call('/conversations/finished', { finishedAt: finishedAt - 1 })).status).toBe(
          200,
        );
        expect((await selectConversation(actor, conversation.id)).last_finished_at?.getTime()).toBe(
          finishedAt,
        );
      },
    );
  } finally {
    await closeAgentAccounting();
    await redis.del(key);
    await redis.quit();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
