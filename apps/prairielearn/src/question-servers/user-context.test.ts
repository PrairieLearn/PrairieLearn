import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { type Course, type Question } from '../lib/db-types.js';
import { createGroup } from '../lib/groups.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import * as helperServer from '../tests/helperServer.js';

import { buildQuestionUserContext } from './user-context.js';

function makeQuestion(course_id: string): Pick<Question, 'course_id'> {
  return { course_id };
}

function makeVariantCourse(id: string): Pick<Course, 'id'> {
  return { id };
}

function call({
  questionCourseId = '1',
  variantCourseId = '1',
  courseOptedIn,
  userId,
  groupId,
}: {
  questionCourseId?: string;
  variantCourseId?: string;
  courseOptedIn: boolean;
  userId: string | null;
  groupId: string | null;
}) {
  return buildQuestionUserContext({
    question: makeQuestion(questionCourseId),
    course: { questions_receive_user_data: courseOptedIn },
    caller: {
      userId,
      groupId,
      variantCourse: makeVariantCourse(variantCourseId),
    },
  });
}

describe('buildQuestionUserContext', { timeout: 30_000 }, () => {
  let userId: string;
  let groupAssessment: Awaited<ReturnType<typeof selectAssessmentByTid>>;
  let groupCourseInstance: Awaited<ReturnType<typeof selectCourseInstanceById>>;

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    userId = user.id;
    groupAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam14-groupWork',
    });
    groupCourseInstance = await selectCourseInstanceById(groupAssessment.course_instance_id);
  });

  it('returns null user/group when course is not opted in', async () => {
    const ctx = await call({ courseOptedIn: false, userId, groupId: null });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns null user/group when variant course differs from question course', async () => {
    const ctx = await call({
      variantCourseId: '2',
      courseOptedIn: true,
      userId,
      groupId: null,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns null user/group when no effective user is provided', async () => {
    const ctx = await call({ courseOptedIn: true, userId: null, groupId: null });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns user info when fully gated through', async () => {
    const ctx = await call({ courseOptedIn: true, userId, groupId: null });
    assert.isNotNull(ctx.user);
    assert.isString(ctx.user.uid);
    assert.isNull(ctx.group);
  });

  it('returns null user when the user does not exist', async () => {
    const ctx = await call({ courseOptedIn: true, userId: '999999999', groupId: null });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('omits the individual user but exposes the group on group variants, even with an effective user', async () => {
    const [u1, u2] = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });
    const groupName = `testgroup${u1.id}`;

    const group = await createGroup({
      course_instance: groupCourseInstance,
      assessment: groupAssessment,
      group_name: groupName,
      uids: [u1.uid, u2.uid],
      authn_user_id: '1',
      authzData: dangerousFullSystemAuthz(),
    });

    const ctx = await call({
      courseOptedIn: true,
      userId: u1.id,
      groupId: group.id,
    });
    assert.isNull(ctx.user);
    assert.equal(ctx.group?.name, groupName);
    assert.lengthOf(ctx.group?.members ?? [], 2);
    const memberUids = ctx.group?.members.map((m) => m.uid).sort();
    assert.deepEqual(memberUids, [u1.uid, u2.uid].sort());
  });

  it('returns group with members when a group_id is provided without an effective user', async () => {
    const [u1, u2] = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });
    const groupName = `testgroup${u1.id}`;

    const group = await createGroup({
      course_instance: groupCourseInstance,
      assessment: groupAssessment,
      group_name: groupName,
      uids: [u1.uid, u2.uid],
      authn_user_id: '1',
      authzData: dangerousFullSystemAuthz(),
    });

    const ctx = await call({
      courseOptedIn: true,
      userId: null,
      groupId: group.id,
    });
    assert.isNull(ctx.user);
    assert.equal(ctx.group?.name, groupName);
    const memberUids = ctx.group?.members.map((m) => m.uid).sort();
    assert.deepEqual(memberUids, [u1.uid, u2.uid].sort());
  });
});
