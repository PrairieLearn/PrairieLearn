import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';
import { useHasCompletionMechanism } from './hooks/useHasCompletionMechanism.js';

export function OverrideRuleContent({
  index,
  displayTimezone,
  assessmentId,
  courseInstanceId,
}: {
  index: number;
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const hasCompletionMechanism = useHasCompletionMechanism();

  return (
    <div className="d-flex flex-column gap-3">
      <OverrideDateControlForm
        index={index}
        title="Date control"
        description="Control access and credit to your assessment based on a schedule"
        displayTimezone={displayTimezone}
        assessmentId={assessmentId}
        courseInstanceId={courseInstanceId}
      />

      {hasCompletionMechanism && (
        <OverrideAfterCompleteForm
          index={index}
          title="After completion"
          displayTimezone={displayTimezone}
        />
      )}
    </div>
  );
}
