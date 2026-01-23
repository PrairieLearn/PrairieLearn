import { useSortable } from '@dnd-kit/sortable';
import type { CSSProperties, Dispatch } from 'react';

import { run } from '@prairielearn/run';

import type { ZoneQuestionForm } from '../instructorAssessmentQuestions.shared.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  getTableColumnCount,
} from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';
import { AlternativeGroupHeader } from './Headers.js';

/**
 * Renders both individual question, and alternative questions.
 * Rendered by the AssessmentZone component.
 */
export function AlternativeGroup({
  alternativeGroup,
  assessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  sortableId,
  collapsedGroups,
  dispatch,
}: {
  alternativeGroup: ZoneQuestionForm;
  assessmentState: AssessmentState;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  sortableId: string;
  collapsedGroups: Set<string>;
  dispatch: Dispatch<EditorAction>;
}) {
  const hasAlternatives = (alternativeGroup.alternatives?.length ?? 0) > 1;
  const isCollapsed = collapsedGroups.has(alternativeGroup.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_GROUP_COLLAPSE', trackingId: alternativeGroup.trackingId });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: 'question' },
  });

  const sortableStyle: CSSProperties = {
    opacity: isDragging ? 0.6 : 1,
    // For table rows, only apply Y translation to prevent squishing
    transform: transform ? `translateY(${transform.y}px)` : undefined,
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <>
      {hasAlternatives && (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={questionNumber}
          nTableCols={getTableColumnCount(assessmentState)}
          questionMetadata={assessmentState.questionMetadata}
          urlPrefix={assessmentState.urlPrefix}
          isCollapsed={isCollapsed}
          editMode={assessmentState.editMode}
          sortableRef={setNodeRef}
          sortableStyle={sortableStyle}
          sortableAttributes={attributes}
          sortableListeners={listeners}
          onToggle={toggleCollapse}
        />
      )}
      {(!isCollapsed || !hasAlternatives) &&
        run(() => {
          if (!hasAlternatives) {
            return (
              <AssessmentQuestion
                id={alternativeGroup.id}
                alternativeGroup={alternativeGroup}
                assessmentState={assessmentState}
                handleEditQuestion={handleEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleResetButtonClick={handleResetButtonClick}
                questionNumber={questionNumber}
                sortableRef={setNodeRef}
                sortableStyle={sortableStyle}
                sortableAttributes={attributes}
                sortableListeners={listeners}
              />
            );
          }

          // Sortable props are on AlternativeGroupHeader, not on individual questions
          return alternativeGroup.alternatives?.map((alternative, alternativeIndex) => {
            return (
              <AssessmentQuestion
                key={alternative.trackingId}
                alternative={alternative}
                alternativeGroup={alternativeGroup}
                alternativeIndex={alternativeIndex}
                assessmentState={assessmentState}
                handleEditQuestion={handleEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleResetButtonClick={handleResetButtonClick}
                questionNumber={questionNumber}
                alternativeGroupAutoPoints={
                  alternativeGroup.points ?? alternativeGroup.autoPoints ?? null
                }
              />
            );
          });
        })}
    </>
  );
}
