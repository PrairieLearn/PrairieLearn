import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type {
  CourseQuestionForPicker,
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import { findQuestionByTrackingId } from '../../utils/useAssessmentEditor.js';

import { AltGroupDetailPanel } from './AltGroupDetailPanel.js';
import { EmptyDetailPanel } from './EmptyDetailPanel.js';
import { QuestionDetailPanel } from './QuestionDetailPanel.js';
import { QuestionPickerPanel } from './QuestionPickerPanel.js';
import { ZoneDetailPanel } from './ZoneDetailPanel.js';

export function DetailPanel({
  selectedItem,
  zones,
  questionMetadata,
  editMode,
  assessmentType,
  urlPrefix,
  courseId,
  hasCoursePermissionPreview,
  courseQuestions,
  courseQuestionsLoading,
  questionsInAssessment,
  currentAssessmentId,
  onUpdateZone,
  onUpdateQuestion,
  onDeleteQuestion,
  onDeleteZone,
  onQuestionPicked,
  onPickQuestion,
  onResetButtonClick,
}: {
  selectedItem: SelectedItem;
  zones: ZoneAssessmentForm[];
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  assessmentType: EnumAssessmentType;
  urlPrefix: string;
  courseId: string;
  hasCoursePermissionPreview: boolean;
  courseQuestions: CourseQuestionForPicker[];
  courseQuestionsLoading: boolean;
  questionsInAssessment: Set<string>;
  currentAssessmentId: string;
  onUpdateZone: (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => void;
  onUpdateQuestion: (
    questionTrackingId: string,
    question: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
  onQuestionPicked: (qid: string) => void;
  onPickQuestion: (currentSelection: SelectedItem) => void;
  onResetButtonClick: (assessmentQuestionId: string) => void;
}) {
  if (selectedItem == null) {
    return <EmptyDetailPanel />;
  }

  if (selectedItem.type === 'zone') {
    const zone = zones.find((z) => z.trackingId === selectedItem.zoneTrackingId);
    if (!zone) return <EmptyDetailPanel />;
    return (
      <ZoneDetailPanel
        zone={zone}
        editMode={editMode}
        onUpdate={onUpdateZone}
        onDelete={onDeleteZone}
      />
    );
  }

  if (selectedItem.type === 'question') {
    const result = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
    if (!result) return <EmptyDetailPanel />;
    const { question } = result;
    const questionData = question.id ? questionMetadata[question.id] : null;
    return (
      <QuestionDetailPanel
        question={question}
        questionData={questionData ?? null}
        editMode={editMode}
        assessmentType={assessmentType}
        urlPrefix={urlPrefix}
        hasCoursePermissionPreview={hasCoursePermissionPreview}
        onUpdate={onUpdateQuestion}
        onDelete={onDeleteQuestion}
        onPickQuestion={onPickQuestion}
        onResetButtonClick={onResetButtonClick}
      />
    );
  }

  if (selectedItem.type === 'alternative') {
    const blockResult = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
    if (!blockResult) return <EmptyDetailPanel />;
    const block = blockResult.question;
    const alternative = block.alternatives?.find(
      (a) => a.trackingId === selectedItem.alternativeTrackingId,
    );
    if (!alternative) return <EmptyDetailPanel />;
    const altData = alternative.id ? questionMetadata[alternative.id] : null;
    return (
      <QuestionDetailPanel
        question={alternative}
        zoneQuestionBlock={block}
        questionData={altData ?? null}
        editMode={editMode}
        assessmentType={assessmentType}
        urlPrefix={urlPrefix}
        hasCoursePermissionPreview={hasCoursePermissionPreview}
        onUpdate={onUpdateQuestion}
        onDelete={onDeleteQuestion}
        onPickQuestion={onPickQuestion}
        onResetButtonClick={onResetButtonClick}
      />
    );
  }

  if (selectedItem.type === 'altGroup') {
    const altGroupResult = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
    if (!altGroupResult) return <EmptyDetailPanel />;
    const block = altGroupResult.question;
    return (
      <AltGroupDetailPanel
        zoneQuestionBlock={block}
        editMode={editMode}
        assessmentType={assessmentType}
        onUpdate={onUpdateQuestion}
        onDelete={onDeleteQuestion}
      />
    );
  }

  if (selectedItem.type === 'altGroupPicker') {
    return (
      <QuestionPickerPanel
        courseQuestions={courseQuestions}
        isLoading={courseQuestionsLoading}
        questionsInAssessment={questionsInAssessment}
        courseId={courseId}
        urlPrefix={urlPrefix}
        currentAssessmentId={currentAssessmentId}
        onQuestionSelected={onQuestionPicked}
      />
    );
  }

  // selectedItem.type === 'picker'
  return (
    <QuestionPickerPanel
      courseQuestions={courseQuestions}
      isLoading={courseQuestionsLoading}
      questionsInAssessment={questionsInAssessment}
      courseId={courseId}
      urlPrefix={urlPrefix}
      currentAssessmentId={currentAssessmentId}
      onQuestionSelected={onQuestionPicked}
    />
  );
}
