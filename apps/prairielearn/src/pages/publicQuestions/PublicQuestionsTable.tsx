import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable, type QuestionsTableProps } from '../../components/QuestionsTable.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { createPublicQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider, useTRPC } from './trpc-context.js';

export interface PublicQuestionsTableProps extends Omit<
  QuestionsTableProps,
  'questionsQueryOptions'
> {
  search: string;
  isDevMode: boolean;
}

type PublicQuestionsTableInnerProps = Omit<PublicQuestionsTableProps, 'search' | 'isDevMode'>;

function PublicQuestionsTableInner(props: PublicQuestionsTableInnerProps) {
  const trpc = useTRPC();

  return <QuestionsTable questionsQueryOptions={trpc.questions.queryOptions()} {...props} />;
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
