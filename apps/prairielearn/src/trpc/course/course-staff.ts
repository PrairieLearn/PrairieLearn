import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type EnumCourseInstanceRole,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
} from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import {
  type CourseInstanceAuthz,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';
import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCoursePermissionForUser,
  selectCourseUsers,
  updateCoursePermissionsRole,
  upsertCourseInstancePermissionsRole,
} from '../../models/course-permissions.js';

import { type createContext, requireCoursePermissionOwn, t } from './init.js';

export interface CourseStaffError {}

const MAX_UIDS = 100;

type StaffAuthzData = Awaited<ReturnType<typeof createContext>>['authz_data'];

const InsertableInstanceRoleSchema = z.enum(['Student Data Viewer', 'Student Data Editor']);

function assertCanModifyUser(authzData: StaffAuthzData, userId: string, action: string) {
  if (idsEqual(userId, authzData.user.id) && !authzData.is_administrator) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Only administrators can ${action}`,
    });
  }
  if (idsEqual(userId, authzData.authn_user.id) && !authzData.is_administrator) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Only administrators can ${action} while emulating another user`,
    });
  }
}

async function assertCanDeleteUser(authzData: StaffAuthzData, userId: string, courseId: string) {
  assertCanModifyUser(authzData, userId, 'remove themselves from the course staff');
  if (!authzData.is_administrator) {
    const role = await selectCoursePermissionForUser({ course_id: courseId, user_id: userId });
    if (role === 'Owner') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only administrators can remove owners from the course staff',
      });
    }
  }
}

async function getAccessibleInstances(ctx: Awaited<ReturnType<typeof createContext>>) {
  return selectCourseInstancesWithStaffAccess({
    course: ctx.course,
    authzData: ctx.authz_data,
    requiredRole: ['Owner'],
  });
}

function assertInstanceAccessible(
  accessibleInstances: CourseInstanceAuthz[],
  courseInstanceId: string,
) {
  if (!accessibleInstances.some((ci) => idsEqual(ci.id, courseInstanceId))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid requested course instance' });
  }
}

async function upsertOrDeleteInstancePermission({
  courseId,
  userId,
  courseInstanceId,
  courseInstanceRole,
  authnUserId,
}: {
  courseId: string;
  userId: string;
  courseInstanceId: string;
  courseInstanceRole: EnumCourseInstanceRole;
  authnUserId: string;
}) {
  if (courseInstanceRole === 'None') {
    await deleteCourseInstancePermissions({
      course_id: courseId,
      user_id: userId,
      course_instance_id: courseInstanceId,
      authn_user_id: authnUserId,
    });
  } else {
    await upsertCourseInstancePermissionsRole({
      course_id: courseId,
      user_id: userId,
      course_instance_id: courseInstanceId,
      course_instance_role: courseInstanceRole,
      authn_user_id: authnUserId,
    });
  }
}

// --- Procedures ---

const list = t.procedure.use(requireCoursePermissionOwn).query(async ({ ctx }) => {
  return selectCourseUsers({ course_id: ctx.course.id });
});

const updateCourseRole = t.procedure
  .use(requireCoursePermissionOwn)
  .input(
    z.object({
      userId: IdSchema,
      courseRole: EnumCourseRoleSchema,
    }),
  )
  .mutation(async ({ input, ctx }) => {
    assertCanModifyUser(ctx.authz_data, input.userId, 'change their own course content access');
    await updateCoursePermissionsRole({
      course_id: ctx.course.id,
      user_id: input.userId,
      course_role: input.courseRole,
      authn_user_id: ctx.authz_data.authn_user.id,
    });
  });

const deleteUser = t.procedure
  .use(requireCoursePermissionOwn)
  .input(z.object({ userId: IdSchema }))
  .mutation(async ({ input, ctx }) => {
    await assertCanDeleteUser(ctx.authz_data, input.userId, ctx.course.id);
    await deleteCoursePermissions({
      course_id: ctx.course.id,
      user_id: input.userId,
      authn_user_id: ctx.authz_data.authn_user.id,
    });
  });

const updateInstanceRole = t.procedure
  .use(requireCoursePermissionOwn)
  .input(
    z.object({
      userId: IdSchema,
      courseInstanceId: IdSchema,
      courseInstanceRole: EnumCourseInstanceRoleSchema,
    }),
  )
  .mutation(async ({ input, ctx }) => {
    assertCanModifyUser(ctx.authz_data, input.userId, 'change their own student data access');
    const accessibleInstances = await getAccessibleInstances(ctx);
    assertInstanceAccessible(accessibleInstances, input.courseInstanceId);

    await upsertOrDeleteInstancePermission({
      courseId: ctx.course.id,
      userId: input.userId,
      courseInstanceId: input.courseInstanceId,
      courseInstanceRole: input.courseInstanceRole,
      authnUserId: ctx.authz_data.authn_user.id,
    });
  });

