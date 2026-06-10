import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminInstitutionWithSettings } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { CourseRequestRow } from '../../lib/course-request.js';
import type { Timezone } from '../../lib/timezone.shared.js';
import { createAdministratorTrpcClient } from '../../trpc/administrator/client.js';
import { TRPCProvider } from '../../trpc/administrator/context.js';

import { CourseRequestsTable } from './components/CourseRequestsTable.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  availableTimezones,
  coursesRoot,
  defaultGithubCourseOwner,
  trpcCsrfToken,
  aiSecretsConfigured,
  showAll,
}: {
  rows: CourseRequestRow[];
  institutions: AdminInstitutionWithSettings[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  defaultGithubCourseOwner: string;
  trpcCsrfToken: string;
  aiSecretsConfigured: boolean;
  showAll: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdministratorTrpcClient({ csrfToken: trpcCsrfToken }));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseRequestsTable
          rows={rows}
          institutions={institutions}
          availableTimezones={availableTimezones}
          coursesRoot={coursesRoot}
          defaultGithubCourseOwner={defaultGithubCourseOwner}
          aiSecretsConfigured={aiSecretsConfigured}
          showAll={showAll}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdministratorCourseRequests.displayName = 'AdministratorCourseRequests';
