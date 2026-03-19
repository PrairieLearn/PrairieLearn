import { type Path, useWatch } from 'react-hook-form';

import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';
import type { AccessControlFormData } from './types.js';

interface OverrideRuleContentProps {
  index: number;
}

export function OverrideRuleContent({ index }: OverrideRuleContentProps) {
  const isEnabled = useWatch({
    name: `overrides.${index}.enabled` as Path<AccessControlFormData>,
  }) as boolean | undefined;

  return (
    <>
      {isEnabled && (
        <div className="mb-3">
          <OverrideDateControlForm
            index={index}
            title="Date control"
            description="Control access and credit to your exam based on a schedule"
          />

          <OverrideAfterCompleteForm
            index={index}
            title="After completion behavior"
            description="Configure what happens after students complete the assessment"
          />
        </div>
      )}
    </>
  );
}
