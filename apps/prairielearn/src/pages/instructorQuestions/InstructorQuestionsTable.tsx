import { QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
  type CourseInstance,
  QuestionsTable,
  type SafeQuestionsPageData,
} from '../../components/QuestionsTable.js';

import { CreateQuestionModal, type TemplateQuestion } from './CreateQuestionModal.js';
import { createInstructorQuestionsTrpcClient } from './trpc-client.js';
import { TRPCProvider } from './trpc-context.js';

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

export function InstructorQuestionsTable({
  questions,
  courseInstances,
  currentCourseInstanceId,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  qidPrefix,
  search,
  isDevMode,
  templateQuestions,
  csrfToken,
}: InstructorQuestionsTableProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [trpcClient] = useState(() => createInstructorQuestionsTrpcClient());
  const [queryClient] = useState(() => new QueryClient());

  const fetchQuestions = useCallback(() => trpcClient.questions.query(), [trpcClient]);

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QuestionsTable
        questions={questions}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        showAddQuestionButton={showAddQuestionButton}
        showAiGenerateQuestionButton={showAiGenerateQuestionButton}
        showSharingSets={showSharingSets}
        urlPrefix={urlPrefix}
        qidPrefix={qidPrefix}
        search={search}
        isDevMode={isDevMode}
        fetchQuestions={fetchQuestions}
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
    </TRPCProvider>
  );
}

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
