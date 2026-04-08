import type { EditorQuestionMetadata } from '../../../../lib/assessment-question.shared.js';
import {
  type CourseQuestionForPicker,
  type DetailActions,
  type DetailState,
  type SelectedItem,
  type ZoneAssessmentForm,
  assertStandaloneQuestion,
} from '../../types.js';
import { findQuestionByTrackingId } from '../../utils/zoneLookup.js';

import { AltPoolDetailPanel } from './AltPoolDetailPanel.js';
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
  questionSharingEnabled,
  consumePublicQuestionsEnabled,
}: {
  selectedItem: SelectedItem;
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, EditorQuestionMetadata>>;
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
  questionSharingEnabled: boolean;
  consumePublicQuestionsEnabled: boolean;
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
          zones={zones}
          zoneIndex={zoneIndex}
          idPrefix={`zone-${zone.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateZone}
          onFormValidChange={actions.onFormValidChange}
        />
      );
    }

    case 'question': {
      const result = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (!result) throw new Error(`Question not found: ${selectedItem.questionTrackingId}`);
      const { question, zone } = result;
      assertStandaloneQuestion(question);
      const questionData = questionMetadata[question.id] ?? null;
      return (
        <QuestionDetailPanel
          key={question.trackingId}
          question={question}
          zone={zone}
          questionData={questionData}
          idPrefix={`question-${question.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onPickQuestion={actions.onPickQuestion}
          onResetButtonClick={actions.onResetButtonClick}
          onFormValidChange={actions.onFormValidChange}
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
      const altData = questionMetadata[alternative.id] ?? null;
      return (
        <QuestionDetailPanel
          key={alternative.trackingId}
          question={alternative}
          zoneQuestionBlock={block}
          zone={zone}
          questionData={altData}
          idPrefix={`alt-${alternative.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onPickQuestion={actions.onPickQuestion}
          onResetButtonClick={actions.onResetButtonClick}
          onFormValidChange={actions.onFormValidChange}
        />
      );
    }

    case 'altPool': {
      const altPoolResult = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
      if (!altPoolResult) {
        throw new Error(`Alt pool not found: ${selectedItem.questionTrackingId}`);
      }
      const block = altPoolResult.question;
      return (
        <AltPoolDetailPanel
          key={block.trackingId}
          zoneQuestionBlock={block}
          zone={altPoolResult.zone}
          questionMetadata={questionMetadata}
          idPrefix={`altpool-${block.trackingId}`}
          state={state}
          onUpdate={actions.onUpdateQuestion}
          onFormValidChange={actions.onFormValidChange}
          onDismissBanner={actions.onDismissBanner}
        />
      );
    }

    case 'picker':
    case 'altPoolPicker':
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
          questionSharingEnabled={questionSharingEnabled}
          consumePublicQuestionsEnabled={consumePublicQuestionsEnabled}
          onQuestionSelected={actions.onQuestionPicked}
          onRemoveQuestionByQid={actions.onRemoveQuestionByQid}
        />
      );
  }
}
