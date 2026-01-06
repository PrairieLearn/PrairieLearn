import { AssessmentModuleHeading } from '../../../components/AssessmentModuleHeading.js';
import type { StaffAssessmentModule } from '../../../lib/client/safe-db-types.js';

export function AssessmentModulesTable({
  assessmentModules,
}: {
  assessmentModules: StaffAssessmentModule[];
}) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Modules</h1>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped" aria-label="Assessment modules">
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
                  <td class="align-middle">{module.name}</td>
                  <td class="align-middle">
                    <AssessmentModuleHeading assessmentModule={module} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="card-footer">
        <small>
          Modules can be used to group assessments by topic, chapter, section, or other category.
          More information on modules can be found in the{' '}
          <a href="https://prairielearn.readthedocs.io/en/latest/course/#assessment-modules">
            PrairieLearn documentation
          </a>
          .
        </small>
      </div>
    </div>
  );
}
