import { Response } from 'express';
import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import { CourseInstance, Enrollment, EnrollmentSchema, Institution } from '../lib/db-types';
import { isEnterprise } from '../lib/license';
import { checkEnterpriseEnrollment } from '../ee/models/enrollment';

const sql = loadSqlEquiv(__filename);

export async function insertEnrollment({
  course_instance_id,
  user_id,
}: {
  course_instance_id: string;
  user_id: string;
}): Promise<Enrollment> {
  return await queryRow(sql.insert_enrollment, { course_instance_id, user_id }, EnrollmentSchema);
}

export async function insertCheckedEnrollment(
  res: Response,
  {
    institution,
    course_instance,
    authz_data,
  }: {
    institution: Institution;
    course_instance: CourseInstance;
    authz_data: any;
  },
): Promise<boolean> {
  // Safety check: ensure the student would otherwise have access to the course.
  // If they don't, throw an access denied error. In most cases, this should
  // have already been checked.
  if (!authz_data.has_student_access) {
    throw error.make(403, 'Access denied');
  }

  if (isEnterprise()) {
    const isValid = await checkEnterpriseEnrollment(res, {
      institution,
      course_instance,
      authz_data,
    });
    if (!isValid) {
      // Do nothing; the user has already been redirected to the appropriate page.
      return false;
    }
  }

  await insertEnrollment({
    course_instance_id: course_instance.id,
    user_id: res.locals.authn_user.user_id,
  });

  return true;
}

export async function getEnrollmentForUserInCourseInstance({
  user_id,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance,
    { user_id, course_instance_id },
    EnrollmentSchema,
  );
}