const insertByUserUids = t.procedure
  .use(requireCoursePermissionOwn)
  .input(
    z.object({
      uids: z.array(z.string()).min(1).max(MAX_UIDS),
      courseRole: EnumCourseRoleSchema,
      courseInstanceChanges: z
        .array(
          z.object({
            courseInstanceId: IdSchema,
            courseInstanceRole: InsertableInstanceRoleSchema,
          }),
        )
        .optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    let accessibleInstances: CourseInstanceAuthz[] = [];
    if (input.courseInstanceChanges && input.courseInstanceChanges.length > 0) {
      accessibleInstances = await getAccessibleInstances(ctx);
      for (const change of input.courseInstanceChanges) {
        assertInstanceAccessible(accessibleInstances, change.courseInstanceId);
      }
    }

    const result: Record<
      'givenCp' | 'notGivenCp' | 'notGivenCip' | 'unknownUsers' | 'errors',
      string[]
    > = {
      givenCp: [],
      notGivenCp: [],
      notGivenCip: [],
      unknownUsers: [],
      errors: [],
    };

    for (const uid of input.uids) {
      let user;
      try {
        user = await insertCoursePermissionsByUserUid({
          course_id: ctx.course.id,
          uid,
          course_role: input.courseRole,
          authn_user_id: ctx.authz_data.authn_user.id,
        });
      } catch (err: unknown) {
        logger.verbose(`Failed to insert course permission for uid: ${uid}`, err);
        result.notGivenCp.push(uid);
        result.errors.push(
          `Failed to give course content access to ${uid}\n(${err instanceof Error ? err.message : String(err)})`,
        );
        continue;
      }

      result.givenCp.push(uid);

      if (user.name == null) {
        result.unknownUsers.push(uid);
      }

      if (!input.courseInstanceChanges) continue;

      for (const change of input.courseInstanceChanges) {
        try {
          await insertCourseInstancePermissions({
            course_id: ctx.course.id,
            user_id: user.id,
            course_instance_id: change.courseInstanceId,
            course_instance_role: change.courseInstanceRole,
            authn_user_id: ctx.authz_data.authn_user.id,
          });
        } catch (err: unknown) {
          logger.verbose(`Failed to insert course instance permission for uid: ${uid}`, err);
          result.notGivenCip.push(uid);
          result.errors.push(
            `Failed to give student data access to ${uid}\n(${err instanceof Error ? err.message : String(err)})`,
          );
        }
      }
    }

    return result;
  });

const bulkDelete = t.procedure
  .use(requireCoursePermissionOwn)
  .input(z.object({ userIds: z.array(IdSchema).min(1) }))
  .mutation(async ({ input, ctx }) => {
    for (const userId of input.userIds) {
      await assertCanDeleteUser(ctx.authz_data, userId, ctx.course.id);
    }
    await deleteCoursePermissions({
      course_id: ctx.course.id,
      user_id: input.userIds,
      authn_user_id: ctx.authz_data.authn_user.id,
    });
  });

const bulkEditAccess = t.procedure
  .use(requireCoursePermissionOwn)
  .input(
    z.object({
      userIds: z.array(IdSchema).min(1),
      courseRole: EnumCourseRoleSchema.optional(),
      courseInstanceChanges: z
        .array(
          z.object({
            courseInstanceId: IdSchema,
            courseInstanceRole: EnumCourseInstanceRoleSchema,
          }),
        )
        .optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    // Validate course instance changes upfront
    let accessibleInstances: CourseInstanceAuthz[] = [];
    if (input.courseInstanceChanges && input.courseInstanceChanges.length > 0) {
      accessibleInstances = await getAccessibleInstances(ctx);
      for (const change of input.courseInstanceChanges) {
        assertInstanceAccessible(accessibleInstances, change.courseInstanceId);
      }
    }

    await runInTransactionAsync(async () => {
      // Apply course role changes
      if (input.courseRole) {
        for (const userId of input.userIds) {
          assertCanModifyUser(ctx.authz_data, userId, 'change their own course content access');
          await updateCoursePermissionsRole({
            course_id: ctx.course.id,
            user_id: userId,
            course_role: input.courseRole,
            authn_user_id: ctx.authz_data.authn_user.id,
          });
        }
      }

      // Apply course instance role changes
      if (input.courseInstanceChanges) {
        for (const change of input.courseInstanceChanges) {
          for (const userId of input.userIds) {
            assertCanModifyUser(ctx.authz_data, userId, 'change their own student data access');
            await upsertOrDeleteInstancePermission({
              courseId: ctx.course.id,
              userId,
              courseInstanceId: change.courseInstanceId,
              courseInstanceRole: change.courseInstanceRole,
              authnUserId: ctx.authz_data.authn_user.id,
            });
          }
        }
      }
    });
  });

export const courseStaffRouter = t.router({
  list,
  updateCourseRole,
  deleteUser,
  updateInstanceRole,
  insertByUserUids,
  bulkDelete,
  bulkEditAccess,
});
