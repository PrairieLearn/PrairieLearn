import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  type CourseInstance,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
} from '../../../../lib/db-types.js';
import { idsEqual } from '../../../../lib/id.js';
import { selectOptionalCourseInstanceByShortName } from '../../../../models/course-instances.js';
import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
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
  courseInstanceAction,
} from './action.js';

const UidSchema = z
  .string()
  .regex(/^[^\s,;]+$/, 'A UID has no spaces, commas, or semicolons.')
  .max(256);

const CourseRoleSchema = EnumCourseRoleSchema.describe(
  'None: no access to course content, only to student data where given. Previewer: sees questions and assessments. Viewer: also sees course files. Editor: also changes course files. Owner: also manages staff and course settings. No course role gives access to student data, which is set per course instance.',
);

/** Who a staff action is about: UIDs the instructor typed, or user_ids from the staff dataset. */
const StaffMembersInput = {
  uids: z
    .array(UidSchema)
    .max(100)
    .optional()
    .describe('UIDs of staff members, such as name@example.edu, as the instructor gave them.'),
  user_ids: z
    .array(IdSchema)
    .max(100)
    .optional()
    .describe('Staff members, from the user_id column of the staff dataset.'),
};

const InsertableInstanceRoleSchema = EnumCourseInstanceRoleSchema.exclude(['None']).describe(
  'Student Data Viewer: sees students, their work, and scores. Student Data Editor: also changes them, such as grading and scores.',
);

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);

/**
 * The staff members a request names. The request is refused if one of them is not on the course
 * staff, so that nothing is changed for the others either.
 */
async function selectStaffMembers(
  ctx: CourseActionContext,
  input: { uids?: string[]; user_ids?: string[] },
) {
  const uids = [...new Set(input.uids ?? [])];
  const userIds = [...new Set(input.user_ids ?? [])];
  if (uids.length + userIds.length === 0) {
    throw new CourseActionError('Give uids, user_ids, or both.');
  }
  const members = new Map<string, string>();
  const missing: string[] = [];
  for (const uid of uids) {
    const user = await selectOptionalUserByUid(uid);
    if (
      user &&
      (await selectCoursePermissionForUser({ course_id: ctx.course.id, user_id: user.id }))
    ) {
      members.set(user.id, uid);
    } else {
      missing.push(uid);
    }
  }
  for (const userId of userIds) {
    if (await selectCoursePermissionForUser({ course_id: ctx.course.id, user_id: userId })) {
      members.set(userId, `user_id ${userId}`);
    } else {
      missing.push(`user_id ${userId}`);
    }
  }
  if (missing.length > 0) {
    throw new CourseActionError(
      `Not on this course's staff: ${missing.join(', ')}. Nothing was changed. Find staff in the staff dataset, or add people with staff_add.`,
    );
  }
  return [...members.keys()];
}

/** As on the Staff page, only administrators can change their own course access. */
function refuseSelf(ctx: CourseActionContext, userIds: string[]) {
  const { is_administrator, is_institution_administrator } = ctx.authz_data;
  if (
    !is_administrator &&
    !is_institution_administrator &&
    userIds.some((id) => idsEqual(id, ctx.user.id))
  ) {
    throw new CourseActionError(
      'The instructor cannot change their own course access or remove themselves. Another course owner can do it on the Staff page. Nothing was changed; leave the instructor out of the request if it was about others too.',
    );
  }
}

async function selectCourseInstance(ctx: CourseActionContext, shortName: string) {
  const courseInstance = await selectOptionalCourseInstanceByShortName({
    course: ctx.course,
    shortName,
  });
  if (!courseInstance) {
    throw new CourseActionError(
      `This course has no course instance named "${shortName}". Use a directory name from courseInstances/ in the course files.`,
    );
  }
  return courseInstance;
}

