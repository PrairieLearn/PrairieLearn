import * as path from 'path';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import { computeCourseInstanceJsonHash } from '../../../lib/courseInstanceJson.js';

export async function getStudentLabelsTrpcProps({
  course,
  courseInstance,
  authnUserId,
}: {
  course: { path: string };
  courseInstance: { id: string; short_name: string | null };
  authnUserId: string;
}) {
  const trpcUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/trpc/student_labels`;

  const trpcCsrfToken = generatePrefixCsrfToken(
    {
      url: trpcUrl,
      authn_user_id: authnUserId,
    },
    config.secretKey,
  );

  const courseInstancePath = path.join(course.path, 'courseInstances', courseInstance.short_name!);
  const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
  const origHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);

  return { trpcUrl, trpcCsrfToken, origHash };
}
