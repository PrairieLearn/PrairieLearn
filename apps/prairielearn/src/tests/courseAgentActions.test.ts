import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { CourseActionCatalogSchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv, queryRow, queryScalar, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { action } from '../ee/lib/course-agent/actions/action.js';
import { COURSE_AGENT_ACTIONS } from '../ee/lib/course-agent/actions/index.js';
import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { updateIssueOpen } from '../models/issue.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const actionsUrl = `${siteUrl}/pl/course/1/course_agent/actions`;
const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';

function insertIssue({ open = true, message = 'It is broken.' } = {}) {
  return queryScalar(
    sql.insert_issue,
    { course_id: '1', open, course_caused: true, student_message: message },
    IdSchema,
  );
}

const issuesOpen = (issue_ids: string[]) =>
  queryScalars(sql.select_issues_open, { issue_ids }, z.boolean());

describe('Course agent actions', { timeout: 60_000 }, () => {
  let owner: User;
  let conversation: CourseAgentConversation;
  const originalConfig = {
    isEnterprise: config.isEnterprise,
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
    features: config.features,
  };

  beforeAll(async () => {
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'http://course-agent.test',
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before()();
    await getOrCreateUser({
      uid: 'owner@example.com',
      name: 'owner@example.com',
      uin: 'owner@example.com',
    });
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
  });
  afterAll(helperServer.after);
  afterAll(() => Object.assign(config, originalConfig));

  const headers = () => ({
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    'X-Course-Agent-Conversation': conversation.agent_conversation_id,
    'Content-Type': 'application/json',
  });

  async function run(name: string, input: unknown) {
    const response = await fetch(`${actionsUrl}/${name}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: crypto.randomUUID(), input }),
    });
    // A 500 is PrairieLearn's error page; the course agent tells the model only that it failed.
    if (response.status === 500) return { status: response.status, body: await response.text() };
    return { status: response.status, body: await response.json() };
  }

  test('every action and input says what it does', () => {
    for (const [name, action] of Object.entries(COURSE_AGENT_ACTIONS)) {
      assert.match(name, /^[a-z][a-z_]*$/);
      assert.isNotEmpty(action.description.trim(), name);
      for (const [key, field] of Object.entries(action.input.shape)) {
        assert.isNotEmpty((field as z.ZodType).description?.trim(), `${name}.${key}`);
      }
    }
  });

  test('lists the actions with the schema of each input', async () => {
    const response = await fetch(actionsUrl, { headers: headers() });
    expect(response.status).toBe(200);
    const catalog = CourseActionCatalogSchema.parse(await response.json());
    expect(Object.keys(catalog.actions)).toEqual(Object.keys(COURSE_AGENT_ACTIONS));
    expect(catalog.actions.issues_close.input).toMatchObject({
      required: ['issue_ids'],
      // IDs are serialized as strings.
      properties: { issue_ids: { type: 'array', items: { type: 'string' } } },
    });
  });

  test('closes and reopens issues as the instructor', async () => {
    const issueIds = [await insertIssue(), await insertIssue()];
    const alreadyClosed = await insertIssue({ open: false });

    expect(await run('issues_close', { issue_ids: [...issueIds, alreadyClosed] })).toEqual({
      status: 200,
      body: { summary: 'Closed 2 issues.' },
    });
    expect(await issuesOpen([...issueIds, alreadyClosed])).toEqual([false, false, false]);
    expect(
      await queryScalar(
        sql.select_issue_audit_log_count,
        { issue_ids: issueIds, authn_user_id: owner.id },
        z.number(),
      ),
    ).toBe(2);

    expect(await run('issues_reopen', { issue_ids: [issueIds[0]] })).toEqual({
      status: 200,
      body: { summary: 'Reopened 1 issue.' },
    });
    expect(await issuesOpen(issueIds)).toEqual([true, false]);
  });

  test('refuses a request it cannot carry out, with a message the agent can act on', async () => {
    const open = await insertIssue();

    const unknown = await run('issues_delete', {});
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toContain('Unknown action "issues_delete". Actions: issues_close');

    const invalid = await run('issues_close', { issue_ids: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain('issue_ids');

    // One ID the course does not have refuses the whole request.
    const missing = await run('issues_close', { issue_ids: [open, '999999'] });
    expect(missing).toEqual({
      status: 400,
      body: {
        message: 'This course has no issue with ID 999999. Find issue IDs in the issues dataset.',
      },
    });
    expect(await issuesOpen([open])).toEqual([true]);
  });

  test('an action that fails partway leaves nothing changed', async () => {
    const open = await insertIssue();
    COURSE_AGENT_ACTIONS.test_closes_then_fails = action({
      description: 'Close an issue, then fail.',
      permission: 'course_editor',
      input: z.strictObject({}),
      run: async ({ ctx }) => {
        await updateIssueOpen({
          issue_id: open,
          open: false,
          course_id: ctx.course.id,
          authn_user_id: ctx.user.id,
        });
        throw new Error('The second step failed.');
      },
    });
    try {
      expect((await run('test_closes_then_fails', {})).status).toBe(500);
    } finally {
      delete COURSE_AGENT_ACTIONS.test_closes_then_fails;
    }
    expect(await issuesOpen([open])).toEqual([true]);
  });

  test('reports an issue on a question version, as the "Report an issue" button does', async () => {
    const variantId = await queryScalar(
      sql.insert_preview_variant,
      { user_id: owner.id },
      IdSchema,
    );
    const input = { variant_id: variantId, description: 'The figure does not load.' };
    expect((await run('issues_report', { ...input, variant_id: '999999' })).body.message).toContain(
      'no question version with ID 999999',
    );

    const { status, body } = await run('issues_report', input);
    expect(status).toBe(200);
    const issueId = /^Reported issue #(\d+) on addNumbers\.$/.exec(body.summary)![1];
    expect(
      await queryRow(
        sql.select_issue,
        { issue_id: issueId },
        z.object({
          variant_id: IdSchema,
          open: z.boolean(),
          manually_reported: z.boolean(),
          course_caused: z.boolean(),
          student_message: z.string(),
          instructor_message: z.string(),
          user_id: IdSchema,
          authn_user_id: IdSchema,
        }),
      ),
    ).toEqual({
      variant_id: variantId,
      open: true,
      manually_reported: true,
      course_caused: true,
      student_message: 'The figure does not load.',
      instructor_message: 'instructor-reported issue',
      user_id: owner.id,
      authn_user_id: owner.id,
    });
  });
});
