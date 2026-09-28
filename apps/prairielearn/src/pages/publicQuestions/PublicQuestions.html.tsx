import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable } from '../../components/QuestionsTable.js';
import type { SafeQuestionsPageData } from '../../components/QuestionsTable.shared.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';

interface PublicQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  courseId: string;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
}

export function PublicQuestionsTable({ search, ...innerProps }: PublicQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient}>
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
