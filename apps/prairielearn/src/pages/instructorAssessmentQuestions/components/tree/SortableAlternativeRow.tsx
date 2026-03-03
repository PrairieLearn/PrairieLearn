import { useSortable } from '@dnd-kit/sortable';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, ViewType, ZoneQuestionBlockForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';

import { TreeQuestionRow } from './TreeQuestionRow.js';
import { makeSortableStyle } from './sortableUtils.js';

export function SortableAlternativeRow({
  alternative,
  zoneQuestionBlock,
  questionData,
  editMode,
  viewType,
  isSelected,
  changeTracking,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  onClick,
  onDelete,
}: {
  alternative: QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  questionData: StaffAssessmentQuestionRow | null;
  editMode: boolean;
  viewType: ViewType;
  isSelected: boolean;
  changeTracking: ChangeTrackingResult;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: alternative.trackingId,
    data: { type: 'alternative' },
    disabled: !editMode,
  });

  const sortableStyle = makeSortableStyle({ isDragging, transform, transition });

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      <TreeQuestionRow
        question={alternative}
        zoneQuestionBlock={zoneQuestionBlock}
        questionData={questionData}
        editMode={editMode}
        viewType={viewType}
        isSelected={isSelected}
        changeTracking={changeTracking}
        urlPrefix={urlPrefix}
        hasCoursePermissionPreview={hasCoursePermissionPreview}
        assessmentType={assessmentType}
        sortableAttributes={editMode ? attributes : undefined}
        sortableListeners={editMode ? listeners : undefined}
        isAlternative
        onClick={onClick}
        onDelete={onDelete}
      />
    </div>
  );
}
