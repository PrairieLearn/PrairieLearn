// @ts-check
import * as error from '@prairielearn/error';
import asyncHandler from 'express-async-handler';

export async function authzHasCoursePreviewOrInstanceView(req, res) {
  if (
    !res.locals.authz_data.has_course_permission_preview &&
    !res.locals.authz_data.has_course_instance_permission_view
  ) {
    throw new error.HttpStatusError(
      403,
      'Requires either course preview access or student data view access',
    );
  }
}

export default asyncHandler(async (req, res, next) => {
  await authzHasCoursePreviewOrInstanceView(req, res);
  next();
});
