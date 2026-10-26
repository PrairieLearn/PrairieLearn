import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { type Course, type CourseInstance, type Question } from '../lib/db-types.js';
import { createGroup } from '../lib/groups.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment, generateAndEnrollUsers } from '../models/enrollment.js';
import {
  addLabelToEnrollment,
  createStudentLabel,
  removeLabelFromEnrollment,
} from '../models/student-label.js';
import { generateUsers } from '../models/user.js';
import * as helperDb from '../tests/helperDb.js';
import * as helperServer from '../tests/helperServer.js';

import { buildQuestionUserContext } from './user-context.js';

function makeQuestion({
  course_id,
  share_publicly = false,
  share_source_publicly = false,
}: {
  course_id: string;
  share_publicly?: boolean;
  share_source_publicly?: boolean;
}): Pick<Question, 'course_id' | 'share_publicly' | 'share_source_publicly'> {
  return { course_id, share_publicly, share_source_publicly };
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
  courseInstanceId = '1',
  sharePublicly = false,
  shareSourcePublicly = false,
}: {
  questionCourseId?: string;
  variantCourseId?: string;
  courseOptedIn: boolean;
  userId: string | null;
  groupId: string | null;
  courseInstanceId?: string | null;
  sharePublicly?: boolean;
  shareSourcePublicly?: boolean;
}) {
  return buildQuestionUserContext({
    question: makeQuestion({
      course_id: questionCourseId,
      share_publicly: sharePublicly,
      share_source_publicly: shareSourcePublicly,
    }),
    course: { questions_receive_user_data: courseOptedIn },
    caller: {
      userId,
      groupId,
      variantCourse: makeVariantCourse(variantCourseId),
      courseInstanceId,
    },
  });
}

async function labelUser(userId: string, name: string, courseInstance: CourseInstance) {
  const enrollment = await ensureUncheckedEnrollment({
    userId,
    courseInstance,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });
  assert.isNotNull(enrollment);
  const label = await createStudentLabel({
    courseInstance,
    uuid: crypto.randomUUID(),
    name,
    color: 'gray1',
  });
  await addLabelToEnrollment({ enrollment, label, authzData: dangerousFullSystemAuthz() });
  return { enrollment, label };
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

  it('returns null user/group for a publicly shared question, even when otherwise gated through', async () => {
    const ctx = await call({
      courseOptedIn: true,
      userId,
      groupId: null,
      sharePublicly: true,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns null user/group for a source-publicly shared question, even when otherwise gated through', async () => {
    const ctx = await call({
      courseOptedIn: true,
      userId,
      groupId: null,
      shareSourcePublicly: true,
    });
    assert.deepEqual(ctx, { user: null, group: null });
  });

  it('returns user info when fully gated through', async () => {
    const ctx = await call({ courseOptedIn: true, userId, groupId: null });
    assert.isNotNull(ctx.user);
    assert.isString(ctx.user.uid);
    assert.deepEqual(ctx.user.labels, []);
    assert.isNull(ctx.group);
  });

  it('returns current label names from only the variant course instance', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await labelUser(userId, 'section-a', groupCourseInstance);
      const { enrollment, label } = await labelUser(
        userId,
        'needs-accessible-input',
        groupCourseInstance,
      );
      const otherCourseInstance = await selectCourseInstanceById('2');
      await labelUser(userId, 'other-instance', otherCourseInstance);

      const ctx = await call({ courseOptedIn: true, userId, groupId: null });
      assert.deepEqual(ctx.user?.labels, ['needs-accessible-input', 'section-a']);

      await removeLabelFromEnrollment({ enrollment, label, authzData: dangerousFullSystemAuthz() });
      const updated = await call({ courseOptedIn: true, userId, groupId: null });
      assert.deepEqual(updated.user?.labels, ['section-a']);

      const preview = await call({
        courseOptedIn: true,
        userId,
        groupId: null,
        courseInstanceId: null,
      });
      assert.deepEqual(preview.user?.labels, []);
    });
  });

  it('returns an empty labels list for a user without an enrollment', async () => {
    const [user] = await generateUsers(1);
    const ctx = await call({ courseOptedIn: true, userId: user.id, groupId: null });
    assert.deepEqual(ctx.user?.labels, []);
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
    await labelUser(u1.id, 'needs-accessible-input', groupCourseInstance);

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
    assert.deepEqual(ctx.group?.members.find((m) => m.uid === u1.uid)?.labels, [
      'needs-accessible-input',
    ]);
    assert.deepEqual(ctx.group?.members.find((m) => m.uid === u2.uid)?.labels, []);

    const otherViewer = await call({ courseOptedIn: true, userId: u2.id, groupId: group.id });
    assert.deepEqual(otherViewer, ctx);
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
