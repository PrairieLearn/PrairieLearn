import { hydrateHtml } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import type { CourseInstance } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { StaffTable } from './StaffTable.js';
import { type CourseUsersRow, CourseUsersRowSchema } from './instructorCourseAdminStaff.types.js';

export { CourseUsersRowSchema };

export function InstructorCourseAdminStaff({
  resLocals,
  courseInstances,
  courseUsers,
  uidsLimit,
  githubAccessLink,
  search,
}: {
  resLocals: ResLocalsForPage<'course'>;
  courseInstances: CourseInstance[];
  courseUsers: CourseUsersRow[];
  uidsLimit: number;
  githubAccessLink: string | null;
  search: string;
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
        csrfToken={resLocals.__csrf_token}
        courseInstances={courseInstances}
        courseUsers={courseUsers}
        authnUserId={resLocals.authn_user.id}
        userId={resLocals.user.id}
        isAdministrator={resLocals.is_administrator}
        uidsLimit={uidsLimit}
        githubAccessLink={githubAccessLink}
        search={search}
      />,
      { fullHeight: true },
    ),
  });
}
