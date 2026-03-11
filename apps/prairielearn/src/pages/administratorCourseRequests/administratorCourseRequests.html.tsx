import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import type { AdminInstitution } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { CourseRequestRow } from '../../lib/course-request.js';
import { createAdministratorTrpcClient } from '../../trpc/administrator/trpc-client.js';
import { TRPCProvider } from '../../trpc/administrator/trpc-context.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  coursesRoot,
  trpcCsrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  institutions: AdminInstitution[];
  coursesRoot: string;
  trpcCsrfToken: string;
  urlPrefix: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdministratorTrpcClient({ csrfToken: trpcCsrfToken }));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <h1 className="visually-hidden">All course requests</h1>
        <CourseRequestsTable
          rows={rows}
          institutions={institutions}
          coursesRoot={coursesRoot}
          urlPrefix={urlPrefix}
          showAll
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdministratorCourseRequests.displayName = 'AdministratorCourseRequests';
