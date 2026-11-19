import { z } from 'zod';

import { type EnumCourseRole, EnumCourseRoleSchema, type User } from '../../../../lib/db-types.js';
import { idsEqual } from '../../../../lib/id.js';
import {
  deleteCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCourseInstancePermissionForUser,
  selectCoursePermissionForUser,
  updateCoursePermissionsRole,
  upsertCourseInstancePermissionsRole,
} from '../../../../models/course-permissions.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';

import {
  COURSE_INSTANCE_INPUT,
  type CourseActionContext,
  CourseActionError,
  action,
  count,
  courseInstanceAction,
} from './action.js';

const StaffRoleSchema = z
  .enum(['Previewer', 'Viewer', 'Editor', 'Owner'])
  .describe(
    'Previewer: sees questions and assessments. Viewer: also sees course files. Editor: also changes course files. Owner: also manages staff and course settings. None of these give access to student data, which is set per course instance.',
  );

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);

const rank = (role: EnumCourseRole | null) => EnumCourseRoleSchema.options.indexOf(role ?? 'None');

/** Staff cannot change their own access here, as on the Staff page, unless they are administrators. */
function refuseSelf(ctx: CourseActionContext, user: User | null) {
  if (user && idsEqual(user.id, ctx.user.id) && !ctx.is_administrator) {
    throw new CourseActionError(
      'The instructor cannot change their own access. Another course owner can do it on the Staff page.',
    );
  }
}

async function selectStaffMember(ctx: CourseActionContext, uid: string) {
  const user = await selectOptionalUserByUid(uid);
  const role = user
    ? await selectCoursePermissionForUser({ course_id: ctx.course.id, user_id: user.id })
    : null;
  if (!user || role === null) {
    throw new CourseActionError(
      `${uid} is not on this course's staff. Add them with staff_add first.`,
    );
  }
  refuseSelf(ctx, user);
  return { user, role };
}

async function planStaffAdd(ctx: CourseActionContext, uids: string[], course_role: EnumCourseRole) {
  const plan: { uid: string; add: boolean; detail: string }[] = [];
  for (const uid of new Set(uids)) {
    const user = await selectOptionalUserByUid(uid);
    refuseSelf(ctx, user);
    const current = user
      ? await selectCoursePermissionForUser({ course_id: ctx.course.id, user_id: user.id })
      : null;
    if (current === null) {
      plan.push({ uid, add: true, detail: 'New to the staff' });
    } else if (rank(current) < rank(course_role)) {
      plan.push({ uid, add: true, detail: `Now: ${current}` });
    } else {
      plan.push({ uid, add: false, detail: `already ${current}` });
    }
  }
  const adding = plan.filter(({ add }) => add);
  if (adding.length === 0) {
    throw new CourseActionError(
      `These people already have ${course_role} access or more: ${plan.map(({ uid, detail }) => `${uid} is ${detail}`).join(', ')}. Use staff_set_course_role to lower a role.`,
    );
  }
  return { plan, adding };
}

const StudentDataAccessSchema = z
  .enum(['none', 'viewer', 'editor'])
  .describe(
    'none: no student data. viewer: sees students, their work, and scores. editor: also changes them, such as scores and time limits.',
  );

const INSTANCE_ROLES = {
  none: 'None',
  viewer: 'Student Data Viewer',
  editor: 'Student Data Editor',
} as const;

