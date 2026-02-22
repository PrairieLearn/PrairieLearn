import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable, type SafeQuestionsPageData } from '../../components/QuestionsTable.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { createPublicQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider, useTRPC } from './trpc-context.js';

export interface PublicQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
}

type PublicQuestionsTableInnerProps = Omit<PublicQuestionsTableProps, 'search' | 'isDevMode'>;

function PublicQuestionsTableInner(props: PublicQuestionsTableInnerProps) {
  const trpc = useTRPC();

  return (
    <QuestionsTable
      {...props}
      questionsQueryOptions={trpc.questions.queryOptions()}
      showAiGenerateQuestionButton={false}
    />
  );
}

export function PublicQuestionsTable({
  search,
  isDevMode,
  ...innerProps
}: PublicQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createPublicQuestionsTrpcClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <PublicQuestionsTableInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

PublicQuestionsTable.displayName = 'PublicQuestionsTable';
