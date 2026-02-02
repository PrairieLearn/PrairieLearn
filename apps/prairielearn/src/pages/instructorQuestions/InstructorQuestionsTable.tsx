import {
  type CourseInstance,
  type QuestionsPageData,
  QuestionsTable,
} from '../../components/QuestionsTableTanstack.js';

export interface InstructorQuestionsTableProps {
  questions: QuestionsPageData[];
  courseInstances: CourseInstance[];
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
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
}: InstructorQuestionsTableProps) {
  const handleAddQuestion = () => {
    // Open the modal using Bootstrap's Modal API
    const modal = document.getElementById('createQuestionModal');
    if (modal) {
      // Use dynamic import to avoid SSR issues
      void import('bootstrap').then(({ Modal }) => {
        Modal.getOrCreateInstance(modal).show();
      });
    }
  };

  return (
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
      onAddQuestion={handleAddQuestion}
    />
  );
}

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
