import { formatPoints } from '../../../lib/format.js';

import { ExamQuestionAvailablePoints } from './ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from './ExamQuestionStatus.js';
import { InstanceQuestionPoints } from './InstanceQuestionPoints.js';
import type { ClientQuestionRow } from './types.js';

export function ExamQuestionCells({
  row,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  assessmentInstanceOpen,
}: {
  row: ClientQuestionRow;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  assessmentInstanceOpen: boolean;
}) {
  const realTimeGradingPartiallyDisabled =
    someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading;

  return (
    <>
      <td className="align-middle lh-1">
        <ExamQuestionStatus
          row={row}
          realTimeGradingPartiallyDisabled={realTimeGradingPartiallyDisabled}
        />
      </td>
      {hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading && (
        <td className="text-center">
          <ExamQuestionAvailablePoints row={row} />
        </td>
      )}
      {someQuestionsAllowRealTimeGrading || !assessmentInstanceOpen ? (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td className="text-center">
                <InstanceQuestionPoints row={row} component="auto" />
              </td>
              <td className="text-center">
                <InstanceQuestionPoints row={row} component="manual" />
              </td>
            </>
          )}
          <td className="text-center">
            <InstanceQuestionPoints row={row} component="total" />
          </td>
        </>
      ) : (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td className="text-center">{formatPoints(row.maxAutoPoints)}</td>
              <td className="text-center">{formatPoints(row.maxManualPoints)}</td>
            </>
          )}
          <td className="text-center">{formatPoints(row.maxPoints)}</td>
        </>
      )}
    </>
  );
}
