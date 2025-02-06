import { Fragment } from 'preact';

import { run } from '@prairielearn/run';

import { InstructorAssessmentsTable } from './InstructorAssessmentsTable.js';

export function InstructorAssessmentsCard({
  rows,
  assessmentIdsNeedingStatsUpdate,
  csvFilename,
  hasCoursePermissionEdit,
  isExampleCourse,
  urlPrefix,
  csrfToken,
}) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h1>Assessments</h1>
        {hasCoursePermissionEdit && !isExampleCourse && (
          <button
            type="button"
            class="btn btn-sm btn-light ml-auto"
            data-toggle="modal"
            data-target="#createAssessmentModal"
          >
            <i class="fa fa-plus" aria-hidden="true"></i>
            <span class="d-none d-sm-inline ml-1">Add assessment</span>
          </button>
        )}
      </div>
      {rows.length > 0 ? (
        <InstructorAssessmentsTable
          rows={rows}
          assessmentIdsNeedingStatsUpdate={assessmentIdsNeedingStatsUpdate}
          csvFilename={csvFilename}
          urlPrefix={urlPrefix}
        />
      ) : (
        <Fragment>
          <div class="my-4 card-body text-center" style="text-wrap: balance;">
            <p class="font-weight-bold">No assessments found.</p>
            <p class="mb-0">
              An assessment is a collection of questions to build or assess a student's knowledge.
            </p>
            <p>
              Learn more in the
              <a
                href="https://prairielearn.readthedocs.io/en/latest/assessment/"
                target="_blank"
                rel="noopener noreferrer"
              >
                assessments documentation
              </a>
              .
            </p>
            {run(() => {
              if (isExampleCourse) {
                return <p>You can't add assessments to the example course.</p>;
              }
              if (!hasCoursePermissionEdit) {
                return <p>Course Editors can create new assessments.</p>;
              }
              return (
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-toggle="modal"
                  data-target="#createAssessmentModal"
                >
                  <i class="fa fa-plus" aria-hidden="true"></i>
                  <span class="d-none d-sm-inline">Add assessment</span>
                </button>
              );
            })}
          </div>
        </Fragment>
      )}
    </div>
  );
}
