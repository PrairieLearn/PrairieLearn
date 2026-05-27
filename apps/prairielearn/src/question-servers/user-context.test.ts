import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Course, type Question } from '../lib/db-types.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import * as helperServer from '../tests/helperServer.js';

import { buildQuestionUserContext } from './user-context.js';

function makeQuestion(
  course_id: string,
  shared = false,
): Pick<Question, 'course_id' | 'share_publicly' | 'share_source_publicly'> {
  return {
    course_id,
    share_publicly: shared,
    share_source_publicly: false,
  };
}

function makeCourse(
  id: string,
  opted_in: boolean,
): Pick<Course, 'id' | 'questions_receive_user_data'> {
  return { id, questions_receive_user_data: opted_in };
}

describe('buildQuestionUserContext', { timeout: 30_000 }, () => {
  let userId: string;

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    userId = user.id;
  });

  it('returns null user/group when course is not opted in', async () => {
    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', false),
      variantCourse: makeCourse('1', false),
      effectiveUserId: userId,
      teamId: null,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns null user/group when variant course differs from question course', async () => {
    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', true),
      variantCourse: makeCourse('2', true),
      effectiveUserId: userId,
      teamId: null,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns null user/group when no effective user is provided', async () => {
    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', true),
      variantCourse: makeCourse('1', true),
      effectiveUserId: null,
      teamId: null,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns user info when fully gated through', async () => {
    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', true),
      variantCourse: makeCourse('1', true),
      effectiveUserId: userId,
      teamId: null,
    });
    assert.isNotNull(ctx.user);
    assert.isString(ctx.user.uid);
    assert.isNull(ctx.group);
  });

  it('returns null user when the user does not exist', async () => {
    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', true),
      variantCourse: makeCourse('1', true),
      effectiveUserId: '999999999',
      teamId: null,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns group with members when a team_id is provided', async () => {
    const [u1, u2] = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });

    // Set up a minimal team_config + team with two members.
    const teamConfigId = await sqldb.queryRow(
      'INSERT INTO team_configs (course_instance_id) VALUES (1) RETURNING id',
      {},
      z.object({ id: IdSchema }).transform((r) => r.id),
    );
    const teamId = await sqldb.queryRow(
      `INSERT INTO teams (name, team_config_id, course_instance_id)
       VALUES ('test-team', $team_config_id, 1) RETURNING id`,
      { team_config_id: teamConfigId },
      z.object({ id: IdSchema }).transform((r) => r.id),
    );
    await sqldb.execute(
      `INSERT INTO team_users (team_id, user_id, team_config_id)
       VALUES ($team_id, $u1, $team_config_id), ($team_id, $u2, $team_config_id)`,
      { team_id: teamId, u1: u1.id, u2: u2.id, team_config_id: teamConfigId },
    );

    const ctx = await buildQuestionUserContext({
      question: makeQuestion('1'),
      questionCourse: makeCourse('1', true),
      variantCourse: makeCourse('1', true),
      effectiveUserId: u1.id,
      teamId,
    });
    assert.isNotNull(ctx.group);
    assert.equal(ctx.group.name, 'test-team');
    assert.lengthOf(ctx.group.members, 2);
    const memberUids = ctx.group.members.map((m) => m.uid).sort();
    assert.deepEqual(memberUids.length, 2);
  });
});
