import { afterAll, assert, beforeAll, describe, it } from 'vitest';

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
});
