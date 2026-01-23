import { useSortable } from '@dnd-kit/sortable';
import type { CSSProperties, Dispatch } from 'react';

import { run } from '@prairielearn/run';

import { AlternativeGroupHeader } from '../../../components/AssessmentQuestions.js';
import type { ZoneQuestionForm } from '../instructorAssessmentQuestions.shared.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  getTableColumnCount,
} from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';

/**
 * Renders both individual question, and alternative questions.
 * Rendered by the AssessmentZone component.
 */
export function AlternativeGroup({
  alternativeGroup,
  AssessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  sortableId,
  collapsedGroups,
  dispatch,
}: {
  alternativeGroup: ZoneQuestionForm;
  AssessmentState: AssessmentState;
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
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <>
      {hasAlternatives && (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={questionNumber}
          nTableCols={getTableColumnCount(AssessmentState)}
          questionMetadata={AssessmentState.questionMetadata}
          urlPrefix={AssessmentState.urlPrefix}
          isCollapsed={isCollapsed}
          editMode={AssessmentState.editMode}
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
                AssessmentState={AssessmentState}
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
                AssessmentState={AssessmentState}
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
