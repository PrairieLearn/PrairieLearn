import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';

interface OverrideRuleContentProps {
  index: number;
}

export function OverrideRuleContent({ index }: OverrideRuleContentProps) {
  return (
    <div className="mb-3">
      <OverrideDateControlForm
        index={index}
        title="Date control"
        description="Control access and credit to your assessment based on a schedule"
      />

      <OverrideAfterCompleteForm
        index={index}
        title="After completion behavior"
        description="Configure what happens after students complete the assessment"
      />
    </div>
  );
}
