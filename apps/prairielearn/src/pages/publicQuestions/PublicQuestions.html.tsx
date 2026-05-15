import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable } from '../../components/QuestionsTable.js';
import type { SafeQuestionsPageData } from '../../components/QuestionsTable.shared.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

interface PublicQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  courseId: string;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
}

export function PublicQuestionsTable({
  search,
  isDevMode,
  ...innerProps
}: PublicQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <QuestionsTable
          {...innerProps}
          questionsQueryOptions={{ queryKey: ['public-questions'] }}
          showAiGenerateQuestionButton={false}
          isPublic
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

PublicQuestionsTable.displayName = 'PublicQuestionsTable';
