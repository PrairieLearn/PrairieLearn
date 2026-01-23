import { useSortable } from '@dnd-kit/sortable';
import { type CSSProperties, Fragment } from 'react';

import { run } from '@prairielearn/run';

import { AlternativeGroupHeader } from '../../../components/AssessmentQuestions.js';
import type { ZoneQuestionForm } from '../instructorAssessmentQuestions.shared.js';
import type { AssessmentState, HandleDeleteQuestion, HandleEditQuestion } from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';

export function AlternativeGroup({
  alternativeGroup,
  alternativeGroupNumber,
  zoneNumber,
  AssessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumberMap,
  sortableId,
}: {
  alternativeGroup: ZoneQuestionForm;
  alternativeGroupNumber: number;
  zoneNumber: number;
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

  // For table rows, only apply Y translation to prevent squishing
  // The scaleX/scaleY can cause issues with table layout
  const sortableStyle: CSSProperties = {
    opacity: isDragging ? 0.6 : 1,
    transform: transform ? `translateY(${transform.y}px)` : undefined,
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <Fragment>
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
              zoneNumber={zoneNumber}
              alternativeGroupNumber={alternativeGroupNumber}
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

        return alternativeGroup.alternatives?.map((alternative, alternativeNumber) => {
          // Only apply sortable props to the first alternative in the group
          const isFirstAlternative = alternativeNumber === 0;
          return (
            <AssessmentQuestion
              key={alternative.id}
              alternative={alternative}
              alternativeGroup={alternativeGroup}
              zoneNumber={zoneNumber}
              alternativeGroupNumber={alternativeGroupNumber}
              alternativeNumber={alternativeNumber}
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
    </Fragment>
  );
}
