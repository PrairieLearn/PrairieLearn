import { once } from 'node:events';
import { type IncomingMessage, createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { io } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
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
  let owner: User;
  let otherOwner: User;
  const originalConfig = {
    isEnterprise: config.isEnterprise,
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
    features: config.features,
  };

  // Enterprise routes must be mounted before starting the test server.
  beforeAll(() => {
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'https://course-agent.invalid',
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
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });
  afterAll(helperServer.after);
  afterAll(() => Object.assign(config, originalConfig));

  test('rejects API and history access when the feature is disabled', async () => {
    const conversation = await createConversation(owner);
    await withUser(owner, () =>
      withConfig({ features: { 'course-agent': false } }, async () => {
        await expect(createClient(owner).courseAgent.list.query()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        expect((await fetch(historyUrl(conversation.id))).status).toBe(403);
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
