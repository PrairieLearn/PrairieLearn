import clsx from 'clsx';

import { ansiToHtml } from '../lib/chalk.js';
import type { StaffCourse, StaffCourseInstance } from '../lib/client/safe-db-types.js';
import { type Assessment, type Course, type Question } from '../lib/db-types.js';

export function CourseSyncErrorsAndWarnings({
  authzData,
  course,
  urlPrefix,
}: {
  authzData: { has_course_instance_permission_edit: boolean };
  course: StaffCourse | Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authzData={authzData}
      exampleCourse={course.example_course}
      syncErrors={course.sync_errors}
      syncWarnings={course.sync_warnings}
      fileEditUrl={`${urlPrefix}/course_admin/file_edit/infoCourse.json`}
      context="course"
    />
  );
}

export function QuestionSyncErrorsAndWarnings({
  authzData,
  question,
  course,
  urlPrefix,
}: {
  authzData: { has_course_instance_permission_edit: boolean };
  question: Question;
  course: StaffCourse | Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authzData={authzData}
      exampleCourse={course.example_course}
      syncErrors={question.sync_errors}
      syncWarnings={question.sync_warnings}
      fileEditUrl={`${urlPrefix}/question/${question.id}/file_edit/questions/${question.qid}/info.json`}
      context="question"
    />
  );
}

export function CourseInstanceSyncErrorsAndWarnings({
  authzData,
  courseInstance,
  course,
  urlPrefix,
}: {
  authzData: { has_course_instance_permission_edit: boolean };
  courseInstance: StaffCourseInstance;
  course: StaffCourse | Course;
  urlPrefix: string;
}) {
  return (
    <SyncErrorsAndWarnings
      authzData={authzData}
      exampleCourse={course.example_course}
      syncErrors={courseInstance.sync_errors}
      syncWarnings={courseInstance.sync_warnings}
      fileEditUrl={`${urlPrefix}/instance_admin/file_edit/courseInstances/${courseInstance.short_name}/infoCourseInstance.json`}
      context="course instance"
    />
  );
}

export function AssessmentSyncErrorsAndWarnings({
  authzData,
  assessment,
  courseInstance,
  course,
  urlPrefix,
}: {
  authzData: { has_course_instance_permission_edit?: boolean };
  assessment: Assessment;
  courseInstance: StaffCourseInstance;
  course: StaffCourse | Course;
  urlPrefix: string;
}) {
  // This should never happen, but we are waiting on a better type system for res.locals.authz_data
  // to be able to express this.
  if (authzData.has_course_instance_permission_edit === undefined) {
    throw new Error('has_course_instance_permission_edit is undefined');
  }

  return (
    <SyncErrorsAndWarnings
      authzData={{
        has_course_instance_permission_edit: authzData.has_course_instance_permission_edit,
      }}
      exampleCourse={course.example_course}
      syncErrors={assessment.sync_errors}
      syncWarnings={assessment.sync_warnings}
      fileEditUrl={`${urlPrefix}/assessment/${assessment.id}/file_edit/courseInstances/${courseInstance.short_name}/assessments/${assessment.tid}/infoAssessment.json`}
      context="assessment"
    />
  );
}

function SyncErrorsAndWarnings({
  authzData,
  exampleCourse,
  syncErrors,
  syncWarnings,
  fileEditUrl,
  context,
}: {
  authzData: { has_course_instance_permission_edit: boolean };
  exampleCourse: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
  fileEditUrl: string;
  context: 'course' | 'question' | 'course instance' | 'assessment';
}) {
  if (!authzData.has_course_instance_permission_edit) {
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
            class={clsx('text-white', 'rounded', 'p-3', exampleCourse && 'mb-0')}
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
            <a class="btn btn-primary" href={fileEditUrl}>
              <i class="fa fa-edit" />
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
            class={clsx('text-white', 'rounded', 'p-3', exampleCourse && 'mb-0')}
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
              <i class="fa fa-edit" />
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
