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
const agentServiceUrl = 'http://course-agent.test';
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

const SSE_BODY = [
  { type: 'start' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Hello!' },
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
]
  .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  .join('')
  .concat('data: [DONE]\n\n');

function uiMessageStreamResponse(body: string | ReadableStream<Uint8Array>) {
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
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

function postChat(
  user: User,
  conversationId: string,
  text: string,
  { csrfToken, signal }: { csrfToken?: string; signal?: AbortSignal } = {},
) {
  return fetch(`${siteUrl}/pl/course/1/course_agent/conversations/${conversationId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token':
        csrfToken ??
        generatePrefixCsrfToken(
          { url: '/pl/course/1/course_agent', authn_user_id: user.id },
          config.secretKey,
        ),
    },
    body: JSON.stringify({ message: userMessage(text) }),
    signal,
  });
}

describe('Course agent', () => {
  let owner: User;
  let otherOwner: User;
  const agentFetch = vi.fn<typeof fetch>();

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
            course_id: '1',
            user_id: owner.id,
          });
          expect((await postChat(owner, conversation.id, 'Hi')).status).toBe(403);
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
        const { id } = await createClient(owner).courseAgent.create.mutate();
        expect((await postChat(owner, id, 'Hi', { csrfToken: 'invalid' })).status).toBe(403);
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });
  });

  describe('conversations', () => {
    test('creates and lists conversations without calling the agent service', async () => {
      await withUser(owner, async () => {
        const client = createClient(owner);
        const first = await client.courseAgent.create.mutate();
        const second = await client.courseAgent.create.mutate();
        expect(first).toEqual({
          id: first.id,
          title: 'New conversation',
          created_at: expect.any(Date),
        });

        const ids = (await client.courseAgent.list.query()).map((c) => c.id);
        expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });

    test('lists only the current user’s conversations', async () => {
      const others = await insertCourseAgentConversation({
        course_id: '1',
        user_id: otherOwner.id,
      });
      await withUser(owner, async () => {
        const ids = (await createClient(owner).courseAgent.list.query()).map((c) => c.id);
        expect(ids).not.toContain(others.id);
      });
    });

    test('loads history from the agent service', async () => {
      const conversation = await insertCourseAgentConversation({
        course_id: '1',
        user_id: owner.id,
      });
      agentFetch.mockResolvedValueOnce(Response.json([userMessage('Hi'), assistantMessage]));
      await withUser(owner, async () => {
        const messages = await createClient(owner).courseAgent.messages.query({
          conversationId: conversation.id,
        });
        expect(messages.map((m) => m.id)).toEqual(['msg-Hi', 'assistant-1']);
      });
      const [url, init] = agentFetch.mock.calls[0];
      expect(String(url)).toBe(
        `${agentServiceUrl}/conversations/${conversation.agent_conversation_id}/messages`,
      );
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer service-token' });
    });

    test('hides other users’ conversations', async () => {
      const others = await insertCourseAgentConversation({
        course_id: '1',
        user_id: otherOwner.id,
      });
      await withUser(owner, async () => {
        await expect(
          createClient(owner).courseAgent.messages.query({ conversationId: others.id }),
        ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
        expect((await postChat(owner, others.id, 'Hi')).status).toBe(404);
      });
      expect(agentFetch).not.toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    test('relays the reply stream and sets the title from the first message', async () => {
      const conversation = await insertCourseAgentConversation({
        course_id: '1',
        user_id: owner.id,
      });
      agentFetch.mockImplementation(async () => uiMessageStreamResponse(SSE_BODY));

      await withUser(owner, async () => {
        const response = await postChat(owner, conversation.id, 'How do I add a question?');
        expect(response.status).toBe(200);
        expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
        expect(await response.text()).toBe(SSE_BODY);

        await (await postChat(owner, conversation.id, 'A follow-up')).text();
      });

      const [url, init] = agentFetch.mock.calls[0];
      expect(String(url)).toBe(
        `${agentServiceUrl}/conversations/${conversation.agent_conversation_id}/chat`,
      );
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer service-token' });
      expect(JSON.parse(init?.body as string)).toEqual({
        message: userMessage('How do I add a question?'),
        context: { courseTitle: expect.any(String), courseShortName: expect.any(String) },
      });

      const updated = await selectOptionalCourseAgentConversation({
        id: conversation.id,
        course_id: '1',
        user_id: owner.id,
      });
      // The first message sets the title; later messages don't change it.
      expect(updated?.title).toBe('How do I add a question?');
    });

    test.each([
      { upstreamStatus: 409, status: 409 },
      { upstreamStatus: 500, status: 502 },
    ])('maps an upstream $upstreamStatus to $status', async ({ upstreamStatus, status }) => {
      const conversation = await insertCourseAgentConversation({
        course_id: '1',
        user_id: owner.id,
      });
      agentFetch.mockResolvedValueOnce(
        new Response('Error: internal stack trace', { status: upstreamStatus }),
      );
      await withUser(owner, async () => {
        const response = await postChat(owner, conversation.id, 'Hi');
        expect(response.status).toBe(status);
        expect(await response.text()).not.toContain('stack trace');
      });
    });

    test('stopping the request cancels the agent service request', async () => {
      const conversation = await insertCourseAgentConversation({
        course_id: '1',
        user_id: owner.id,
      });
      let upstreamSignal: AbortSignal | undefined;
      agentFetch.mockImplementationOnce(async (_input, init) => {
        upstreamSignal = init?.signal ?? undefined;
        const encoder = new TextEncoder();
        // A reply that never finishes on its own.
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
          },
        });
        return uiMessageStreamResponse(body);
      });

      await withUser(owner, async () => {
        const abort = new AbortController();
        const response = await postChat(owner, conversation.id, 'Hi', { signal: abort.signal });
        const reader = response.body!.getReader();
        await reader.read();
        abort.abort();
      });
      await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true));
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
