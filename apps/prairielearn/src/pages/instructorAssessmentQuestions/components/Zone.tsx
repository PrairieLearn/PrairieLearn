import { ZoneHeader } from '../../../components/AssessmentQuestions.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/index.js';

import { AlternativeGroup } from './AlternativeGroup.js';

export function Zone({
  zone,
  zoneNumber,
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  canEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  getNextQuestionNumber,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
  handleAddQuestion: (zoneNumber: number) => void;
  handleEditQuestion: ({
    question,
    alternativeGroup,
    zoneNumber,
    alternativeGroupNumber,
    alternativeNumber,
    handleAddQuestion,
  }: {
    question: ZoneQuestionJson | QuestionAlternativeJson;
    alternativeGroup?: ZoneQuestionJson;
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
    handleAddQuestion: (zoneNumber: number) => void;
  }) => void;
  handleDeleteQuestion: (
    zoneNumber: number,
    alternativeGroupNumber: number,
    questionId: string,
    numberInAlternativeGroup?: number,
  ) => void;
  handleResetButtonClick: (questionId: string) => void;
  getNextQuestionNumber: () => number;
}) {
  return (
    <>
      <ZoneHeader
        zone={zone}
        zoneNumber={zoneNumber}
        nTableCols={nTableCols}
        editMode={editMode}
        handleAddQuestion={handleAddQuestion}
      />
      {zone.questions.map((alternativeGroup, index) => (
        <AlternativeGroup
          key={alternativeGroup.id}
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={index + 1}
          nTableCols={nTableCols}
          zoneNumber={zoneNumber}
          questionMap={questionMap}
          editMode={editMode}
          urlPrefix={urlPrefix}
          hasCoursePermissionPreview={hasCoursePermissionPreview}
          canEdit={canEdit}
          showAdvanceScorePercCol={showAdvanceScorePercCol}
          assessmentType={assessmentType}
          handleEditQuestion={handleEditQuestion}
          handleDeleteQuestion={handleDeleteQuestion}
          handleResetButtonClick={handleResetButtonClick}
          getNextQuestionNumber={getNextQuestionNumber}
        />
      ))}
    </>
  );
}
