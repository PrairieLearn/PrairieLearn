import { useState } from 'react';

import {
  type CourseInstance,
  QuestionsTable,
  type SafeQuestionsPageData,
} from '../../components/QuestionsTableTanstack.js';

import { CreateQuestionModal, type TemplateQuestion } from './CreateQuestionModal.js';

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
        search={search}
        isDevMode={isDevMode}
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

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