export const staffActions = {
  staff_add: action({
    description:
      'Add people to the course staff by UID, as the Staff page\'s "Add users" form does. Like that form, it only raises access: anyone who already has more keeps it. It can also give them access to student data in course instances.',
    requiredRole: ['Owner'],
    input: z.strictObject({
      uids: z
        .array(UidSchema)
        .min(1)
        .max(100)
        .describe('UIDs of the people, such as name@example.edu, as the instructor gave them.'),
      course_role: CourseRoleSchema,
      student_data_access: z
        .array(
          z.strictObject({
            ...COURSE_INSTANCE_INPUT,
            role: InsertableInstanceRoleSchema,
          }),
        )
        .max(50)
        .optional()
        .describe('Access to student data to give them in course instances, if any.'),
    }),
    run: async ({ ctx, input }) => {
      const changes: {
        courseInstance: CourseInstance;
        role: z.infer<typeof InsertableInstanceRoleSchema>;
      }[] = [];
      for (const change of input.student_data_access ?? []) {
        changes.push({
          courseInstance: await selectCourseInstance(ctx, change.course_instance_short_name),
          role: change.role,
        });
      }
      const uids = [...new Set(input.uids)];
      let notSignedIn = 0;
      for (const uid of uids) {
        const user = await insertCoursePermissionsByUserUid({
          course_id: ctx.course.id,
          uid,
          course_role: input.course_role,
          authn_user_id: ctx.user.id,
        });
        if (user.name == null) notSignedIn++;
        for (const { courseInstance, role } of changes) {
          await insertCourseInstancePermissions({
            course_id: ctx.course.id,
            user_id: user.id,
            course_instance_id: courseInstance.id,
            course_instance_role: role,
            authn_user_id: ctx.user.id,
          });
        }
      }
      const access = [
        `course role ${input.course_role}`,
        ...changes.map(({ courseInstance, role }) => `${role} in ${courseInstance.short_name}`),
      ].join(', ');
      return {
        summary: `Added ${people(uids.length)} to the course staff with ${access}, keeping any higher access they already had.${notSignedIn > 0 ? ` ${people(notSignedIn)} ${notSignedIn === 1 ? 'has' : 'have'} not signed in to PrairieLearn yet.` : ''}`,
      };
    },
  }),
  staff_set_course_role: action({
    description:
      'Set the course role of people on the course staff, up or down, as on the Staff page. The instructor cannot change their own role.',
    requiredRole: ['Owner'],
    input: z.strictObject({ ...StaffMembersInput, course_role: CourseRoleSchema }),
    run: async ({ ctx, input }) => {
      const userIds = await selectStaffMembers(ctx, input);
      refuseSelf(ctx, userIds);
      for (const userId of userIds) {
        await updateCoursePermissionsRole({
          course_id: ctx.course.id,
          user_id: userId,
          course_role: input.course_role,
          authn_user_id: ctx.user.id,
        });
      }
      return {
        summary: `Set the course role of ${people(userIds.length)} to ${input.course_role}.`,
      };
    },
  }),
  staff_set_instance_role: courseInstanceAction({
    description:
      "Set the access to student data that people on the course staff have in one course instance, as on the Staff page, such as to let a TA grade students' work.",
    requiredRole: ['Owner'],
    input: z.strictObject({
      ...COURSE_INSTANCE_INPUT,
      ...StaffMembersInput,
      role: EnumCourseInstanceRoleSchema.describe(
        'None: no student data. Student Data Viewer: sees students, their work, and scores. Student Data Editor: also changes them, such as grading and scores.',
      ),
    }),
    run: async ({ ctx, input }) => {
      const userIds = await selectStaffMembers(ctx, input);
      for (const userId of userIds) {
        const key = {
          course_id: ctx.course.id,
          course_instance_id: ctx.course_instance.id,
          user_id: userId,
          authn_user_id: ctx.user.id,
        };
        if (input.role === 'None') {
          await deleteCourseInstancePermissions(key);
        } else {
          await upsertCourseInstancePermissionsRole({ ...key, course_instance_role: input.role });
        }
      }
      return {
        summary:
          input.role === 'None'
            ? `Removed the access to student data in ${ctx.course_instance.short_name} of ${people(userIds.length)}.`
            : `Gave ${people(userIds.length)} ${input.role} access in ${ctx.course_instance.short_name}.`,
      };
    },
  }),
  staff_remove: action({
    description:
      'Remove people from the course staff, as on the Staff page. They lose all access to the course content and its student data, and their enrollments in its course instances are removed. The instructor cannot remove themselves.',
    requiredRole: ['Owner'],
    input: z.strictObject(StaffMembersInput),
    run: async ({ ctx, input }) => {
      const userIds = await selectStaffMembers(ctx, input);
      refuseSelf(ctx, userIds);
      await deleteCoursePermissions({
        course_id: ctx.course.id,
        user_id: userIds,
        authn_user_id: ctx.user.id,
      });
      return { summary: `Removed ${people(userIds.length)} from the course staff.` };
    },
  }),
};
