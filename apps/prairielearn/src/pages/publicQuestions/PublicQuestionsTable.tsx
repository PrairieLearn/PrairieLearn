import { useCallback, useState } from 'react';
import { z } from 'zod';

import { SafeQuestionsPageDataSchema } from '../../components/QuestionsTable.shared.js';
import {
  QuestionsTable,
  type QuestionsTableProps,
} from '../../components/QuestionsTable.js';

import { createPublicQuestionsTrpcClient } from './trpc-client.js';

export function PublicQuestionsTable(props: Omit<QuestionsTableProps, 'fetchQuestions'>) {
  const [trpcClient] = useState(() => createPublicQuestionsTrpcClient());

  const fetchQuestions = useCallback(async () => {
    const data = await trpcClient.questions.query();
    return z.array(SafeQuestionsPageDataSchema).parse(data);
  }, [trpcClient]);

  return <QuestionsTable fetchQuestions={fetchQuestions} {...props} />;
}

PublicQuestionsTable.displayName = 'PublicQuestionsTable';
