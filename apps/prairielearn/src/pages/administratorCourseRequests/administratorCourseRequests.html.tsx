import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import type { AdminInstitution } from '../../lib/client/safe-db-types.js';
import type { CourseRequestRow } from '../../lib/course-request.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  coursesRoot,
  csrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  institutions: AdminInstitution[];
  coursesRoot: string;
  csrfToken: string;
  urlPrefix: string;
}) {
  return (
    <>
      <h1 className="visually-hidden">All course requests</h1>
      <CourseRequestsTable
        rows={rows}
        institutions={institutions}
        coursesRoot={coursesRoot}
        csrfToken={csrfToken}
        urlPrefix={urlPrefix}
        showAll
      />
    </>
  );
}

AdministratorCourseRequests.displayName = 'AdministratorCourseRequests';
