import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';

export function OverrideRuleContent({ index }: { index: number }) {
  return (
    <div className="d-flex flex-column gap-3">
      <OverrideDateControlForm
        index={index}
        title="Date control"
        description="Control access and credit to your assessment based on a schedule"
      />

      <OverrideAfterCompleteForm index={index} title="After completion" />
    </div>
  );
}
