import { Button } from 'react-bootstrap';

import { RuleSummaryCard } from './RuleSummary.js';
import type { AccessControlRuleFormData } from './types.js';

interface AccessControlSummaryProps {
  mainRule: AccessControlRuleFormData;
  overrides: AccessControlRuleFormData[];
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  onAddOverride: () => void;
  onRemoveOverride: (index: number) => void;
  onEditStudentGroups?: (index: number) => void;
  /** Base URL for access control pages (e.g., /pl/course_instance/.../assessment/.../access) */
  baseUrl: string;
  /** Course instance ID for building URLs */
  courseInstanceId: string;
}

export function AccessControlSummary({
  mainRule,
  overrides,
  getOverrideName,
  onAddOverride,
  onRemoveOverride,
  onEditStudentGroups,
  baseUrl,
  courseInstanceId,
}: AccessControlSummaryProps) {
  // Generate edit URL for main rule
  const getMainEditUrl = () => {
    if (mainRule.id) {
      return `${baseUrl}/${mainRule.id}`;
    }
    // For new main rules that don't have an ID yet, navigate to /new?type=main
    return `${baseUrl}/new?type=main`;
  };

  // Generate edit URL for an override
  const getOverrideEditUrl = (index: number) => {
    const override = overrides[index];
    if (override.id) {
      return `${baseUrl}/${override.id}`;
    }
    return `${baseUrl}/new`;
  };
  return (
    <div>
      {/* Main Rule Section */}
      <section className="mb-4">
        <h5 className="mb-3">Main Rule</h5>
        <RuleSummaryCard
          rule={mainRule}
          isMainRule={true}
          title="Main access control rule"
          editUrl={getMainEditUrl()}
          courseInstanceId={courseInstanceId}
        />
      </section>

      {/* Overrides Section */}
      <section>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Overrides</h5>
          <Button variant="success" size="sm" onClick={onAddOverride}>
            <i className="fa fa-plus me-1" /> Add override
          </Button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-muted">
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
              editUrl={getOverrideEditUrl(index)}
              courseInstanceId={courseInstanceId}
              onEditStudentGroups={
                onEditStudentGroups ? () => onEditStudentGroups(index) : undefined
              }
              onRemove={() => onRemoveOverride(index)}
            />
          ))
        )}
      </section>
    </div>
  );
}
