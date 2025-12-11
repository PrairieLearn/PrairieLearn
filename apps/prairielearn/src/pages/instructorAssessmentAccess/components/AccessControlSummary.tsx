import { Button } from 'react-bootstrap';

import { RuleSummaryCard } from './RuleSummary.js';
import type { AccessControlRuleFormData, AccessControlView } from './types.js';

interface AccessControlSummaryProps {
  mainRule: AccessControlRuleFormData;
  overrides: AccessControlRuleFormData[];
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  onNavigate: (view: AccessControlView) => void;
  onAddOverride: () => void;
  onRemoveOverride: (index: number) => void;
  onEditStudentGroups: (index: number) => void;
}

export function AccessControlSummary({
  mainRule,
  overrides,
  getOverrideName,
  onNavigate,
  onAddOverride,
  onRemoveOverride,
  onEditStudentGroups,
}: AccessControlSummaryProps) {
  return (
    <div>
      {/* Main Rule Section */}
      <section class="mb-4">
        <h5 class="mb-3">Main Rule</h5>
        <RuleSummaryCard
          rule={mainRule}
          isMainRule={true}
          title="Main access control rule"
          onEdit={() => onNavigate({ type: 'edit-main' })}
        />
      </section>

      {/* Overrides Section */}
      <section>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">Overrides</h5>
          <Button variant="success" size="sm" onClick={onAddOverride}>
            <i class="fa fa-plus me-1" /> Add override
          </Button>
        </div>

        {overrides.length === 0 ? (
          <p class="text-muted">
            No overrides configured. Overrides allow you to customize access rules for specific
            groups of students.
          </p>
        ) : (
          overrides.map((override, index) => (
            <RuleSummaryCard
              // TODO: Fix this
              // eslint-disable-next-line @eslint-react/no-array-index-key
              key={index}
              rule={override}
              isMainRule={false}
              title={getOverrideName(index)}
              onEdit={() => onNavigate({ type: 'edit-override', index })}
              onEditStudentGroups={() => onEditStudentGroups(index)}
              onRemove={() => onRemoveOverride(index)}
            />
          ))
        )}
      </section>
    </div>
  );
}
