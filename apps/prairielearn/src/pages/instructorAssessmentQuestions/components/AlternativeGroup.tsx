import { Fragment } from 'preact/jsx-runtime';

import { run } from '@prairielearn/run';

import { AlternativeGroupHeader } from '../../../components/AssessmentQuestions.js';
import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/index.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';
import type { AssessmentState } from './InstructorAssessmentQuestionsTable.js';

export function AlternativeGroup({
  alternativeGroup,
  alternativeGroupNumber,
  zoneNumber,
  AssessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  getNextQuestionNumber,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  zoneNumber: number;
  AssessmentState: AssessmentState;
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
  const hasAlternatives =
    alternativeGroup.alternatives?.length && alternativeGroup.alternatives.length > 1;
  const currentQuestionNumber = getNextQuestionNumber();
  return (
    <Fragment>
      {hasAlternatives && (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={currentQuestionNumber}
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
              questionNumber={currentQuestionNumber}
            />
          );
        }

        return alternativeGroup.alternatives?.map((alternative, alternativeNumber) => {
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
              questionNumber={currentQuestionNumber}
              alternativeGroupAutoPoints={
                alternativeGroup.points ?? alternativeGroup.autoPoints ?? null
              }
            />
          );
        });
      })}
    </Fragment>
  );
}
