import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
  UserSchema,
} from '../../../../lib/db-types.js';
import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../../../models/course-permissions.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';
import { CourseUsersRowSchema } from '../../../../pages/instructorCourseAdminStaff/instructorCourseAdminStaff.html.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const router = Router({ mergeParams: true });

function validateCourseRole({ course_role }) {
  if (!course_role) {
    throw new error.HttpStatusError(400, 'Missing required field: course_role');
  }

  const validate_role = EnumCourseRoleSchema.safeParse(course_role);

  if (!validate_role.success) {
    throw new error.HttpStatusError(400, 'Role not found');
  }
}

function validateCourseInstanceRole({ course_instance_role }) {
  if (!course_instance_role) {
    throw new error.HttpStatusError(400, 'Missing required field: course_instance_role');
  }

  const validate_role = EnumCourseInstanceRoleSchema.safeParse(course_instance_role);

  if (!validate_role.success) {
    throw new error.HttpStatusError(400, 'Role not found');
  }
}

async function validateUid({ uid }) {
  if (!uid) {
    throw new error.HttpStatusError(400, 'Missing required field: uid');
  }

  const user = await selectOptionalUserByUid(uid);
  if (!user) {
    throw new error.HttpStatusError(400, 'User not found');
  }

  return user;
}

// List users with access to course
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await sqldb.queryRows(
      sql.select_course_users,
      { course_id: req.params.course_id },
      z.object({
        user: UserSchema.pick({
          uid: true,
          email: true,
          name: true,
        }).partial(),
        course_permission: CourseUsersRowSchema.shape.course_permission.pick({
          course_role: true,
        }),
        course_instance_roles: CourseUsersRowSchema.shape.course_instance_roles,
      }),
    );

    res.status(200).json(users);
  }),
);

// Grant user access to course
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { uid, course_role } = req.body;

    // User can be added to staff list before it exists in database
    // so we do not run 'selectOptionalUserByUid()' like other endpoints
    if (!uid) {
      throw new error.HttpStatusError(400, 'Missing required field: uid');
    }

    validateCourseRole({ course_role });

    await insertCoursePermissionsByUserUid({
      course_id: req.params.course_id,
      uid,
      course_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

// Update user access to course
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { uid, course_role } = req.body;

    const user = await validateUid({ uid });
    validateCourseRole({ course_role });

    await updateCoursePermissionsRole({
      course_id: req.params.course_id,
      user_id: user.user_id,
      course_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

// Remove user access from course
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { uid } = req.body;

    const user = await validateUid({ uid });

    await deleteCoursePermissions({
      course_id: req.params.course_id,
      user_id: user.user_id,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

// Grant user access to student data
router.post(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid, course_instance_role } = req.body;

    validateCourseInstanceRole({ course_instance_role });
    const user = await validateUid({ uid });

    await insertCourseInstancePermissions({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      course_instance_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

// Update user access to student data
router.put(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid, course_instance_role } = req.body;

    validateCourseInstanceRole({ course_instance_role });
    const user = await validateUid({ uid });

    await updateCourseInstancePermissionsRole({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      course_instance_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

// Remove user access from student data
router.delete(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid } = req.body;

    const user = await validateUid({ uid });

    await deleteCourseInstancePermissions({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.sendStatus(204);
  }),
);

export default router;
