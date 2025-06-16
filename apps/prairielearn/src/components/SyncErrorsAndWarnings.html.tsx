import { ansiToHtml } from '../lib/chalk.js';
import {
  type Assessment,
  type Course,
  type CourseInstance,
  type Question,
} from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function CourseSyncErrorsAndWarnings({
  authz_data,
  course,
  urlPrefix,
}: {
  authz_data: { has_course_instance_permission_edit: boolean };
  course: Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authz_data={authz_data}
      exampleCourse={course.example_course}
      syncErrors={course.sync_errors}
      syncWarnings={course.sync_warnings}
      fileEditUrl={`${urlPrefix}/course_admin/file_edit/infoCourse.json`}
      context={'course'}
    />
  );
}

export function QuestionSyncErrorsAndWarnings({
  authz_data,
  question,
  course,
  urlPrefix,
}: {
  authz_data: { has_course_instance_permission_edit: boolean };
  question: Question;
  course: Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authz_data={authz_data}
      exampleCourse={course.example_course}
      syncErrors={question.sync_errors}
      syncWarnings={question.sync_warnings}
      fileEditUrl={`${urlPrefix}/question/${question.id}/file_edit/questions/${question.qid}/info.json`}
      context={'question'}
    />
  );
}

export function CourseInstanceSyncErrorsAndWarnings({
  authz_data,
  courseInstance,
  course,
  urlPrefix,
}: {
  authz_data: { has_course_instance_permission_edit: boolean };
  courseInstance: CourseInstance;
  course: Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authz_data={authz_data}
      exampleCourse={course.example_course}
      syncErrors={courseInstance.sync_errors}
      syncWarnings={courseInstance.sync_warnings}
      fileEditUrl={`${urlPrefix}/instance_admin/file_edit/courseInstances/${courseInstance.short_name}/infoCourseInstance.json`}
      context={'course instance'}
    />
  );
}

export function AssessmentSyncErrorsAndWarnings({
  authz_data,
  assessment,
  courseInstance,
  course,
  urlPrefix,
}: {
  authz_data: { has_course_instance_permission_edit: boolean };
  assessment: Assessment;
  courseInstance: CourseInstance;
  course: Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authz_data={authz_data}
      exampleCourse={course.example_course}
      syncErrors={assessment.sync_errors}
      syncWarnings={assessment.sync_warnings}
      fileEditUrl={`${urlPrefix}/assessment/${assessment.id}/file_edit/courseInstances/${courseInstance.short_name}/assessments/${assessment.tid}/infoAssessment.json`}
      context={'assessment'}
    />
  );
}

function SyncErrorsAndWarnings({
  authz_data,
  exampleCourse,
  syncErrors,
  syncWarnings,
  fileEditUrl,
  context,
}: {
  authz_data: { has_course_instance_permission_edit: boolean };
  exampleCourse: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
  fileEditUrl: string;
  context: 'course' | 'question' | 'course instance' | 'assessment';
}) {
  if (!authz_data.has_course_instance_permission_edit) {
    return null;
  }
  if (!syncErrors && !syncWarnings) {
    return null;
  }

  const syncErrorsAnsified = syncErrors ? ansiToHtml(syncErrors) : null;
  const syncWarningsAnsified = syncWarnings ? ansiToHtml(syncWarnings) : null;
  const infoFileName = fileEditUrl.split('/').pop();

  return (
    <>
      {syncErrors ? (
        <div class="alert alert-danger" role="alert">
          <h2 class="h5 alert-heading">Sync error</h2>
          <p>
            There was an error syncing this {context}; the information you see below may be
            inconsistent with this {context}'s <code>{infoFileName}</code> file. Please correct the
            error and sync again.
          </p>
          <pre
            class={`text-white rounded p-3 ${exampleCourse ? 'mb-0' : ''}`}
            style="background-color: black;"
          >
            {syncErrorsAnsified && (
              /* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */
              <code dangerouslySetInnerHTML={{ __html: syncErrorsAnsified }} />
            )}
          </pre>
          {exampleCourse ? (
            ''
          ) : (
            <a class="btn btn-primary" href="{fileEditUrl}">
              <i class="fa fa-edit"></i>
              <span class="d-none d-sm-inline">Edit {infoFileName} to fix this error</span>
            </a>
          )}
        </div>
      ) : (
        ''
      )}
      {syncWarnings ? (
        <div class="alert alert-warning" role="alert">
          <h2 class="h5 alert-heading">Sync warning</h2>
          <p>
            These warnings do not impact the ability to sync this {context}, but they should still
            be reviewed and corrected.
          </p>
          <pre
            class={`text-white rounded p-3 ${exampleCourse ? 'mb-0' : ''}`}
            style="background-color: black;"
          >
            {syncWarningsAnsified && (
              /* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */
              <code dangerouslySetInnerHTML={{ __html: syncWarningsAnsified }} />
            )}
          </pre>
          {exampleCourse ? (
            ''
          ) : (
            <a class="btn btn-primary" href={fileEditUrl}>
              <i class="fa fa-edit"></i>
              <span class="d-none d-sm-inline">Edit {infoFileName} to fix this warning</span>
            </a>
          )}
        </div>
      ) : (
        ''
      )}
    </>
  );
}
