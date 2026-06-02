import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';

export function OverrideRuleContent({
  index,
  displayTimezone,
  isExam,
}: {
  index: number;
  displayTimezone: string;
  isExam: boolean;
}) {
  return (
    <div className="d-flex flex-column gap-3">
      <OverrideDateControlForm
        index={index}
        title="Date control"
        description="Control access and credit to your assessment based on a schedule"
        displayTimezone={displayTimezone}
        isExam={isExam}
      />

      <OverrideAfterCompleteForm
        index={index}
        title="After completion"
        displayTimezone={displayTimezone}
      />
    </div>
  );
}
