import { QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { QuestionsTable, type QuestionsTableProps } from '../../components/QuestionsTable.js';

import { createPublicQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider } from './trpc-context.js';

export function PublicQuestionsTable(props: Omit<QuestionsTableProps, 'fetchQuestions'>) {
  const [trpcClient] = useState(() => createPublicQuestionsTrpcClient());
  const [queryClient] = useState(() => new QueryClient());

  const fetchQuestions = useCallback(() => trpcClient.questions.query(), [trpcClient]);

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QuestionsTable fetchQuestions={fetchQuestions} {...props} />
    </TRPCProvider>
  );
}

PublicQuestionsTable.displayName = 'PublicQuestionsTable';
