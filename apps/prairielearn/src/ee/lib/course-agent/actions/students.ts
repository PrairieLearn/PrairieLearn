import { z } from 'zod';

import { callScalar, runInTransactionAsync } from '@prairielearn/postgres';

import type { Enrollment, EnumEnrollmentStatus } from '../../../../lib/db-types.js';
import {
  deleteEnrollment,
  inviteStudentByUid,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
  setEnrollmentStatus,
} from '../../../../models/enrollment.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';

import {
  COURSE_INSTANCE_INPUT,
  CourseActionError,
  type CourseInstanceActionContext,
  count,
  courseInstanceAction,
} from './action.js';

const UidsSchema = z
  .array(z.email().max(256))
  .min(1)
  .max(200)
  .describe(
    'UIDs of the students, such as student@example.edu, from the uid column of the students dataset.',
  );

const StudentsInputSchema = z.strictObject({ ...COURSE_INSTANCE_INPUT, uids: UidsSchema });

/** Each UID with its enrollment in the course instance, or null when it has none. */
async function selectEnrollments(ctx: CourseInstanceActionContext, uids: string[]) {
  const unique = [...new Set(uids)];
  const rows = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
    uids: unique,
    courseInstance: ctx.course_instance,
    requiredRole: ['Student Data Editor'],
    authzData: ctx.authz_data,
  });
  const byUid = new Map(rows.map((row) => [row.uid, row.enrollment]));
  return unique.map((uid) => ({ uid, enrollment: byUid.get(uid) ?? null }));
}

/**
 * The students' enrollments, or an error when some have none. Errors go to the agent, which reads
 * who is enrolled only with the instructor's approval, so they say how many inputs were wrong and
 * not which students are in what state.
 */
async function selectEnrolled(ctx: CourseInstanceActionContext, uids: string[]) {
  const found = await selectEnrollments(ctx, uids);
  const missing = found.filter(({ enrollment }) => enrollment === null).length;
  if (missing > 0) {
    throw new CourseActionError(
      `${missing} of these ${count(found.length, 'UID')} ${missing === 1 ? 'is' : 'are'} not in the course instance "${ctx.course_instance.short_name}". Find its students in the students dataset.`,
    );
  }
  return found.map(({ uid, enrollment }) => ({ uid, enrollment: enrollment! }));
}

/** Those whose status the action applies to, or an error when it applies to none of them. */
async function selectWithStatus(
  ctx: CourseInstanceActionContext,
  uids: string[],
  from: EnumEnrollmentStatus[],
) {
  const students = await selectEnrolled(ctx, uids);
  const changing = students.filter(({ enrollment }) => from.includes(enrollment.status));
  if (changing.length === 0) {
    throw new CourseActionError(
      `This applies to students whose status is ${from.join(' or ')}, and none of these students has it. Check the status column of the students dataset.`,
    );
  }
  return { students, changing };
}

