import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { type PendingReview, reviewRevision } from '@prairielearn/course-agent-types';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { retryReviewDeliveries } from '../ee/lib/course-agent/review.js';
import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
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
  });
}

function historyUrl(conversationId: string) {
  return `${siteUrl}/pl/course/1/course_agent/conversations/${conversationId}/get-messages`;
}

describe('Course agent access and conversation privacy', () => {
  const serviceConversationId = crypto.randomUUID();
  const serviceRequests: { path: string; body: unknown; authorization: string | undefined }[] = [];
  let pendingReview: PendingReview | null = null;
  let failDelivery = false;
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
    if (request.url?.endsWith('/pending-review')) {
      response.end(JSON.stringify(pendingReview));
      return;
    }
    if (request.url?.endsWith('/pending-review/outcome')) {
      response.statusCode = failDelivery ? 503 : 200;
      response.end(JSON.stringify(failDelivery ? { error: 'Offline' } : { outcomeRecorded: true }));
      return;
    }
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
    serviceRequests.length = 0;
    pendingReview = null;
    failDelivery = false;
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
      await expect(
        createClient(owner).courseAgent.getPendingReview.query({ conversationId: others.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      await expect(
        createClient(owner).courseAgent.postReviewDecision.mutate({
          conversationId: others.id,
          reviewToken: 'forged',
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
  });

  test('rejects changing another owner’s conversation title', async () => {
    const conversation = await createConversation(otherOwner);
    await withUser(owner, async () => {
      await expect(
        createClient(owner).courseAgent.setTitle.mutate({
          conversationId: conversation.id,
          text: 'Someone else',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
    const stored = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: otherOwner.id,
    });
    expect(stored!.title).toBe(conversation.title);
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
      createClient(owner).courseAgent.create.mutate(),
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
      await expect(client.courseAgent.create.mutate()).rejects.toMatchObject({
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

  test('preserves the first-message title after a follow-up', async () => {
    const conversation = await createConversation(owner);
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
    });
    const stored = await selectOptionalCourseAgentConversation({
      id: conversation.id,
      course_id: '1',
      user_id: owner.id,
    });
    expect(stored!.title).toBe('First message');
  });
  test('binds approval to the displayed revision, preserves published commits on real sync errors, and retries only outcome delivery', async () => {
    const original = await selectCourseById('1');
    const dir = await mkdtemp(path.join(tmpdir(), 'course-agent-publication-'));
    const source = path.join(dir, 'source');
    const remote = path.join(dir, 'remote.git');
    const checkout = path.join(dir, 'checkout');
    const repository = 'https://github.com/PrairieLearn/test-course.git';
    const oldGitConfig = process.env.GIT_CONFIG_GLOBAL;
    const git = (args: string[], cwd = dir) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const sql = loadSqlEquiv(import.meta.url);
    try {
      git(['init', '--quiet', '--initial-branch=master', source]);
      git(['config', 'user.name', 'Test'], source);
      git(['config', 'user.email', 'test@example.com'], source);
      await writeFile(
        path.join(source, 'infoCourse.json'),
        await readFile(path.join(original.path, 'infoCourse.json')),
      );
      git(['add', '.'], source);
      git(['commit', '--quiet', '-m', 'base'], source);
      const baseCommit = git(['rev-parse', 'HEAD'], source);
      git(['clone', '--quiet', '--bare', source, remote]);
      git(['clone', '--quiet', remote, checkout]);
      const gitConfig = path.join(dir, 'gitconfig');
      await writeFile(gitConfig, `[url "${remote}"]\n  insteadOf = ${repository}\n`);
      process.env.GIT_CONFIG_GLOBAL = gitConfig;
      await execute(sql.set_review_course, {
        course_id: original.id,
        repository,
        branch: 'master',
        path: checkout,
      });
      await writeFile(path.join(source, 'infoCourse.json'), '{ invalid JSON');
      const patch = git(['diff', '--binary', '--full-index'], source) + '\n';
      const conversation = await createConversation(owner);
      pendingReview = {
        callId: 'native-review',
        card: { messageId: 'assistant', partId: 'native-review' },
        revision: await reviewRevision(baseCommit, patch),
        repository: 'PrairieLearn/test-course',
        branch: 'master',
        baseCommit,
        patch,
      };
      await withUser(owner, async () => {
        const client = createClient(owner);
        const displayed = (await client.courseAgent.getPendingReview.query({
          conversationId: conversation.id,
        }))!;
        expect(displayed.diff.patch).toContain('invalid JSON');
        pendingReview = { ...pendingReview!, revision: 'f'.repeat(64) };
        await expect(
          client.courseAgent.postReviewDecision.mutate({
            conversationId: conversation.id,
            reviewToken: displayed.reviewToken,
            decision: 'approved',
          }),
        ).rejects.toThrow();
        expect(git(['rev-parse', 'master'], remote)).toBe(baseCommit);
        pendingReview = { ...pendingReview, revision: await reviewRevision(baseCommit, patch) };
        failDelivery = true;
        const approved = await client.courseAgent.postReviewDecision.mutate({
          conversationId: conversation.id,
          reviewToken: displayed.reviewToken,
          decision: 'approved',
        });
        await helperServer.waitForJobSequence(approved.jobSequenceId!);
        const [job] = await selectJobsByJobSequenceId(approved.jobSequenceId!);
        expect(job.status).toBe('Error');
        const outcome = job.data.outcome;
        expect(outcome.result.publication.status).toBe('published');
        expect(outcome.result.sync.status).toBe('failed');
        expect(outcome.result.sync.error).toContain('infoCourse.json');
        expect(outcome.result.sync.error).toContain('JSON');
        const published = git(['rev-parse', 'master'], remote);
        expect(published).toBe(outcome.result.publication.commitSha);
        failDelivery = false;
        await retryReviewDeliveries();
        expect(git(['rev-parse', 'master'], remote)).toBe(published);
        expect(
          (await selectJobsByJobSequenceId(approved.jobSequenceId!))[0].data.callbackDelivered,
        ).toBe(true);
        expect(
          serviceRequests.filter((request) => request.path.endsWith('/outcome')).at(-1)!.body,
        ).toEqual(outcome);
        const staleConversation = await createConversation(owner);
        pendingReview = {
          ...pendingReview,
          callId: 'stale-head-review',
          card: { messageId: 'stale-card', partId: 'stale-head-review' },
        };
        const stale = (await client.courseAgent.getPendingReview.query({
          conversationId: staleConversation.id,
        }))!;
        const staleApproval = await client.courseAgent.postReviewDecision.mutate({
          conversationId: staleConversation.id,
          reviewToken: stale.reviewToken,
          decision: 'approved',
        });
        await helperServer.waitForJobSequence(staleApproval.jobSequenceId!);
        const [rejected] = await selectJobsByJobSequenceId(staleApproval.jobSequenceId!);
        expect(rejected.data.outcome.result.publication.status).toBe('failed');
        expect(rejected.data.outcome.result.sync.status).toBe('not_attempted');
        expect(git(['rev-parse', 'master'], remote)).toBe(published);
      });
    } finally {
      if (oldGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = oldGitConfig;
      await execute(sql.set_review_course, {
        course_id: original.id,
        repository: original.repository,
        branch: original.branch,
        path: original.path,
      });
      await rm(dir, { recursive: true, force: true });
    }
  });
});
