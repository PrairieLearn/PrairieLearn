import { AssessmentModuleHeading } from '../../../components/AssessmentModuleHeading.js';
import type { StaffAssessmentModule } from '../../../lib/client/safe-db-types.js';

export function AssessmentModulesTable({
  assessmentModules,
}: {
  assessmentModules: StaffAssessmentModule[];
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h1>Modules</h1>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover table-striped" aria-label="Assessment modules">
          <thead>
            <tr>
              <th>Name</th>
              <th>Heading</th>
            </tr>
          </thead>
          <tbody>
            {assessmentModules.map((module) => {
              return (
                <tr key={module.id}>
                  <td className="align-middle">{module.name}</td>
                  <td className="align-middle">
                    <AssessmentModuleHeading assessmentModule={module} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-footer">
        <small>
          Modules can be used to group assessments by topic, chapter, section, or other category.
          More information on modules can be found in the{' '}
          <a href="https://docs.prairielearn.com/course/#assessment-modules">
            PrairieLearn documentation
          </a>
          .
        </small>
      </div>
    </div>
  );
}
