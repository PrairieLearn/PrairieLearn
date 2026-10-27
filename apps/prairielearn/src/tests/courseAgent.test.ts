import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Octokit } from '@octokit/rest';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  type BudgetRequest,
  BudgetResponseSchema,
  type PendingReview,
  ReviewDecisionSchema,
  emptyUsage,
} from '@prairielearn/course-agent-types';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  insertCourseAgentConversation,
  selectOptionalCourseAgentConversation,
} from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import * as github from '../lib/github.js';
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
const sql = loadSqlEquiv(import.meta.url);

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
    if (request.url?.endsWith('/pending-review/decision')) {
      const decision = ReviewDecisionSchema.parse(JSON.parse(body));
      if (pendingReview?.callId !== decision.callId || pendingReview.status !== 'pending') {
        response.statusCode = 409;
        response.end('{}');
        return;
      }
      pendingReview = {
        ...pendingReview,
        status: 'running',
        jobSequenceId: decision.decision === 'approved' ? decision.jobSequenceId : null,
      };
      response.end(JSON.stringify({ decisionRecorded: true }));
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
    await execute(sql.clear_budget_requests);
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
      allocation: { status: 'denied', reason: 'not_allowed', retryAt: null },
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
  });

  test('serializes grants across conversations competing for the same hourly allowance', async () => {
    const initial = await createConversation(owner);
    const report = (agentId: string, sequence: number) =>
      fetch(`${siteUrl}/pl/api/course-agent/conversations/${agentId}/usage`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence, usageDelta: emptyUsage(), requestCredit: true }),
      });
    for (let sequence = 1; sequence <= 16; sequence++) {
      expect((await report(initial.agent_conversation_id, sequence)).status).toBe(200);
    }
    const a = await createConversation(owner);
    const b = await createConversation(owner);
    const results = await Promise.all([
      report(a.agent_conversation_id, 1),
      report(b.agent_conversation_id, 1),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
    const bodies = await Promise.all(
      results.map(async (result) => BudgetResponseSchema.parse(await result.json())),
    );
    expect(bodies.find((body) => body.allocation.status === 'granted')!.allocation).toMatchObject({
      grantedMilliDollars: 2000,
    });
    expect(bodies.find((body) => body.allocation.status === 'denied')!.allocation).toMatchObject({
      reason: 'hourly_limit',
    });
    expect(
      results.find((result) => result.status === 429)!.headers.get('Retry-After'),
    ).not.toBeNull();
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
      await expect(
        createClient(owner).courseAgent.getPendingReview.query({
          conversationId: others.id,
          callId: 'other-call',
        }),
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
  test('publishes the reviewed files through GitHub, preserves sync errors, and exposes the saved outcome after a failed callback', async () => {
    const original = await selectCourseById('1');
    const dir = await mkdtemp(path.join(tmpdir(), 'course-agent-publication-'));
    const source = path.join(dir, 'source');
    const remote = path.join(dir, 'remote.git');
    const checkout = path.join(dir, 'checkout');
    const repository = 'https://github.com/PrairieLearn/test-course.git';
    const oldGitConfig = process.env.GIT_CONFIG_GLOBAL;
    const git = (args: string[], cwd = dir) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    let publications = 0;
    const publicationInputs: unknown[] = [];
    let api: ReturnType<typeof createServer> | undefined;
    try {
      git(['init', '--quiet', '--initial-branch=master', source]);
      git(['config', 'user.name', 'Test'], source);
      git(['config', 'user.email', 'test@example.com'], source);
      const originalContents = await readFile(path.join(original.path, 'infoCourse.json'));
      await writeFile(path.join(source, 'infoCourse.json'), originalContents);
      git(['add', '.'], source);
      git(['commit', '--quiet', '-m', 'base'], source);
      const baseCommit = git(['rev-parse', 'HEAD'], source);
      const blobSha = git(['rev-parse', 'HEAD:infoCourse.json'], source);
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
      api = createServer(async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (request.url?.startsWith('/repos/PrairieLearn/test-course/git/trees/')) {
          response.end(
            JSON.stringify({
              truncated: false,
              tree: [
                {
                  path: 'infoCourse.json',
                  type: 'blob',
                  mode: '100644',
                  sha: blobSha,
                  size: originalContents.length,
                },
              ],
            }),
          );
        } else if (request.url?.includes('/git/blobs/')) {
          response.end(
            JSON.stringify({ content: originalContents.toString('base64'), encoding: 'base64' }),
          );
        } else if (request.url?.endsWith('/branches/master')) {
          response.end(JSON.stringify({ commit: { sha: git(['rev-parse', 'master'], remote) } }));
        } else if (request.url === '/graphql') {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(chunk);
          const input = JSON.parse(Buffer.concat(chunks).toString()).variables.input;
          publicationInputs.push(input);
          await writeFile(
            path.join(source, 'infoCourse.json'),
            Buffer.from(input.fileChanges.additions[0].contents, 'base64'),
          );
          git(['add', '.'], source);
          git(['commit', '--quiet', '-m', input.message.headline], source);
          git(['push', '--quiet', remote, 'master'], source);
          publications++;
          response.end(
            JSON.stringify({
              data: {
                createCommitOnBranch: { commit: { oid: git(['rev-parse', 'HEAD'], source) } },
              },
            }),
          );
        } else {
          response.statusCode = 404;
          response.end('{}');
        }
      });
      api.listen(0, '127.0.0.1');
      await once(api, 'listening');
      const address = api.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a GitHub fixture TCP address');
      }
      vi.spyOn(github, 'getGithubClient').mockReturnValue(
        new Octokit({ auth: 'github-test-token', baseUrl: `http://127.0.0.1:${address.port}` }),
      );
      const conversation = await createConversation(owner);
      const snapshot = {
        repository: 'PrairieLearn/test-course',
        branch: 'master',
        baseCommit,
        additions: [
          { path: 'infoCourse.json', contents: Buffer.from('{ invalid JSON').toString('base64') },
        ],
        deletions: [],
      };
      pendingReview = {
        callId: 'native-review',
        card: { messageId: 'assistant', partId: 'native-review' },
        snapshot,
        status: 'pending',
        jobSequenceId: null,
        error: null,
      };
      await withUser(owner, async () => {
        const client = createClient(owner);
        const displayed = (await client.courseAgent.getPendingReview.query({
          conversationId: conversation.id,
          callId: 'native-review',
        }))!;
        expect(displayed.diff.patch).toContain('invalid JSON');
        pendingReview = { ...pendingReview!, callId: 'different-call' };
        await expect(
          client.courseAgent.postReviewDecision.mutate({
            conversationId: conversation.id,
            reviewToken: displayed.reviewToken,
            decision: 'approved',
          }),
        ).rejects.toThrow();
        expect(publications).toBe(0);
        pendingReview = { ...pendingReview, callId: 'native-review' };
        failDelivery = true;
        const approved = await client.courseAgent.postReviewDecision.mutate({
          conversationId: conversation.id,
          reviewToken: displayed.reviewToken,
          decision: 'approved',
        });
        expect(
          await client.courseAgent.postReviewDecision.mutate({
            conversationId: conversation.id,
            reviewToken: displayed.reviewToken,
            decision: 'approved',
          }),
        ).toEqual(approved);
        await expect(
          client.courseAgent.postReviewDecision.mutate({
            conversationId: conversation.id,
            reviewToken: displayed.reviewToken,
            decision: 'denied',
          }),
        ).rejects.toThrow('This review already has a different decision.');
        await helperServer.waitForJobSequence(approved.jobSequenceId!);
        const [job] = await selectJobsByJobSequenceId(approved.jobSequenceId!);
        expect(job.status).toBe('Error');
        expect(job.data.result.publication.status).toBe('published');
        expect(job.data.result.sync.status).toBe('failed');
        expect(job.data.result.sync.error).toContain('infoCourse.json');
        expect(job.data.result.sync.error).toContain('JSON');
        const published = git(['rev-parse', 'master'], remote);
        expect(published).toBe(job.data.result.publication.commitSha);
        const outcomeUrl = `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/jobs/${approved.jobSequenceId}/outcome`;
        expect((await fetch(outcomeUrl)).status).toBe(401);
        const recovered = await fetch(outcomeUrl, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({
          callId: 'native-review',
          status: 'completed',
          result: job.data.result,
        });
        const unrelated = await createConversation(owner);
        const unrelatedUrl = outcomeUrl.replace(
          conversation.agent_conversation_id,
          unrelated.agent_conversation_id,
        );
        expect(
          (await fetch(unrelatedUrl, { headers: { Authorization: 'Bearer test-token' } })).status,
        ).toBe(404);
        const input = publicationInputs[0] as {
          expectedHeadOid: string;
          branch: unknown;
          fileChanges: unknown;
        };
        expect(input.expectedHeadOid).toBe(baseCommit);
        expect(input.branch).toEqual({
          repositoryNameWithOwner: 'PrairieLearn/test-course',
          branchName: 'master',
        });
        expect(input.fileChanges).toEqual({
          additions: [
            {
              path: 'infoCourse.json',
              contents: Buffer.from('{ invalid JSON').toString('base64'),
            },
          ],
          deletions: [],
        });
        expect(publications).toBe(1);
        failDelivery = false;
        const staleConversation = await createConversation(owner);
        pendingReview = {
          callId: 'stale-head-review',
          card: { messageId: 'stale-card', partId: 'stale-head-review' },
          snapshot,
          status: 'pending',
          jobSequenceId: null,
          error: null,
        };
        const stale = (await client.courseAgent.getPendingReview.query({
          conversationId: staleConversation.id,
          callId: 'stale-head-review',
        }))!;
        const staleApproval = await client.courseAgent.postReviewDecision.mutate({
          conversationId: staleConversation.id,
          reviewToken: stale.reviewToken,
          decision: 'approved',
        });
        await helperServer.waitForJobSequence(staleApproval.jobSequenceId!);
        const [rejected] = await selectJobsByJobSequenceId(staleApproval.jobSequenceId!);
        expect(rejected.data.result.publication.status).toBe('failed');
        expect(rejected.data.result.sync.status).toBe('not_attempted');
        expect(publications).toBe(1);
      });
    } finally {
      vi.restoreAllMocks();
      if (api) {
        await new Promise<void>((resolve, reject) =>
          api!.close((error) => (error ? reject(error) : resolve())),
        );
      }
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
