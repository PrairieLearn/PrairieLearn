import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type {
  CourseQuestionForPicker,
  DetailActions,
  DetailState,
  SelectedItem,
  ZoneAssessmentForm,
} from '../../types.js';
import { findQuestionByTrackingId } from '../../utils/useAssessmentEditor.js';

import { AltGroupDetailPanel } from './AltGroupDetailPanel.js';
import { QuestionDetailPanel } from './QuestionDetailPanel.js';
import { QuestionPickerPanel } from './QuestionPickerPanel.js';
import { ZoneDetailPanel } from './ZoneDetailPanel.js';

export function DetailPanel({
  selectedItem,
  zones,
  questionMetadata,
  state,
  actions,
  courseQuestions,
  courseQuestionsLoading,
  questionsInAssessment,
  disabledQids,
  currentChangeQid,
  currentAssessmentId,
  isPickingQuestion,
  pickerError,
}: {
  selectedItem: SelectedItem;
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>;
  state: DetailState;
  actions: DetailActions;
  courseQuestions: CourseQuestionForPicker[];
  courseQuestionsLoading: boolean;
  questionsInAssessment: Map<string, string[]>;
  disabledQids: Set<string>;
  currentChangeQid?: string;
  currentAssessmentId: string;
  isPickingQuestion?: boolean;
  pickerError: Error | null;
}) {
  if (selectedItem == null) {
    return null;
  }

  // The `key` props on each detail panel below are critical. Without them,
  // switching between two items of the same type (e.g., two questions) reuses
  // the React instance. react-hook-form's `values` option then overwrites the
  // old form state before the unmount cleanup in useAutoSave can flush it,
  // silently dropping the user's last edit.
  switch (selectedItem.type) {
    case 'zone': {
      const zoneIndex = zones.findIndex((z) => z.trackingId === selectedItem.zoneTrackingId);
      const zone = zoneIndex !== -1 ? zones[zoneIndex] : undefined;
      if (!zone) throw new Error(`Zone not found: ${selectedItem.zoneTrackingId}`);
      return (
        <ZoneDetailPanel
          key={zone.trackingId}
          zone={zone}
          zoneIndex={zoneIndex}
          idPrefix={`zone-${zone.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateZone}
          onDelete={actions.onDeleteZone}
        />
      );
    }

    case 'question': {
      const result = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (!result) throw new Error(`Question not found: ${selectedItem.questionTrackingId}`);
      const { question, zone } = result;
      const questionData = (question.id ? questionMetadata[question.id] : null) ?? null;
      return (
        <QuestionDetailPanel
          key={question.trackingId}
          question={question}
          zone={zone}
          questionData={questionData ?? null}
          idPrefix={`question-${question.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onDelete={actions.onDeleteQuestion}
          onPickQuestion={actions.onPickQuestion}
          onResetButtonClick={actions.onResetButtonClick}
        />
      );
    }

    case 'alternative': {
      const blockResult = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (!blockResult) {
        throw new Error(`Question block not found: ${selectedItem.questionTrackingId}`);
      }
      const block = blockResult.question;
      const zone = blockResult.zone;
      const alternative = block.alternatives?.find(
        (a) => a.trackingId === selectedItem.alternativeTrackingId,
      );
      if (!alternative) {
        throw new Error(`Alternative not found: ${selectedItem.alternativeTrackingId}`);
      }
      const altData = (alternative.id ? questionMetadata[alternative.id] : null) ?? null;
      return (
        <QuestionDetailPanel
          key={alternative.trackingId}
          question={alternative}
          zoneQuestionBlock={block}
          zone={zone}
          questionData={altData ?? null}
          idPrefix={`alt-${alternative.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onDelete={actions.onDeleteQuestion}
          onPickQuestion={actions.onPickQuestion}
          onResetButtonClick={actions.onResetButtonClick}
        />
      );
    }

    case 'altGroup': {
      const altGroupResult = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (!altGroupResult) {
        throw new Error(`Alt group not found: ${selectedItem.questionTrackingId}`);
      }
      const block = altGroupResult.question;
      return (
        <AltGroupDetailPanel
          key={block.trackingId}
          zoneQuestionBlock={block}
          zone={altGroupResult.zone}
          questionMetadata={questionMetadata}
          idPrefix={`altgroup-${block.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onDelete={(trackingId) => actions.onDeleteQuestion(trackingId, '')}
        />
      );
    }

    case 'picker':
    case 'altGroupPicker':
      return (
        <QuestionPickerPanel
          courseQuestions={courseQuestions}
          isLoading={courseQuestionsLoading}
          questionsInAssessment={questionsInAssessment}
          disabledQids={disabledQids}
          currentChangeQid={currentChangeQid}
          courseId={state.courseId}
          courseInstanceId={state.courseInstanceId}
          currentAssessmentId={currentAssessmentId}
          isPickingQuestion={isPickingQuestion}
          pickerError={pickerError}
          onQuestionSelected={actions.onQuestionPicked}
          onRemoveQuestionByQid={actions.onRemoveQuestionByQid}
        />
      );
  }
}
