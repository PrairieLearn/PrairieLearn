import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable } from '../../components/QuestionsTable.js';
import type { SafeQuestionsPageData } from '../../components/QuestionsTable.shared.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';

import { QuestionSelectionToolbar } from './components/QuestionSelectionToolbar.js';

interface InstructorQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  courseId: string;
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showImportQuestionsButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  canEditQuestions: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  trpcCsrfToken: string;
  search: string;
  isDevMode: boolean;
}

type InstructorQuestionsTableInnerProps = Omit<
  InstructorQuestionsTableProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

function InstructorQuestionsTableInner({
  questions,
  courseInstances,
  courseId,
  currentCourseInstanceId,
  showAddQuestionButton,
  showImportQuestionsButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  canEditQuestions,
  urlPrefix,
  qidPrefix,
}: InstructorQuestionsTableInnerProps) {
  const trpc = useTRPC();

  return (
    <QuestionsTable
      questions={questions}
      courseInstances={courseInstances}
      courseId={courseId}
      currentCourseInstanceId={currentCourseInstanceId}
      showAiGenerateQuestionButton={showAiGenerateQuestionButton}
      showSharingSets={showSharingSets}
      urlPrefix={urlPrefix}
      qidPrefix={qidPrefix}
      questionsQueryOptions={trpc.questions.list.queryOptions()}
      addQuestionUrl={
        showAddQuestionButton ? `${urlPrefix}/course_admin/questions/create` : undefined
      }
      showImportQuestionsButton={showImportQuestionsButton}
      renderSelectionToolbar={
        canEditQuestions
          ? ({ selectedQuestions, clearSelection }) => (
              <QuestionSelectionToolbar
                selectedQuestions={selectedQuestions}
                clearSelection={clearSelection}
                courseInstances={courseInstances}
                currentCourseInstanceId={currentCourseInstanceId}
                urlPrefix={urlPrefix}
              />
            )
          : undefined
      }
    />
  );
}

export function InstructorQuestionsTable({
  search,
  isDevMode,
  trpcCsrfToken,
  courseId,
  ...innerProps
}: InstructorQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <InstructorQuestionsTableInner courseId={courseId} {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
