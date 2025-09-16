import type { StaffAssessmentContext } from '../../../lib/client/page-context.js';

export function AccessControl({
  assessment,
  assessmentSet,
}: {
  assessment: StaffAssessmentContext['assessment'];
  assessmentSet: StaffAssessmentContext['assessment_set'];
}) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>
          {assessmentSet.name} {assessment.number}: Access control
        </h2>
      </div>
      <div class="card-body">
        <p>
          Access control for {assessmentSet.name} {assessment.number}
        </p>
      </div>
      <div class="card-footer">
        <button class="btn btn-primary" type="button">
          Save
        </button>
      </div>
    </div>
  );
}

AccessControl.displayName = 'AccessControl';
