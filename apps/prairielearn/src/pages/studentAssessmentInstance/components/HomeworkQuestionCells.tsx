import { formatPoints } from '../../../lib/format.js';

import { InstanceQuestionPoints } from './InstanceQuestionPoints.js';
import { QuestionVariantHistory } from './QuestionVariantHistory.js';
import type { ClientQuestionRow } from './types.js';

export function HomeworkQuestionCells({
  row,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  urlPrefix,
}: {
  row: ClientQuestionRow;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  urlPrefix: string;
}) {
  return (
    <>
      {hasAutoGradingQuestion && (
        <>
          <td className="text-center">
            {!row.maxAutoPoints ? (
              <>&mdash;</>
            ) : (
              formatPoints((row.currentValue ?? 0) - (row.maxManualPoints ?? 0))
            )}
          </td>
          <td className="text-center">
            <QuestionVariantHistory
              instanceQuestionId={row.id}
              previousVariants={row.previousVariants}
              urlPrefix={urlPrefix}
            />
          </td>
        </>
      )}
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
  );
}
