import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';

export function AssessmentSetsTable({ assessmentSets }: { assessmentSets: StaffAssessmentSet[] }) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h1>Assessment sets</h1>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover table-striped" aria-label="Assessment sets">
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
                  <td className="align-middle">
                    <span className={`badge color-${assessmentSet.color}`}>
                      {assessmentSet.abbreviation}
                    </span>
                  </td>
                  <td className="align-middle">{assessmentSet.name}</td>
                  <td className="align-middle">
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
