import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable, type SafeQuestionsPageData } from '../../components/QuestionsTable.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { createInstructorQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider, useTRPC } from './trpc-context.js';

export interface InstructorQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
}

type InstructorQuestionsTableInnerProps = Omit<
  InstructorQuestionsTableProps,
  'search' | 'isDevMode'
>;

function InstructorQuestionsTableInner({
  questions,
  courseInstances,
  currentCourseInstanceId,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  qidPrefix,
}: InstructorQuestionsTableInnerProps) {
  const trpc = useTRPC();

  return (
    <QuestionsTable
      questions={questions}
      courseInstances={courseInstances}
      currentCourseInstanceId={currentCourseInstanceId}
      showAiGenerateQuestionButton={showAiGenerateQuestionButton}
      showSharingSets={showSharingSets}
      urlPrefix={urlPrefix}
      qidPrefix={qidPrefix}
      questionsQueryOptions={trpc.questions.queryOptions()}
      addQuestionUrl={
        showAddQuestionButton ? `${urlPrefix}/course_admin/questions/create` : undefined
      }
    />
  );
}

export function InstructorQuestionsTable({
  search,
  isDevMode,
  ...innerProps
}: InstructorQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createInstructorQuestionsTrpcClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <InstructorQuestionsTableInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
