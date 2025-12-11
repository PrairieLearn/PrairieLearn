import { runInTransactionAsync } from '@prairielearn/postgres';

import type { Course, CourseInstance } from '../lib/db-types.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { generateUsers } from '../models/user.js';

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
  let course_instance: CourseInstance | null = null;
  let course: Course | null = null;
  if (course_instance_id !== '') {
    course_instance = await selectOptionalCourseInstanceById(course_instance_id);
    if (!course_instance) {
      return { rows: [], columns };
    }
    course = await selectCourseById(course_instance.course_id);
  }
  const users =
    course_instance == null
      ? await runInTransactionAsync(() => generateUsers(Number(count)))
      : await generateAndEnrollUsers({ count: Number(count), course_instance_id });
  return {
    rows: users.map(({ id, uid, name }) => ({
      user_id: id,
      uid,
      name,
      course_id: course?.id,
      course: course?.short_name,
      course_instance_id: course_instance?.id,
      course_instance: course_instance?.short_name,
    })),
    columns,
  };
}
