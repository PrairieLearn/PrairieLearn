import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';

export function AssessmentSetsTable({ assessmentSets }: { assessmentSets: StaffAssessmentSet[] }) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Assessment sets</h1>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
          <thead>
            <tr>
              <th>Abbreviation</th>
              <th>Name</th>
              <th>Heading</th>
            </tr>
          </thead>
          <tbody>
            {assessmentSets.map((assessmentSet) => {
              return (
                <tr key={assessmentSet.id}>
                  <td class="align-middle">
                    <span class={`badge color-${assessmentSet.color}`}>
                      {assessmentSet.abbreviation}
                    </span>
                  </td>
                  <td class="align-middle">{assessmentSet.name}</td>
                  <td class="align-middle">
                    <AssessmentSetHeading assessmentSet={assessmentSet} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
