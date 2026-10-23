import { type IncomingHttpHeaders, createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';

import fetchCookie from 'fetch-cookie';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;
let agentServiceUrl: string;
const coursePageUrl = `${siteUrl}/pl/course/1/course_admin/settings`;
const courseInstancePageUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`;

const userMessage = (text: string) => ({
  id: `msg-${text}`,
  role: 'user',
  parts: [{ type: 'text', text }],
});

const assistantMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Hello!' }],
};

function upgradeStatus(url: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request(url, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from('test-handshake!!').toString('base64'),
      },
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on('upgrade', (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on('error', reject);
    req.end();
  });
}

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

describe('Course agent', () => {
  let owner: User;
  let otherOwner: User;
  const agentFetch = vi.fn<typeof fetch>();
  const proxied: { url: string | undefined; headers: IncomingHttpHeaders }[] = [];
  const service = createServer((req, res) => {
    proxied.push({ url: req.url, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([userMessage('Hi'), assistantMessage]));
  });
  beforeAll(async () => {
    await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve));
    agentServiceUrl = `http://127.0.0.1:${(service.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    service.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      service.close((err) => (err ? reject(err) : resolve())),
    );
  });

  // The course agent's routes are mounted only on Enterprise Edition servers.
  const originalIsEnterprise = config.isEnterprise;
  beforeAll(() => (config.isEnterprise = true));
  afterAll(() => (config.isEnterprise = originalIsEnterprise));
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
    const previous = {
      courseAgentServiceUrl: config.courseAgentServiceUrl,
      courseAgentServiceToken: config.courseAgentServiceToken,
      features: config.features,
    };
    Object.assign(config, {
      courseAgentServiceUrl: agentServiceUrl,
      courseAgentServiceToken: 'service-token',
      features: { ...config.features, 'course-agent': true },
    });
    proxied.length = 0;
    agentFetch.mockReset().mockRejectedValue(new Error('Unexpected course agent request'));
    const realFetch = fetch;
    // Only requests to the agent service are faked; requests to PL stay real.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return url.origin === agentServiceUrl ? agentFetch(input, init) : realFetch(input, init);
    });
    return () => {
      fetchSpy.mockRestore();
      Object.assign(config, previous);
    };
  });
  afterAll(helperServer.after);

  describe('access', () => {
    test('is unavailable when the feature flag is off', async () => {
      await withUser(owner, () =>
        withConfig({ features: { 'course-agent': false } }, async () => {
          await expect(createClient(owner).courseAgent.list.query()).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
          });
          const conversation = await insertCourseAgentConversation({
            agent_conversation_id: crypto.randomUUID(),
            course_id: '1',
            user_id: owner.id,
          });
          expect(
            (
              await fetch(
                `${siteUrl}/pl/course/1/course_agent/conversations/${conversation.id}/get-messages`,
              )
            ).status,
          ).toBe(403);
          const page = await fetchCheerio(coursePageUrl);
          expect(page.$('.course-agent-panel').length).toBe(0);
        }),
      );
      expect(agentFetch).not.toHaveBeenCalled();
    });

    test('renders the panel for owners on course and course instance pages', async () => {
      await withUser(owner, async () => {
        for (const url of [coursePageUrl, courseInstancePageUrl]) {
          const page = await fetchCheerio(url);
          expect(page.ok).toBe(true);
          expect(page.$('.course-agent-panel').length).toBe(1);
        }
      });
    });

    test('is unavailable to non-owners', async () => {
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
        const page = await fetchCheerio(coursePageUrl);
        expect(page.$('.course-agent-panel').length).toBe(0);
      });
    });

    test('requires a valid CSRF token', async () => {
      await withUser(owner, async () => {
        await expect(
          createClient(owner, 'invalid').courseAgent.create.mutate(),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        const { id } = await insertCourseAgentConversation({
          course_id: '1',
          user_id: owner.id,
          agent_conversation_id: crypto.randomUUID(),
        });
        expect(
          await upgradeStatus(
            `${siteUrl}/pl/course/1/course_agent/conversations/${id}?csrfToken=invalid`,
          ),
        ).toBe(403);
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });
  });

  describe('conversations', () => {
    test('creates conversations in Cloudflare and stores the returned IDs in its catalog', async () => {
      const serviceIds = [crypto.randomUUID(), crypto.randomUUID()];
      agentFetch
        .mockResolvedValueOnce(Response.json({ id: serviceIds[0] }, { status: 201 }))
        .mockResolvedValueOnce(Response.json({ id: serviceIds[1] }, { status: 201 }));
      await withUser(owner, async () => {
        const client = createClient(owner);
        const first = await client.courseAgent.create.mutate();
        const second = await client.courseAgent.create.mutate();
        for (const [index, record] of [first, second].entries()) {
          const stored = await selectOptionalCourseAgentConversation({
            id: record.id,
            course_id: '1',
            user_id: owner.id,
          });
          expect(stored?.agent_conversation_id).toBe(serviceIds[index]);
        }
        expect(first).toEqual({
          id: first.id,
          title: 'New conversation',
          created_at: expect.any(Date),
        });

        const ids = (await client.courseAgent.list.query()).map((c) => c.id);
        expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      });
      expect(agentFetch).toHaveBeenCalledTimes(2);
      for (const [url, init] of agentFetch.mock.calls) {
        expect(String(url)).toBe(`${agentServiceUrl}/conversations`);
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer service-token' });
      }
    });

    test('does not add a catalog entry when Cloudflare creation fails', async () => {
      agentFetch.mockResolvedValueOnce(new Response('Internal error', { status: 500 }));
      await withUser(owner, async () => {
        const client = createClient(owner);
        const before = await client.courseAgent.list.query();
        await expect(client.courseAgent.create.mutate()).rejects.toThrow(
          'Could not create the course agent conversation',
        );
        expect(await client.courseAgent.list.query()).toEqual(before);
      });
    });

    test('rejects unknown catalog IDs before contacting Cloudflare', async () => {
      await withUser(owner, async () => {
        expect(
          (await fetch(`${siteUrl}/pl/course/1/course_agent/conversations/999999999/get-messages`))
            .status,
        ).toBe(404);
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });

    test('lists only the current user’s conversations', async () => {
      const others = await insertCourseAgentConversation({
        agent_conversation_id: crypto.randomUUID(),
        course_id: '1',
        user_id: otherOwner.id,
      });
      await withUser(owner, async () => {
        const ids = (await createClient(owner).courseAgent.list.query()).map((c) => c.id);
        expect(ids).not.toContain(others.id);
      });
    });

    test('proxies SDK history with service credentials and PL-owned context', async () => {
      const conversation = await insertCourseAgentConversation({
        agent_conversation_id: crypto.randomUUID(),
        course_id: '1',
        user_id: owner.id,
      });
      await withUser(owner, async () => {
        const response = await fetch(
          `${siteUrl}/pl/course/1/course_agent/conversations/${conversation.id}/get-messages`,
          {
            headers: {
              Cookie: 'browser-only=private',
              Authorization: 'untrusted',
              'X-PL-Course-Context': 'spoofed',
            },
          },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([userMessage('Hi'), assistantMessage]);
      });
      expect(proxied).toHaveLength(1);
      expect(proxied[0].url).toBe(
        `/conversations/${conversation.agent_conversation_id}/get-messages`,
      );
      expect(proxied[0].headers.authorization).toBe('Bearer service-token');
      expect(proxied[0].headers.cookie).toBeUndefined();
      expect(proxied[0].headers['x-pl-user-id']).toBe(owner.id);
      expect(JSON.parse(String(proxied[0].headers['x-pl-course-context']))).toEqual({
        courseTitle: expect.any(String),
        courseShortName: expect.any(String),
      });
    });

    test('hides other users’ conversations', async () => {
      const others = await insertCourseAgentConversation({
        agent_conversation_id: crypto.randomUUID(),
        course_id: '1',
        user_id: otherOwner.id,
      });
      await withUser(owner, async () => {
        expect(
          (
            await fetch(
              `${siteUrl}/pl/course/1/course_agent/conversations/${others.id}/get-messages`,
            )
          ).status,
        ).toBe(404);
        const token = generatePrefixCsrfToken(
          { url: '/pl/course/1/course_agent', authn_user_id: owner.id },
          config.secretKey,
        );
        expect(
          await upgradeStatus(
            `${siteUrl}/pl/course/1/course_agent/conversations/${others.id}?csrfToken=${token}`,
          ),
        ).toBe(404);
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });
  });

  test('sets the first-message title through an owner-scoped, CSRF-protected mutation', async () => {
    const conversation = await insertCourseAgentConversation({
      agent_conversation_id: crypto.randomUUID(),
      course_id: '1',
      user_id: owner.id,
    });
    await withUser(owner, async () => {
      const client = createClient(owner);
      await client.courseAgent.setTitle.mutate({
        conversationId: conversation.id,
        text: 'First message',
      });
      await client.courseAgent.setTitle.mutate({
        conversationId: conversation.id,
        text: 'Follow-up',
      });
      expect(
        (
          await selectOptionalCourseAgentConversation({
            id: conversation.id,
            course_id: '1',
            user_id: owner.id,
          })
        )?.title,
      ).toBe('First message');
      await expect(
        createClient(owner, 'invalid').courseAgent.setTitle.mutate({
          conversationId: conversation.id,
          text: 'Forged',
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
    await withUser(otherOwner, async () => {
      await expect(
        createClient(otherOwner).courseAgent.setTitle.mutate({
          conversationId: conversation.id,
          text: 'Someone else',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
  });

  test('remembers whether the panel is open', async () => {
    const cookieFetch = fetchCookie(fetch);
    await withUser(owner, async () => {
      const panelOpen = async () => {
        const response = await cookieFetch(coursePageUrl);
        return (await response.text()).includes('data-open="true"');
      };
      expect(await panelOpen()).toBe(false);
      const response = await cookieFetch(`${siteUrl}/pl/course_agent/panel_settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: true }),
      });
      expect(response.status).toBe(204);
      expect(await panelOpen()).toBe(true);
    });
  });
});
