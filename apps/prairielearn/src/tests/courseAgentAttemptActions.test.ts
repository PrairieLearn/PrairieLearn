import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, assert, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { DateFromISOString } from '@prairielearn/zod';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import {
  deleteCourseInstancePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperExam from './helperExam.js';
import * as helperServer from './helperServer.js';
import { withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';
const EXAM = { course_instance_short_name: 'Sp15', assessment_tid: 'exam1-automaticTestSuite' };

const locals: Record<string, any> = {};

/** Requests each test course attempt action as the course agent, then decides it as the instructor. */
describe('Course agent attempt actions', { timeout: 60_000, concurrent: false }, () => {
  /** Results PrairieLearn delivered to the course agent service, by request ID. */
  const delivered = new Map<string, Record<string, any>>();
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const id = /\/reviews\/([^/]+)\/outcome$/.exec(request.url!)?.[1];
    if (id) delivered.set(id, JSON.parse(Buffer.concat(chunks).toString()));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ outcomeRecorded: true }));
  });
  let owner: User;
  let conversation: CourseAgentConversation;
  let attemptId: string;
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
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before()();
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    service.close();
    await once(service, 'close');
  });
  afterAll(() => Object.assign(config, originalConfig));

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  const actionsUrl = () => `${locals.siteUrl}/pl/course/1/course_agent/actions`;
  const headers = () => ({
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    'X-Course-Agent-Conversation': conversation.agent_conversation_id,
    'Content-Type': 'application/json',
  });

  async function request(action: string, input: Record<string, unknown>) {
    const id = crypto.randomUUID();
    const response = await fetch(`${actionsUrl()}/${action}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id, input: { ...EXAM, ...input } }),
    });
    return { id, status: response.status, body: (await response.json()) as Record<string, any> };
  }

  /** Requests an action, approves it as the instructor, and returns the result the agent receives. */
  async function approve(action: string, input: Record<string, unknown>) {
    const requested = await request(action, input);
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    await withUser(owner, async () => {
      const client = createCourseTrpcClient({
        courseId: '1',
        urlBase: locals.siteUrl,
        csrfToken: generatePrefixCsrfToken(
          { url: '/pl/course/1/trpc', authn_user_id: owner.id },
          config.secretKey,
        ),
      });
      await client.courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: requested.id,
        decision: 'approved',
      });
    });
    // An action that runs as a job delivers its result once the job finishes.
    await vi.waitFor(() => expect(delivered.has(requested.id)).toBe(true), { timeout: 30_000 });
    return { card: requested.body.card, result: delivered.get(requested.id)! };
  }

  const attempt = () =>
    queryRow(
      sql.select_assessment_instance,
      { assessment_instance_id: attemptId },
      z.object({
        open: z.boolean().nullable(),
        date_limit: DateFromISOString.nullable(),
        score_perc: z.number().nullable(),
        points: z.number().nullable(),
      }),
    );

  const minutesLeft = async () => {
    const { date_limit } = await attempt();
    return date_limit === null ? null : (date_limit.getTime() - Date.now()) / 60_000;
  };

  test('needs student data access in the course instance, which being an owner does not give', async () => {
    owner = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'owner@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    conversation = await insertCourseAgentConversation({
      course_id: '1',
      user_id: owner.id,
      agent_conversation_id: crypto.randomUUID(),
      title: 'Test conversation',
    });
    attemptId = z.string().parse(locals.assessment_instance.id);
    const refused = await request('assessment_instances_reopen', {
      assessment_instance_ids: [attemptId],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain('Student Data Editor access to the course instance');

    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: owner.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '1',
    });
    expect(
      (await request('assessment_instances_close', { assessment_instance_ids: [attemptId] }))
        .status,
    ).toBe(400);
    await deleteCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: owner.id,
      authn_user_id: '1',
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: owner.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
  });

  test('requests that name the wrong place or attempt explain why', async () => {
    const ids = { assessment_instance_ids: [attemptId] };
    const cases = [
      [{ ...ids, course_instance_short_name: 'Fa99' }, 'no course instance named "Fa99"'],
      [{ ...ids, assessment_tid: 'missing' }, 'no assessment named "missing"'],
      [{ assessment_instance_ids: ['999999'] }, 'no attempt with ID 999999'],
      [{ assessment_instance_ids: [] }, 'assessment_instance_ids'],
    ] as const;
    for (const [input, message] of cases) {
      const refused = await request('assessment_instances_close', input);
      assert.equal(refused.status, 400, message);
      expect(refused.body.message).toContain(message);
    }
    // An attempt of another assessment in the same course instance is not this assessment's.
    const other = await request('assessment_instances_close', {
      ...ids,
      assessment_tid: 'hw1-automaticTestSuite',
    });
    expect(other.status).toBe(400);
    expect(other.body.message).toContain(`no attempt with ID ${attemptId}`);
    const noMinutes = await request('assessment_instances_set_time_limit', {
      ...ids,
      change: 'add_minutes',
    });
    expect(noMinutes.body.message).toContain('needs minutes');
    expect((await attempt()).open).toBe(true);
  });

  test('sets, extends, and removes a time limit on an open attempt', async () => {
    const ids = { assessment_instance_ids: [attemptId] };
    expect(await minutesLeft()).toBeNull();
    const set = await approve('assessment_instances_set_time_limit', {
      ...ids,
      change: 'set_remaining_minutes',
      minutes: 30,
    });
    expect(set.card).toMatchObject({
      title: 'Set the time left to 30 minutes on 1 attempt',
      context: expect.stringContaining('Sp15'),
      rows: [{ label: 'dev@example.com', detail: 'Now: Open (no time limit)' }],
      undo: expect.any(String),
    });
    expect(set.result).toMatchObject({
      decision: 'approved',
      outcome: { status: 'succeeded', summary: 'Changed the time limit on 1 attempt.' },
    });
    expect(await minutesLeft()).toBeCloseTo(30, 0);

    const added = await approve('assessment_instances_set_time_limit', {
      ...ids,
      change: 'add_minutes',
      minutes: 10,
    });
    expect(added.card.title).toBe('Add 10 minutes to 1 attempt');
    expect(added.card.rows[0].detail).toMatch(/^Now: (29|30) min$/);
    expect(await minutesLeft()).toBeCloseTo(40, 0);

    await approve('assessment_instances_set_time_limit', {
      ...ids,
      change: 'subtract_minutes',
      minutes: 15,
    });
    expect(await minutesLeft()).toBeCloseTo(25, 0);

    await approve('assessment_instances_set_time_limit', { ...ids, change: 'remove_limit' });
    expect(await attempt()).toMatchObject({ open: true, date_limit: null });
  });

  test('overrides the total score by percentage and by points', async () => {
    const byPercent = await approve('assessment_instances_set_score', {
      assessment_instance_id: attemptId,
      set: 'score_perc',
      value: 50,
    });
    expect(byPercent.card).toMatchObject({
      title: 'Set the total score to 50%',
      rows: [{ label: 'dev@example.com', detail: expect.stringMatching(/^Now: 0\.0% \(0 of /) }],
    });
    expect((await attempt()).score_perc).toBe(50);

    const byPoints = await approve('assessment_instances_set_score', {
      assessment_instance_id: attemptId,
      set: 'points',
      value: 7,
    });
    expect(byPoints.result.outcome.summary).toBe('Set the total of dev@example.com to 7 points.');
    expect((await attempt()).points).toBe(7);
  });

  test('closes an open attempt with a grading job, then reopens it', async () => {
    const ids = { assessment_instance_ids: [attemptId] };
    const alreadyOpen = await request('assessment_instances_reopen', ids);
    expect(alreadyOpen.body.message).toContain('already open');

    const closed = await approve('assessment_instances_close', ids);
    expect(closed.card).toMatchObject({
      title: 'Grade and close 1 attempt',
      rows: [{ label: 'dev@example.com', detail: 'Now: Open (no time limit)' }],
    });
    // The result is the grading job's own log.
    expect(closed.result).toMatchObject({ decision: 'approved', outcome: { status: 'succeeded' } });
    expect((await attempt()).open).toBe(false);

    // A closed attempt keeps its time limit unless asked to reopen.
    const stillClosed = await request('assessment_instances_set_time_limit', {
      ...ids,
      change: 'set_remaining_minutes',
      minutes: 5,
    });
    expect(stillClosed.status).toBe(400);
    expect(stillClosed.body.message).toContain('reopen_closed');
    expect((await request('assessment_instances_close', ids)).body.message).toContain(
      'already closed',
    );

    const reopened = await approve('assessment_instances_reopen', ids);
    expect(reopened.card.title).toBe('Reopen 1 attempt');
    expect(reopened.result.outcome).toEqual({
      status: 'succeeded',
      summary: 'Reopened 1 attempt.',
    });
    expect(await attempt()).toMatchObject({ open: true, date_limit: null });

    await approve('assessment_instances_close', ids);
    const reopenedWithLimit = await approve('assessment_instances_set_time_limit', {
      ...ids,
      change: 'set_remaining_minutes',
      minutes: 20,
      reopen_closed: true,
    });
    expect(reopenedWithLimit.card.rows).toEqual([
      { label: 'dev@example.com', detail: 'Closed, will reopen' },
    ]);
    expect((await attempt()).open).toBe(true);
    expect(await minutesLeft()).toBeCloseTo(20, 0);
  });
});
