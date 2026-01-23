import { useSortable } from '@dnd-kit/sortable';
import { type CSSProperties } from 'react';

import { run } from '@prairielearn/run';

import { AlternativeGroupHeader } from '../../../components/AssessmentQuestions.js';
import type { ZoneQuestionForm } from '../instructorAssessmentQuestions.shared.js';
import type { AssessmentState, HandleDeleteQuestion, HandleEditQuestion } from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';

export function AlternativeGroup({
  alternativeGroup,
  AssessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumberMap,
  sortableId,
}: {
  alternativeGroup: ZoneQuestionForm;
  AssessmentState: AssessmentState;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  questionNumberMap: Record<string, number>;
  sortableId: string;
}) {
  const hasAlternatives = (alternativeGroup.alternatives?.length ?? 0) > 1;

  // Look up the question number from the pre-computed map
  const questionNumber = questionNumberMap[sortableId] ?? 0;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
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
          nTableCols={AssessmentState.nTableCols}
        />
      )}
      {run(() => {
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

        return alternativeGroup.alternatives?.map((alternative, alternativeIndex) => {
          // Only apply sortable props to the first alternative in the group
          const isFirstAlternative = alternativeIndex === 0;
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
              sortableRef={isFirstAlternative ? setNodeRef : undefined}
              sortableStyle={isFirstAlternative ? sortableStyle : undefined}
              sortableAttributes={isFirstAlternative ? attributes : undefined}
              sortableListeners={isFirstAlternative ? listeners : undefined}
            />
          );
        });
      })}
    </>
  );
}
