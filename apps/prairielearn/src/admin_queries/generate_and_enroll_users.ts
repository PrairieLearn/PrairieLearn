import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import type { AdministratorQueryResult } from './util.js';

const columns = [
  'user_id',
  'uid',
  'name',
  'course_id',
  'course',
  'course_instance_id',
  'course_instance',
];

export default async function ({
  count,
  course_instance_id,
}: {
  count: string;
  course_instance_id: string;
}): Promise<AdministratorQueryResult> {
  const course_instance = await selectCourseInstanceById(course_instance_id);
  if (!course_instance) {
    return { rows: [], columns };
  }
  const course = await selectCourseById(course_instance.course_id);
  const users = await generateAndEnrollUsers({ count: Number(count), course_instance_id });
  return {
    rows: users.map(({ user_id, uid, name }) => ({
      user_id,
      uid,
      name,
      course_id: course.id,
      course: course.short_name,
      course_instance_id,
      course_instance: course_instance.short_name,
    })),
    columns,
  };
}
