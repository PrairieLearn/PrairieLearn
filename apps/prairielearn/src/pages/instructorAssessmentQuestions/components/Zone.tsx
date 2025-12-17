import { ZoneHeader } from '../../../components/AssessmentQuestions.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/index.js';

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
  getNextQuestionNumber,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  AssessmentState: AssessmentState;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  handleAddQuestion: (zoneNumber: number) => void;
  handleEditQuestion: ({
    question,
    alternativeGroup,
    zoneNumber,
    alternativeGroupNumber,
    alternativeNumber,
  }: {
    question: ZoneQuestionJson | QuestionAlternativeJson;
    alternativeGroup?: ZoneQuestionJson;
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
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
  const { nTableCols, editMode } = AssessmentState;
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
          AssessmentState={AssessmentState}
          zoneNumber={zoneNumber}
          handleEditQuestion={handleEditQuestion}
          handleDeleteQuestion={handleDeleteQuestion}
          handleResetButtonClick={handleResetButtonClick}
          getNextQuestionNumber={getNextQuestionNumber}
        />
      ))}
    </>
  );
}
