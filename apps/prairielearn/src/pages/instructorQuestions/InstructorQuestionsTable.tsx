import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import {
  type CourseInstance,
  QuestionsTable,
  type SafeQuestionsPageData,
} from '../../components/QuestionsTable.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { CreateQuestionModal, type TemplateQuestion } from './CreateQuestionModal.js';
import { createInstructorQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider, useTRPC } from './trpc-context.js';

export interface InstructorQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: CourseInstance[];
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
  templateQuestions: TemplateQuestion[];
  csrfToken: string;
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
  templateQuestions,
  csrfToken,
}: InstructorQuestionsTableInnerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const trpc = useTRPC();

  return (
    <>
      <QuestionsTable
        questions={questions}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        showAddQuestionButton={showAddQuestionButton}
        showAiGenerateQuestionButton={showAiGenerateQuestionButton}
        showSharingSets={showSharingSets}
        urlPrefix={urlPrefix}
        qidPrefix={qidPrefix}
        questionsQueryOptions={trpc.questions.queryOptions()}
        onAddQuestion={() => setShowCreateModal(true)}
      />
      {showAddQuestionButton && (
        <CreateQuestionModal
          show={showCreateModal}
          templateQuestions={templateQuestions}
          csrfToken={csrfToken}
          onHide={() => setShowCreateModal(false)}
        />
      )}
    </>
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