function statusAction({
  description,
  effects,
  undo,
  from,
  title,
  done,
  apply,
}: {
  description: string;
  effects: string;
  undo: string | null;
  from: EnumEnrollmentStatus[];
  title: (students: string) => string;
  done: (students: string) => string;
  apply: (ctx: CourseInstanceActionContext, enrollment: Enrollment) => Promise<unknown>;
}) {
  return courseInstanceAction({
    group: 'students',
    description,
    effects,
    undo,
    permission: 'student_data_editor',
    input: StudentsInputSchema,
    describe: async ({ ctx, input }) => {
      const { students, changing } = await selectWithStatus(ctx, input.uids, from);
      const unchanged = students.length - changing.length;
      return {
        title: title(count(changing.length, 'student')),
        context: [
          ctx.course_instance.short_name,
          unchanged > 0 ? `${count(unchanged, 'other student')} left as is` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: changing.map(({ uid, enrollment }) => ({
          label: uid,
          detail: `Now: ${enrollment.status}`,
        })),
      };
    },
    run: async ({ ctx, input }) => {
      const { changing } = await selectWithStatus(ctx, input.uids, from);
      // All or nothing, so a failure partway never leaves some students changed.
      await runInTransactionAsync(async () => {
        for (const { enrollment } of changing) await apply(ctx, enrollment);
      });
      return { summary: done(count(changing.length, 'student')) };
    },
  });
}

/** What inviting each UID would do, given who it is and its enrollment so far. */
async function planInvitations(ctx: CourseInstanceActionContext, uids: string[]) {
  if (!ctx.course_instance.modern_publishing) {
    throw new CourseActionError(
      'This course instance uses the older access rules, under which students enroll themselves, so invitations are not available. Tell the instructor.',
    );
  }
  const found = await selectEnrollments(ctx, uids);
  const plan: { uid: string; invite: boolean; detail: string }[] = [];
  for (const { uid, enrollment } of found) {
    const user = await selectOptionalUserByUid(uid);
    const isStaff =
      user !== null &&
      (await callScalar(
        'users_is_instructor_in_course_instance',
        [user.id, ctx.course_instance.id],
        z.boolean(),
      ));
    if (isStaff) {
      plan.push({ uid, invite: false, detail: 'course staff' });
    } else if (enrollment === null) {
      plan.push({ uid, invite: true, detail: 'New' });
    } else if (enrollment.status === 'rejected' || enrollment.status === 'left') {
      plan.push({ uid, invite: true, detail: `Now: ${enrollment.status}` });
    } else {
      plan.push({ uid, invite: false, detail: `already ${enrollment.status}` });
    }
  }
  const inviting = plan.filter(({ invite }) => invite);
  if (inviting.length === 0) {
    throw new CourseActionError(
      'None of these can be invited: each is already enrolled or invited, or is course staff. Check the students and staff datasets. Blocked or removed students are brought back with students_reenroll.',
    );
  }
  return { plan, inviting };
}

export const studentActions = {
  students_invite: courseInstanceAction({
    group: 'students',
    description:
      'Invite people to the course instance by UID. Each gets an invitation they accept the next time they open PrairieLearn. People who are already enrolled, invited, or course staff are skipped.',
    effects:
      'Each invited person sees the invitation on their PrairieLearn home page and joins by accepting it.',
    undo: 'Cancel the invitations, until they are accepted.',
    permission: 'student_data_editor',
    input: StudentsInputSchema,
    describe: async ({ ctx, input }) => {
      const { plan, inviting } = await planInvitations(ctx, input.uids);
      const skipped = plan.length - inviting.length;
      return {
        title: `Invite ${count(inviting.length, 'student')}`,
        context: [
          ctx.course_instance.short_name,
          skipped > 0 ? `${count(skipped, 'other')} skipped` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: inviting.map(({ uid, detail }) => ({ label: uid, detail })),
      };
    },
    run: async ({ ctx, input }) => {
      const { inviting } = await planInvitations(ctx, input.uids);
      // All or nothing, so a failure partway never leaves some people invited.
      await runInTransactionAsync(async () => {
        for (const { uid } of inviting) {
          await inviteStudentByUid({
            uid,
            requiredRole: ['Student Data Editor'],
            authzData: ctx.authz_data,
            courseInstance: ctx.course_instance,
          });
        }
      });
      return { summary: `Invited ${count(inviting.length, 'student')}.` };
    },
  }),
  students_cancel_invitation: statusAction({
    description:
      'Cancel invitations that have not been accepted, such as ones sent to the wrong person.',
    effects:
      'The invitation disappears from the person’s home page, and they are no longer listed.',
    undo: 'Invite them again.',
    from: ['invited', 'rejected'],
    title: (students) => `Cancel the invitation of ${students}`,
    done: (students) => `Cancelled the invitation of ${students}.`,
    apply: (ctx, enrollment) =>
      deleteEnrollment({
        enrollment,
        actionDetail: 'invitation_deleted',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_block: statusAction({
    description:
      'Block enrolled students from the course instance. Their work and scores are kept, and they cannot rejoin on their own.',
    effects: 'The students can no longer open the course instance or its assessments.',
    undo: 'Let them back in by re-enrolling them.',
    from: ['joined'],
    title: (students) => `Block ${students}`,
    done: (students) => `Blocked ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'blocked',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_remove: statusAction({
    description:
      'Remove enrolled students from the course instance, such as ones who dropped. Their work and scores are kept. Use students_block instead to keep someone out for cause.',
    effects:
      'The students no longer see the course instance and are left out of the gradebook and statistics.',
    undo: 'Bring them back by re-enrolling them.',
    from: ['joined'],
    title: (students) => `Remove ${students}`,
    done: (students) => `Removed ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'removed',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_reenroll: statusAction({
    description: 'Bring blocked or removed students back into the course instance.',
    effects: 'The students can open the course instance again, with their earlier work and scores.',
    undo: 'Block or remove them again.',
    from: ['blocked', 'removed'],
    title: (students) => `Re-enroll ${students}`,
    done: (students) => `Re-enrolled ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'joined',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
};
