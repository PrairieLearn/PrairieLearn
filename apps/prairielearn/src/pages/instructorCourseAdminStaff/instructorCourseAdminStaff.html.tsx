import { hydrateHtml } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import type { CourseInstance } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { StaffTable } from './StaffTable.js';
import type { CourseUsersRow } from './instructorCourseAdminStaff.types.js';

export function InstructorCourseAdminStaff({
  resLocals,
  courseInstances,
  courseUsers,
  uidsLimit,
  search,
  trpcCsrfToken,
  courseId,
}: {
  resLocals: ResLocalsForPage<'course'>;
  courseInstances: CourseInstance[];
  courseUsers: CourseUsersRow[];
  uidsLimit: number;
  search: string;
  trpcCsrfToken: string;
  courseId: string;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Staff',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'staff',
    },
    options: {
      fullWidth: true,
      fullHeight: true,
    },
    content: hydrateHtml(
      <StaffTable
        trpcCsrfToken={trpcCsrfToken}
        courseId={courseId}
        courseInstances={courseInstances}
        courseUsers={courseUsers}
        authnUserId={resLocals.authn_user.id}
        userId={resLocals.user.id}
        isAdministrator={resLocals.is_administrator}
        uidsLimit={uidsLimit}
        search={search}
      />,
      { fullHeight: true },
    ),
  });
}
