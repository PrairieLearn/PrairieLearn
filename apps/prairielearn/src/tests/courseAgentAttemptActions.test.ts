import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  queryScalar,
  queryScalars,
} from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import { parseLocalDateTime } from '../lib/timezones.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';

import * as helperExam from './helperExam.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';
const EXAM = { course_instance_short_name: 'Sp15', assessment_tid: 'exam1-automaticTestSuite' };

const locals: Record<string, any> = {};

describe('Course agent attempt actions', { timeout: 60_000 }, () => {
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
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'http://course-agent.test',
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before()();
  });
  afterAll(helperServer.after);
  afterAll(() => Object.assign(config, originalConfig));

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  async function run(name: string, input: Record<string, unknown>) {
    const response = await fetch(`${locals.siteUrl}/pl/course/1/course_agent/actions/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        'X-Course-Agent-Conversation': conversation.agent_conversation_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: crypto.randomUUID(), input: { ...EXAM, ...input } }),
    });
    return {
      status: response.status,
      body: z.record(z.string(), z.string()).parse(await response.json()),
    };
  }

  async function succeeds(name: string, input: Record<string, unknown>) {
    const { status, body } = await run(name, input);
    assert.equal(status, 200, body.message);
    return body.summary;
  }

  async function refusal(name: string, input: Record<string, unknown>) {
    const { status, body } = await run(name, input);
    assert.equal(status, 400, body.summary);
    return body.message;
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

  const questions = () =>
    queryRows(
      sql.select_instance_questions,
      { assessment_instance_id: attemptId },
      z.object({
        id: IdSchema,
        points: z.number().nullable(),
        auto_points: z.number().nullable(),
        manual_points: z.number().nullable(),
        assigned_grader: IdSchema.nullable(),
      }),
    );

  test('needs Student Data Editor access, which being a course owner does not give', async () => {
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
    attemptId = IdSchema.parse(locals.assessment_instance.id);

    expect(
      await refusal('assessment_instances_set_score', {
        assessment_instance_id: attemptId,
        score_perc: 50,
      }),
    ).toContain('Student Data Editor access in the course instance');
    expect((await attempt()).score_perc).toBe(0);

    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: owner.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
  });

  test('refuses IDs from another assessment, changing nothing', async () => {
    const [question] = await questions();
    const otherAssessment = { assessment_tid: 'hw1-automaticTestSuite' };
    expect(
      await refusal('assessment_instances_set_time_limit', {
        ...otherAssessment,
        assessment_instance_ids: [attemptId],
        change: 'set_remaining_minutes',
        minutes: 30,
      }),
    ).toContain(`has no attempt with ID ${attemptId}`);
    expect(
      await refusal('instance_questions_set_score', {
        ...otherAssessment,
        instance_question_id: question.id,
        points: 1,
      }),
    ).toContain(`has no question in an attempt with ID ${question.id}`);
    expect(await attempt()).toMatchObject({ open: true, date_limit: null });
    expect((await questions())[0].points).toBe(question.points);
  });

  test('sets, extends, and removes the time limit, and reopens a closed attempt', async () => {
    const ids = { assessment_instance_ids: [attemptId] };
    expect(
      await refusal('assessment_instances_set_time_limit', {
        ...ids,
        change: 'add_minutes',
        minutes: 5,
      }),
    ).toContain('no time limit to add to');

    expect(
      await succeeds('assessment_instances_set_time_limit', {
        ...ids,
        change: 'set_remaining_minutes',
        minutes: 30,
      }),
    ).toBe('Changed the time limit on 1 attempt.');
    expect(await minutesLeft()).toBeCloseTo(30, 0);
    await succeeds('assessment_instances_set_time_limit', {
      ...ids,
      change: 'add_minutes',
      minutes: 10,
    });
    expect(await minutesLeft()).toBeCloseTo(40, 0);
    await succeeds('assessment_instances_set_time_limit', {
      ...ids,
      change: 'subtract_minutes',
      minutes: 15,
    });
    expect(await minutesLeft()).toBeCloseTo(25, 0);

    const { display_timezone } = await selectCourseInstanceById('1');
    await succeeds('assessment_instances_set_time_limit', {
      ...ids,
      change: 'set_closing_time',
      closing_time: '2099-01-01T12:00',
    });
    expect((await attempt()).date_limit).toEqual(
      parseLocalDateTime('2099-01-01T12:00:00', display_timezone),
    );

    await execute(sql.close_assessment_instance, { assessment_instance_id: attemptId });
    expect(
      await refusal('assessment_instances_set_time_limit', { ...ids, change: 'remove_limit' }),
    ).toContain('Set reopen_closed');
    expect(
      await succeeds('assessment_instances_set_time_limit', {
        ...ids,
        change: 'remove_limit',
        reopen_closed: true,
      }),
    ).toBe('Changed the time limit on 1 attempt, reopening 1 that had closed.');
    expect(await attempt()).toMatchObject({ open: true, date_limit: null });
    expect(
      await queryScalar(
        sql.select_state_log_count,
        { assessment_instance_id: attemptId, auth_user_id: owner.id },
        z.number(),
      ),
    ).toBe(5);
  });

  test("sets an attempt's total score, as a percentage or as points, with score history", async () => {
    expect(
      await succeeds('assessment_instances_set_score', {
        assessment_instance_id: attemptId,
        score_perc: 50,
      }),
    ).toMatch(/^Set the attempt's total score to 50% \([\d.]+ of [\d.]+ points\), which was 0%\.$/);
    await succeeds('assessment_instances_set_score', {
      assessment_instance_id: attemptId,
      points: 7,
    });
    expect(await attempt()).toMatchObject({ points: 7 });
    const { score_perc } = await attempt();
    expect(
      await queryScalars(
        sql.select_score_logs,
        { assessment_instance_id: attemptId, auth_user_id: owner.id },
        z.number(),
      ),
    ).toEqual([50, score_perc]);
  });

  test("sets a question's score, which recalculates the attempt's total", async () => {
    const [question] = await questions();
    expect(
      await refusal('instance_questions_set_score', {
        instance_question_id: question.id,
        points: 1,
        manual_points: 1,
      }),
    ).toContain('Set the score one way');

    expect(
      await succeeds('instance_questions_set_score', {
        instance_question_id: question.id,
        points: 3,
      }),
    ).toMatch(
      /^Set the question's score to 3 of [\d.]+ points \(0 automatic, 3 manual\), which was 0\.$/,
    );
    expect((await questions())[0]).toMatchObject({ points: 3, auto_points: 0, manual_points: 3 });
    // The question's new score replaces the total set by hand, as grading on the attempt page does.
    expect((await attempt()).points).toBe(3);
    expect(
      await queryScalars(
        sql.select_question_score_logs,
        { instance_question_id: question.id, auth_user_id: owner.id },
        z.number(),
      ),
    ).toEqual([3]);

    // The question has no submission yet, so feedback cannot be kept, and nothing changes.
    expect(
      await refusal('instance_questions_set_score', {
        instance_question_id: question.id,
        points: 4,
        feedback: 'Good work.',
      }),
    ).toContain('no submission to attach feedback to');
    expect((await questions())[0].points).toBe(3);
  });

  test('assigns and removes the grader of questions', async () => {
    const [first, second] = await questions();
    const ids = { instance_question_ids: [first.id, second.id] };
    expect(
      await refusal('instance_questions_assign_grader', {
        ...ids,
        grader_uid: 'dev@example.com',
      }),
    ).toContain(`The user IDs of those who can: ${owner.id}.`);

    expect(
      await succeeds('instance_questions_assign_grader', {
        ...ids,
        grader_uid: 'owner@example.com',
      }),
    ).toBe('Assigned the grader to 2 questions.');
    expect((await questions()).slice(0, 2).map((q) => q.assigned_grader)).toEqual([
      owner.id,
      owner.id,
    ]);

    expect(
      await succeeds('instance_questions_assign_grader', {
        instance_question_ids: [first.id],
        grader_user_id: null,
      }),
    ).toBe('Removed the assigned grader from 1 question.');
    expect((await questions()).slice(0, 2).map((q) => q.assigned_grader)).toEqual([null, owner.id]);
  });
});
