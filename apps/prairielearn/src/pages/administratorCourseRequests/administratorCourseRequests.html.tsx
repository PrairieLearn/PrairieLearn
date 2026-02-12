import type { z } from 'zod';

import { Hydrate } from '@prairielearn/react/server';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import type { RawAdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import type { CourseRequestRow } from '../../lib/course-request.js';

type AdminInstitution = z.infer<typeof RawAdminInstitutionSchema>;

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
