import { Fragment } from 'preact/jsx-runtime';

import { run } from '@prairielearn/run';

import { AlternativeGroupHeader } from '../../../components/AssessmentQuestions.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/index.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';

export function AlternativeGroup({
  alternativeGroup,
  alternativeGroupNumber,
  zoneNumber,
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  canEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  getNextQuestionNumber,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  zoneNumber: number;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
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
      {hasAlternatives ? (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={currentQuestionNumber}
          nTableCols={nTableCols}
        />
      ) : null}
      {run(() => {
        if (!hasAlternatives) {
          return (
            <AssessmentQuestion
              id={alternativeGroup.id}
              alternativeGroup={alternativeGroup}
              zoneNumber={zoneNumber}
              alternativeGroupNumber={alternativeGroupNumber}
              nTableCols={nTableCols}
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
              nTableCols={nTableCols}
              alternativeGroupNumber={alternativeGroupNumber}
              alternativeNumber={alternativeNumber}
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
