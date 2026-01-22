import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { ZoneHeader } from '../../../components/AssessmentQuestions.js';
import type { ZoneAssessmentJson } from '../../../schemas/index.js';
import type { HandleDeleteQuestion, HandleEditQuestion } from '../types.js';

import { AlternativeGroup } from './AlternativeGroup.js';
import type { AssessmentState } from './InstructorAssessmentQuestionsTable.js';

export function Zone({
  zone,
  zoneNumber,
  AssessmentState,
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  handleEditZone,
  handleDeleteZone,
  questionNumberMap,
  sortableIds,
  activeId,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  AssessmentState: AssessmentState;
  handleAddQuestion: (zoneNumber: number) => void;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  handleEditZone: (zoneNumber: number) => void;
  handleDeleteZone: (zoneNumber: number) => void;
  questionNumberMap: Record<string, number>;
  sortableIds: string[];
  activeId: string | null;
}) {
  const { nTableCols, editMode } = AssessmentState;

  // Create a droppable zone for dropping questions into this zone
  const droppableId = `zone-${zoneNumber - 1}-droppable`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
  });

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <ZoneHeader
        zone={zone}
        zoneNumber={zoneNumber}
        nTableCols={nTableCols}
        editMode={editMode}
        handleAddQuestion={handleAddQuestion}
        handleEditZone={handleEditZone}
        handleDeleteZone={handleDeleteZone}
      />
      {zone.questions.map((alternativeGroup, index) => {
        // Use the stable sortable ID from the pre-computed array
        const stableId = sortableIds[index];
        return (
          <AlternativeGroup
            key={stableId}
            alternativeGroup={alternativeGroup}
            alternativeGroupNumber={index + 1}
            AssessmentState={AssessmentState}
            zoneNumber={zoneNumber}
            handleEditQuestion={handleEditQuestion}
            handleDeleteQuestion={handleDeleteQuestion}
            handleResetButtonClick={handleResetButtonClick}
            questionNumberMap={questionNumberMap}
            sortableId={stableId}
          />
        );
      })}
      {/* Empty zone warning - visible when zone has no questions and NOT dragging */}
      {editMode && zone.questions.length === 0 && !activeId && (
        <tr className="bg-warning-subtle">
          <td colSpan={nTableCols} className="text-center py-3">
            <i className="fa fa-exclamation-triangle text-warning me-2" aria-hidden="true" />
            This zone has no questions. Add questions or delete this zone before saving.
          </td>
        </tr>
      )}
      {/* Drop zone - single element that adapts based on empty/non-empty zone state */}
      {editMode && activeId && (
        <tr
          ref={setNodeRef}
          data-testid={droppableId}
          className={zone.questions.length === 0 ? (isOver ? 'bg-primary-subtle' : 'bg-warning-subtle') : undefined}
          style={{
            height: zone.questions.length === 0 ? undefined : isOver ? 40 : 20,
            backgroundColor:
              zone.questions.length === 0 ? undefined : isOver ? 'rgba(0, 123, 255, 0.1)' : undefined,
            transition: 'all 0.2s ease',
          }}
        >
          <td
            colSpan={nTableCols}
            className={zone.questions.length === 0 ? 'text-center py-3' : undefined}
            style={{
              border: isOver ? '2px dashed #007bff' : 'none',
              textAlign: 'center',
              color: zone.questions.length === 0 || isOver ? undefined : 'transparent',
              fontSize: zone.questions.length === 0 ? undefined : '0.85em',
            }}
          >
            {zone.questions.length === 0 ? (
              isOver ? (
                <span className="text-primary">
                  <i className="fa fa-plus-circle me-2" aria-hidden="true" />
                  Drop here to add to this zone
                </span>
              ) : (
                <>
                  <i className="fa fa-exclamation-triangle text-warning me-2" aria-hidden="true" />
                  Drop questions here or delete this zone before saving.
                </>
              )
            ) : (
              isOver && 'Drop here'
            )}
          </td>
        </tr>
      )}
    </SortableContext>
  );
}