export const staffActions = {
  staff_add: action({
    group: 'staff',
    description:
      "Add people to the course's staff with a course role, or raise the role of people already on it. It never lowers a role.",
    effects:
      'They can open the course with that role the next time they sign in. Access to student data is separate, per course instance.',
    undo: 'Change their role with staff_set_course_role. Removing someone from the staff is done on the Staff page.',
    permission: 'course_owner',
    input: z.strictObject({
      uids: z
        .array(z.email().max(256))
        .min(1)
        .max(100)
        .describe('UIDs of the people, such as name@example.edu.'),
      course_role: StaffRoleSchema,
    }),
    describe: async ({ ctx, input }) => {
      const { plan, adding } = await planStaffAdd(ctx, input.uids, input.course_role);
      const skipped = plan.length - adding.length;
      return {
        title: `Give ${people(adding.length)} ${input.course_role} access to the course`,
        context:
          skipped > 0 ? `${count(skipped, 'other')} already ${input.course_role} or more` : null,
        rows: adding.map(({ uid, detail }) => ({ label: uid, detail })),
      };
    },
    run: async ({ ctx, input }) => {
      const { adding } = await planStaffAdd(ctx, input.uids, input.course_role);
      for (const { uid } of adding) {
        await insertCoursePermissionsByUserUid({
          course_id: ctx.course.id,
          uid,
          course_role: input.course_role,
          authn_user_id: ctx.user.id,
        });
      }
      return {
        summary: `Gave ${people(adding.length)} ${input.course_role} access.`,
      };
    },
  }),
  staff_set_course_role: action({
    group: 'staff',
    description: "Change the course role of someone already on the course's staff, up or down.",
    effects: 'Their access to the course changes the next time they load a page.',
    undo: 'Set their earlier role again with this action.',
    permission: 'course_owner',
    input: z.strictObject({
      uid: z.email().max(256).describe('UID of the staff member.'),
      course_role: StaffRoleSchema,
    }),
    describe: async ({ ctx, input }) => {
      const { role } = await selectStaffMember(ctx, input.uid);
      if (role === input.course_role) {
        throw new CourseActionError(`${input.uid} already has the course role ${role}.`);
      }
      return {
        title: `Change the course role of ${input.uid} to ${input.course_role}`,
        rows: [{ label: input.uid, detail: `Now: ${role}` }],
      };
    },
    run: async ({ ctx, input }) => {
      const { user } = await selectStaffMember(ctx, input.uid);
      await updateCoursePermissionsRole({
        course_id: ctx.course.id,
        user_id: user.id,
        course_role: input.course_role,
        authn_user_id: ctx.user.id,
      });
      return { summary: `Changed the course role of ${input.uid} to ${input.course_role}.` };
    },
  }),
  staff_set_student_data_access: courseInstanceAction({
    group: 'staff',
    description:
      "Change a staff member's access to student data in one course instance, such as to let a TA see and grade students' work.",
    effects:
      "They see, or stop seeing, the course instance's students, their work, and scores the next time they load a page.",
    undo: 'Set their earlier access again with this action.',
    permission: 'course_owner',
    input: z.strictObject({
      ...COURSE_INSTANCE_INPUT,
      uid: z.email().max(256).describe('UID of the staff member.'),
      access: StudentDataAccessSchema,
    }),
    describe: async ({ ctx, input }) => {
      const { user } = await selectStaffMember(ctx, input.uid);
      const current =
        (await selectCourseInstancePermissionForUser({
          course_instance_id: ctx.course_instance.id,
          user_id: user.id,
        })) ?? 'None';
      if (current === INSTANCE_ROLES[input.access]) {
        throw new CourseActionError(
          `${input.uid} already has that access in ${ctx.course_instance.short_name}.`,
        );
      }
      return {
        title: `Set the student data access of ${input.uid} to ${INSTANCE_ROLES[input.access]}`,
        context: ctx.course_instance.short_name,
        rows: [{ label: input.uid, detail: `Now: ${current}` }],
      };
    },
    run: async ({ ctx, input }) => {
      const { user } = await selectStaffMember(ctx, input.uid);
      const key = {
        course_id: ctx.course.id,
        course_instance_id: ctx.course_instance.id,
        user_id: user.id,
        authn_user_id: ctx.user.id,
      };
      if (input.access === 'none') {
        await deleteCourseInstancePermissions(key);
      } else {
        await upsertCourseInstancePermissionsRole({
          ...key,
          course_instance_role: INSTANCE_ROLES[input.access],
        });
      }
      return {
        summary: `Set the student data access of ${input.uid} in ${ctx.course_instance.short_name} to ${INSTANCE_ROLES[input.access]}.`,
      };
    },
  }),
};
