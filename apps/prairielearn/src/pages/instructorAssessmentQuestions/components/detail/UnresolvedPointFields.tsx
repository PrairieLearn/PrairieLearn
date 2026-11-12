import type { QuestionPointsJson } from '../../../../schemas/infoAssessment.js';
import { formatPoints } from '../../utils/formHelpers.js';

export function UnresolvedPointFields({
  question,
  parent,
}: {
  question: QuestionPointsJson;
  parent?: QuestionPointsJson;
}) {
  const fields = [
    ['Points', question.points ?? parent?.points],
    ['Max points', question.maxPoints ?? parent?.maxPoints],
    ['Auto points', question.autoPoints ?? parent?.autoPoints],
    ['Max auto points', question.maxAutoPoints ?? parent?.maxAutoPoints],
    ['Manual points', question.manualPoints ?? parent?.manualPoints],
  ] as const;

  return (
    <div>
      <p className="text-muted small">
        Point settings are read-only while a question’s grading method is unavailable locally.
      </p>
      <dl>
        {fields.map(([label, value]) =>
          value == null ? null : (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatPoints(value)}</dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}
