import { useSortable } from '@dnd-kit/sortable';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { QuestionAlternativeForm, TreeState, ZoneQuestionBlockForm } from '../../types.js';

import { TreeQuestionRow } from './TreeQuestionRow.js';
import { makeDraggableStyle } from './dragUtils.js';

export function SortableAlternativeRow({
  alternative,
  zoneQuestionBlock,
  questionData,
  state,
  isSelected,
  onClick,
  onDelete,
}: {
  alternative: QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  questionData: StaffAssessmentQuestionRow | null;
  state: TreeState;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: alternative.trackingId,
    data: { type: 'alternative', parentTrackingId: zoneQuestionBlock.trackingId },
    disabled: !state.editMode,
  });

  const draggableStyle = makeDraggableStyle({ isDragging, transform, transition });

  return (
    <div ref={setNodeRef} style={draggableStyle}>
      <TreeQuestionRow
        question={alternative}
        zoneQuestionBlock={zoneQuestionBlock}
        questionData={questionData}
        state={state}
        isSelected={isSelected}
        draggableAttributes={attributes}
        draggableListeners={listeners}
        isAlternative
        onClick={onClick}
        onDelete={onDelete}
      />
    </div>
  );
}
