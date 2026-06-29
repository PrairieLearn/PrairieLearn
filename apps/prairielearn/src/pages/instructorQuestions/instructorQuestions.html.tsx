import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable } from '../../components/QuestionsTable.js';
import type { SafeQuestionsPageData } from '../../components/QuestionsTable.shared.js';
import type {
  PublicCourseInstance,
  PublicTag,
  PublicTopic,
} from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';

import { QuestionSelectionToolbar } from './components/QuestionSelectionToolbar.js';

interface InstructorQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  topics: PublicTopic[];
  tags: PublicTag[];
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
  topics,
  tags,
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <>
      {successMessage && (
        <Alert
          variant="success"
          className="mb-3"
          dismissible
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}
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
            ? ({ selectedQuestions, clearSelection, trimSelection }) => (
                <QuestionSelectionToolbar
                  selectedQuestions={selectedQuestions}
                  clearSelection={clearSelection}
                  topics={topics}
                  tags={tags}
                  courseInstances={courseInstances}
                  currentCourseInstanceId={currentCourseInstanceId}
                  trimSelection={trimSelection}
                  urlPrefix={urlPrefix}
                  onActionSuccess={setSuccessMessage}
                />
              )
            : undefined
        }
      />
    </>
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
