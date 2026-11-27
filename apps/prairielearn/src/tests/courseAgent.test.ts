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
  PageCatalogSchema,
  UsageDecisionSchema,
  type UsageReport,
  emptyUsage,
} from '@prairielearn/course-agent-types';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';

import { buildPageCatalog } from '../ee/lib/course-agent/pages.js';
import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { selectCourseAgentConversationUsage } from '../ee/models/course-agent-usage-report.js';
import { updateCourseAgentUserDefaultApprovalMode } from '../ee/models/course-agent-user-settings.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { selectCourseById, updateCourseColumn } from '../models/course.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    approval_mode: 'approval_required',
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
    if (request.url!.endsWith('/thumbnail')) {
      response.setHeader('Content-Type', 'image/png');
      response.end(PNG);
      return;
    }
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
    await updateCourseAgentUserDefaultApprovalMode({
      user_id: owner.id,
      course_id: '1',
      default_approval_mode: 'approval_required',
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

  test('records each report once and prices it', async () => {
    const conversation = await createConversation(owner);
    const agentId = conversation.agent_conversation_id;
    // A report that only asks for a decision records nothing.
    expect(await decision(await report(agentId, usageReport()))).toEqual({ status: 'allowed' });
    const first: UsageReport = {
      reportId: crypto.randomUUID(),
      model: 'gpt-6-luna',
      usage: {
        ...emptyUsage(),
        inputTokens: 10_000,
        cachedInputTokens: 6000,
        cacheWriteInputTokens: 2000,
        outputTokens: 2000,
        webSearchCalls: 3,
      },
    };
    expect((await report(agentId, first, 'wrong')).status).toBe(401);
    // A Worker still sending the second configured token is accepted during rotation.
    expect(await decision(await report(agentId, first, 'next-token'))).toEqual({
      status: 'allowed',
    });
    // A retry after a lost reply is answered again without counting the usage twice.
    expect(await decision(await report(agentId, first))).toEqual({ status: 'allowed' });
    expect((await report(agentId, { ...usageReport(), model: 'unpriced' })).status).toBe(400);
    expect((await report(crypto.randomUUID(), usageReport())).status).toBe(404);
    // gpt-6-luna: 2000 uncached, 6000 cached and 2000 cache-write input tokens plus 2000 output
    // tokens is $0.00151, and three web searches at $0.01 each add $0.03.
    const usage = await selectCourseAgentConversationUsage(conversation.id);
    expect(usage).toEqual({
      input_tokens: 10_000,
      input_tokens_cache_read: 6000,
      input_tokens_cache_write: 2000,
      output_tokens: 2000,
      output_tokens_reasoning: 0,
      web_search_calls: 3,
      cost: expect.any(Number),
    });
    expect(usage.cost).toBeCloseTo(0.03151, 8);
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
      status: 'limited',
      retryAt: new Date(hourStart + 3_600_000).toISOString(),
    });
    expect(await decision(await report(b, usageReport()))).toMatchObject({ status: 'limited' });
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

  test("changes only the caller's own conversation's approval mode, and remembers it", async () => {
    const own = await createConversation(owner);
    const other = await createConversation(otherOwner);
    await withUser(owner, async () => {
      const client = createClient(owner);
      await expect(
        client.courseAgent.setApprovalMode.mutate({
          conversationId: other.id,
          approvalMode: 'always_approve',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect(
        await client.courseAgent.setApprovalMode.mutate({
          conversationId: own.id,
          approvalMode: 'always_approve',
        }),
      ).toMatchObject({ id: own.id, approval_mode: 'always_approve' });
      expect(await client.courseAgent.defaultApprovalMode.query()).toBe('always_approve');
    });
    const stored = await Promise.all(
      [own, other].map((conversation) =>
        selectOptionalCourseAgentConversation({
          id: conversation.id,
          course_id: '1',
          user_id: conversation.user_id,
        }),
      ),
    );
    expect(stored.map((conversation) => conversation?.approval_mode)).toEqual([
      'always_approve',
      'approval_required',
    ]);
    expect(serviceRequests).toEqual([]);
  });

  test("answers a review report from the agent service with the conversation's mode", async () => {
    const conversation = await createConversation(owner);
    const reportReview = (token = 'test-token') =>
      fetch(
        `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/reviews`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewId: crypto.randomUUID() }),
        },
      );
    expect((await reportReview('wrong')).status).toBe(401);
    const response = await reportReview();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ autoApproved: false });
    expect(serviceRequests).toEqual([]);
  });

  test('downloads a sent file, and displays an image preview', async () => {
    const conversation = await createConversation(owner);
    const uploadUrl = `${siteUrl}/pl/course/1/course_agent/conversations/${conversation.id}/uploads/${crypto.randomUUID()}`;
    await withUser(owner, async () => {
      // The fake service answers with JSON, which PrairieLearn must not serve as a page.
      const download = await fetch(uploadUrl);
      expect(download.status).toBe(200);
      expect(download.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(download.headers.get('Content-Disposition')).toBe('attachment');
      expect(download.headers.get('Content-Security-Policy')).toContain('sandbox');
      expect(download.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(download.headers.get('Cache-Control')).toBe('no-store');

      const preview = await fetch(`${uploadUrl}/thumbnail`);
      expect(preview.headers.get('Content-Type')).toBe('image/png');
      expect(preview.headers.get('Content-Disposition')).toBe('inline');
      expect(preview.headers.get('Cache-Control')).toBe('no-store');
      expect(Buffer.from(await preview.arrayBuffer())).toEqual(PNG);

      // Express decodes %2F into the param, so only the ID check keeps it from changing the path.
      serviceRequests.length = 0;
      const escape = await fetch(
        `${siteUrl}/pl/course/1/course_agent/conversations/${conversation.id}/uploads/x%2F..%2Fresume`,
      );
      expect(escape.status).toBe(400);
      expect(serviceRequests).toEqual([]);
    });
  });

  test('binds creation to the authorized course repository and branch, in the chosen mode', async () => {
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
        createClient(owner).courseAgent.create.mutate({
          text: 'First message',
          approvalMode: 'always_approve',
        }),
      ),
    );
    expect(serviceRequests).toEqual([
      {
        path: '/conversations',
        body: {
          repository: 'PrairieLearn/test-course',
          branch: 'pilot-edits',
          pages: expect.arrayContaining([expect.objectContaining({ key: 'assessment.settings' })]),
        },
        authorization: 'Bearer test-token',
      },
    ]);
    const stored = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: owner.id,
    });
    expect(stored).toMatchObject({
      agent_conversation_id: serviceConversationId,
      approval_mode: 'always_approve',
    });
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
          client.courseAgent.create.mutate({
            text: 'First message',
            approvalMode: 'approval_required',
          }),
        ).rejects.toMatchObject({
          data: { code: 'BAD_REQUEST' },
        });
        expect(await client.courseAgent.list.query()).toEqual(before);
      }),
    );
    expect(serviceRequests).toEqual([]);
  });

  // The catalog reuses the navigation's untyped URL builders and visibility conditions, so load
  // what they produce: a page offered to the agent must exist for this course.
  test('resolves every catalog page for the course agent, and explains a wrong name', async () => {
    const { agent_conversation_id } = await createConversation(owner);
    const credentials = {
      Authorization: 'Bearer test-token',
      'X-Course-Agent-Conversation': agent_conversation_id,
    };
    const resolve = (
      target: { page: string; params: Record<string, string> },
      { headers = credentials, path = '/course/1/agent_navigation' } = {},
    ) =>
      fetch(`${siteUrl}/pl/api/v1${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
    const names: Record<string, string> = {
      courseInstance: 'Sp15',
      assessment: 'hw1-automaticTestSuite',
      question: 'addNumbers',
    };
    const catalog = buildPageCatalog({
      course: await selectCourseById('1'),
      authz_data: {
        has_course_permission_own: true,
        has_course_permission_edit: true,
        has_course_permission_view: true,
        has_course_permission_preview: true,
      },
    });
    // Conversation creation rejects a catalog outside the schema's limits.
    PageCatalogSchema.parse(catalog);
    const missing: string[] = [];
    for (const page of catalog) {
      const params = page.params.filter((param) => param.required);
      const response = await resolve({
        page: page.key,
        params: Object.fromEntries(params.map((param) => [param.name, names[param.name]])),
      });
      const { url } = (await response.json()) as { url: string };
      const { status } = await withUser(owner, () => fetch(`${siteUrl}${url}`));
      if (status === 404 || status >= 500) missing.push(`${page.key}: ${status}`);
    }
    expect(missing).toEqual([]);

    const wrong = await resolve({
      page: 'assessment.settings',
      params: { courseInstance: 'Sp15', assessment: 'hw99' },
    });
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toMatchObject({ message: 'No assessment named "hw99".' });

    // The service's credentials reach only the conversation's course's navigation.
    const settings = {
      page: 'assessment.settings',
      params: { courseInstance: 'Sp15', assessment: 'hw1-automaticTestSuite' },
    };
    const refused = await Promise.all([
      resolve(settings, { headers: { ...credentials, Authorization: 'Bearer wrong' } }),
      resolve(settings, {
        headers: { ...credentials, 'X-Course-Agent-Conversation': crypto.randomUUID() },
      }),
      resolve(settings, { path: '/course/2/agent_navigation' }),
      resolve(settings, { path: '/course/1/sync' }),
    ]);
    expect(refused.map((response) => response.status)).toEqual([401, 403, 403, 403]);
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
          createClient(owner).courseAgent.create.mutate({
            text: 'Read my local changes',
            approvalMode: 'approval_required',
          }),
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
