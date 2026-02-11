import { Hydrate } from '@prairielearn/react/server';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import { type CourseRequestRow } from '../../lib/course-request.js';
import { type Institution } from '../../lib/db-types.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  coursesRoot,
  csrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  institutions: Institution[];
  coursesRoot: string;
  csrfToken: string;
  urlPrefix: string;
}) {
  return (
    <>
      <h1 className="visually-hidden">All Course Requests</h1>
      <Hydrate>
        <CourseRequestsTable
          rows={rows}
          institutions={institutions}
          coursesRoot={coursesRoot}
          csrfToken={csrfToken}
          urlPrefix={urlPrefix}
          showAll
        />
      </Hydrate>
    </>
  );
}
