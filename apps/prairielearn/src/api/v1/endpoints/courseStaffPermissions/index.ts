import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../../../models/course-permissions.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';

const router = Router({ mergeParams: true });

// Grant user access to course
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { uid, course_role } = req.body;

    const job = await insertCoursePermissionsByUserUid({
      course_id: req.params.course_id,
      uid,
      course_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ user: job });
  }),
);

// Update user access to course
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { uid, course_role } = req.body;

    const user = await selectOptionalUserByUid(uid);
    if (!user) {
      throw new error.HttpStatusError(404, 'User not found');
    }

    await updateCoursePermissionsRole({
      course_id: req.params.course_id,
      user_id: user.user_id,
      course_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ output: 'updated: ' + uid });
  }),
);

// Remove user access from course
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { uid } = req.body;

    const user = await selectOptionalUserByUid(uid);
    if (!user) {
      throw new error.HttpStatusError(404, 'User not found');
    }

    await deleteCoursePermissions({
      course_id: req.params.course_id,
      user_id: user.user_id,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ status: 'complete' });
  }),
);

// Grant user access to student data
router.post(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid, course_instance_role } = req.body;

    const user = await selectOptionalUserByUid(uid);
    if (!user) {
      throw new error.HttpStatusError(404, 'User not found');
    }

    await insertCourseInstancePermissions({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      course_instance_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ output: 'updated: ' + uid });
  }),
);

// Update user access to student data
router.put(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid, course_instance_role } = req.body;

    const user = await selectOptionalUserByUid(uid);
    if (!user) {
      throw new error.HttpStatusError(404, 'User not found');
    }

    await updateCourseInstancePermissionsRole({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      course_instance_role,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ output: 'updated: ' + uid });
  }),
);

// Remove user access from student data
router.delete(
  '/course_instance/:course_instance(\\d+)',
  asyncHandler(async (req, res) => {
    const { uid } = req.body;

    const user = await selectOptionalUserByUid(uid);
    if (!user) {
      throw new error.HttpStatusError(404, 'User not found');
    }

    await deleteCourseInstancePermissions({
      course_id: req.params.course_id,
      course_instance_id: req.params.course_instance,
      user_id: user.user_id,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    });
    res.status(200).json({ status: 'complete' });
  }),
);

export default router;
