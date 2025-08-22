import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import type { AdministratorQueryResult, AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Generate random users and enroll them in a course instance',
  params: [
    {
      name: 'count',
      description: 'Number of users to generate (integer)',
      default: '30',
    },
    {
      name: 'course_instance_id',
      description:
        'course_instance_id to enroll the users in (integer), can be blank to only create the users and not enroll them',
    },
  ],
};

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
  const course_instance = await selectOptionalCourseInstanceById(course_instance_id);
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
