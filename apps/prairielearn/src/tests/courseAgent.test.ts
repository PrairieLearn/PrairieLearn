import fetchCookie from 'fetch-cookie';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { EventSchema } from '@prairielearn/course-agent-protocol';
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
import { CourseAgentTestService } from './utils/course-agent-service.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const coursePageUrl = `${siteUrl}/pl/course/1/course_admin/settings`;
const courseInstancePageUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`;

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

async function eventReader(id: string) {
  const abort = new AbortController();
  const response = await fetch(`${siteUrl}/pl/course/1/course-agent/conversations/${id}/events`, {
    signal: abort.signal,
  });
  expect(response.status).toBe(200);
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  return {
    close: () => {
      abort.abort();
      void reader.cancel().catch(() => {});
    },
    async next() {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (data) return EventSchema.parse(JSON.parse(data.slice(6)));
        } else {
          const result = await reader.read();
          if (result.done) throw new Error('Event stream closed');
          buffer += result.value;
        }
      }
    },
  };
}

describe('Course agent', () => {
  const service = new CourseAgentTestService();
  let owner: User;
  let otherOwner: User;
  const previous = { isEnterprise: config.isEnterprise };
  beforeAll(async () => {
    config.isEnterprise = true;
    await service.start();
  });
  beforeAll(helperServer.before());
  beforeAll(async () => {
    owner = await getOrCreateUser({ uid: 'owner@example.com', name: 'Course Owner', uin: 'owner' });
    otherOwner = await getOrCreateUser({
      uid: 'other-owner@example.com',
      name: 'Other Owner',
      uin: 'other',
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
    config.courseAgentServiceUrl = service.url;
    config.courseAgentServiceToken = 'test-service-token';
    config.features = { ...config.features, 'course-agent': true };
    service.failCreation = false;
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    await service.close();
    config.isEnterprise = previous.isEnterprise;
  });

  test('renders the panel for owners on course and course-instance pages', async () => {
    await withUser(owner, async () => {
      for (const url of [coursePageUrl, courseInstancePageUrl]) {
        expect((await fetchCheerio(url)).$('.course-agent-panel').length).toBe(1);
      }
    });
  });
  test('keeps catalog listing local and private to the authenticated user', async () => {
    await withUser(owner, async () => {
      const client = createClient(owner);
      const record = await client.courseAgent.create.mutate();
      const stored = await selectOptionalCourseAgentConversation({
        id: record.id,
        course_id: '1',
        user_id: owner.id,
      });
      expect(service.conversations.has(stored!.agent_conversation_id)).toBe(true);
      expect(record).not.toHaveProperty('agent_conversation_id');
      const others = await insertCourseAgentConversation({
        course_id: '1',
        user_id: otherOwner.id,
        agent_conversation_id: service.create(),
      });
      const calls = service.authorizations.length;
      const list = await client.courseAgent.list.query();
      expect(list.map((item) => item.id)).toContain(record.id);
      expect(list.map((item) => item.id)).not.toContain(others.id);
      expect(service.authorizations).toHaveLength(calls);
    });
  });
  test('does not insert a catalog row when service creation fails', async () => {
    service.failCreation = true;
    await withUser(owner, async () => {
      const client = createClient(owner);
      const before = await client.courseAgent.list.query();
      await expect(client.courseAgent.create.mutate()).rejects.toThrow('Could not create');
      expect(await client.courseAgent.list.query()).toEqual(before);
    });
  });
  test('requires CSRF for commands and rejects unknown catalog IDs before reaching the service', async () => {
    await withUser(owner, async () => {
      const before = service.commands.length;
      await expect(
        createClient(owner, 'invalid').courseAgent.send.mutate({
          conversationId: '99999999',
          text: 'Hi',
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        createClient(owner).courseAgent.send.mutate({ conversationId: '99999999', text: 'Hi' }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect(
        (await fetch(`${siteUrl}/pl/course/1/course-agent/conversations/99999999/events`)).status,
      ).toBe(404);
      expect(service.commands).toHaveLength(before);
    });
  });
  test('checks every catalog ID in an activity subscription before opening service sockets', async () => {
    const others = await insertCourseAgentConversation({
      course_id: '1',
      user_id: otherOwner.id,
      agent_conversation_id: service.create(),
    });
    await withUser(owner, async () => {
      const own = await createClient(owner).courseAgent.create.mutate();
      const before = service.commands.length;
      const response = await fetch(
        `${siteUrl}/pl/course/1/course-agent/activity?ids=${own.id},${others.id}`,
      );
      expect(response.status).toBe(404);
      expect(service.commands).toHaveLength(before);
      await expect(
        createClient(owner).courseAgent.get.query({ conversationId: others.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
  });
  test('blocks non-owners and feature-disabled users from commands and observation', async () => {
    await withUser(owner, () =>
      withConfig({ features: { 'course-agent': false } }, async () => {
        await expect(createClient(owner).courseAgent.list.query()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        expect(
          (await fetch(`${siteUrl}/pl/course/1/course-agent/conversations/1/events`)).status,
        ).toBe(403);
      }),
    );
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
      expect((await fetchCheerio(coursePageUrl)).$('.course-agent-panel').length).toBe(0);
    });
  });
  test('uses distinct command and observation sockets, streams output, and records the first accepted title', async () => {
    await withUser(owner, async () => {
      const client = createClient(owner);
      const record = await client.courseAgent.create.mutate();
      const stored = (await selectOptionalCourseAgentConversation({
        id: record.id,
        course_id: '1',
        user_id: owner.id,
      }))!;
      const events = await eventReader(record.id);
      try {
        expect((await events.next()).event).toBe('conversation.snapshot');
        await client.courseAgent.send.mutate({
          conversationId: record.id,
          text: '  First question  ',
        });
        service.advance(stored.agent_conversation_id, 'Hello');
        service.finish(stored.agent_conversation_id);
        let event = await events.next();
        while (event.event !== 'turn.finished') event = await events.next();
        const snapshot = await client.courseAgent.get.query({ conversationId: record.id });
        expect(snapshot.messages.at(-1)?.parts[0].text).toBe('Hello');
        expect(snapshot.summary.capabilities.send).toBe(true);
        expect(
          (await client.courseAgent.list.query()).find((item) => item.id === record.id)?.title,
        ).toBe('First question');
        expect(
          service.authorizations.every((header) => header === 'Bearer test-service-token'),
        ).toBe(true);
      } finally {
        events.close();
      }
    });
  });
  test('does not retry a send when the acknowledgement is lost', async () => {
    await withUser(owner, async () => {
      const client = createClient(owner);
      const record = await client.courseAgent.create.mutate();
      const stored = (await selectOptionalCourseAgentConversation({
        id: record.id,
        course_id: '1',
        user_id: owner.id,
      }))!;
      service.dropNextAcknowledgement = true;
      await expect(
        client.courseAgent.send.mutate({ conversationId: record.id, text: 'Only once' }),
      ).rejects.toThrow('uncertain');
      const snapshot = await client.courseAgent.get.query({ conversationId: record.id });
      expect(snapshot.messages).toHaveLength(1);
      expect(
        service.commands.filter(
          (entry) =>
            entry.id === stored.agent_conversation_id && entry.command.method === 'turn.start',
        ),
      ).toHaveLength(1);
      service.finish(stored.agent_conversation_id);
    });
  });
  test('remembers whether the panel is open', async () => {
    const cookieFetch = fetchCookie(fetch);
    await withUser(owner, async () => {
      const panelOpen = async () =>
        (await (await cookieFetch(coursePageUrl)).text()).includes('data-open="true"');
      expect(await panelOpen()).toBe(false);
      expect(
        (
          await cookieFetch(`${siteUrl}/pl/course_agent/panel_settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ open: true }),
          })
        ).status,
      ).toBe(204);
      expect(await panelOpen()).toBe(true);
    });
  });
});
