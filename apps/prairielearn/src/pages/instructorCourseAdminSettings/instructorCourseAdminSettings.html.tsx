import { GitHubButton } from '../../components/GitHubButton.js';
import type { Course, Institution } from '../../lib/db-types.js';
import { type Timezone, formatTimezone } from '../../lib/timezone.shared.js';

export function InstructorCourseAdminSettings({
  aiQuestionGenerationEnabled,
  aiQuestionGenerationCourseToggleEnabled,
  authzData,
  availableTimezones,
  course,
  courseGHLink,
  courseInfoExists,
  coursePathExists,
  csrfToken,
  institution,
  origHash,
  urlPrefix,
}: {
  aiQuestionGenerationEnabled: boolean;
  aiQuestionGenerationCourseToggleEnabled: boolean;
  authzData: Record<string, any>;
  availableTimezones: Timezone[];
  course: Course;
  courseGHLink: string | null;
  courseInfoExists: boolean;
  coursePathExists: boolean;
  csrfToken: string;
  institution: Institution;
  origHash: string;
  urlPrefix: string;
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1>General course settings</h1>
        <GitHubButton gitHubLink={courseGHLink} />
      </div>
      <div className="card-body">
        {(!courseInfoExists || !coursePathExists) && (
          <CourseDirectoryMissingAlert
            authzData={authzData}
            course={course}
            coursePathExists={coursePathExists}
            courseInfoExists={courseInfoExists}
            csrfToken={csrfToken}
            urlPrefix={urlPrefix}
          />
        )}
        <form name="edit-course-settings-form" method="POST">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="orig_hash" value={origHash} />
          <div className="mb-3">
            <label className="form-label" htmlFor="short_name">
              Short Name
            </label>
            <input
              type="text"
              className="form-control"
              id="short_name"
              name="short_name"
              defaultValue={course.short_name ?? ''}
              disabled={
                !(
                  courseInfoExists &&
                  authzData.has_course_permission_edit &&
                  !course.example_course
                )
              }
              required
            />
            <small className="form-text text-muted">
              The short name of the course. Often this is the course rubric and number (e.g., "MATH
              101" or "PHYS 440").
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="title">
              Title
            </label>
            <input
              type="text"
              className="form-control"
              id="title"
              name="title"
              defaultValue={course.title ?? ''}
              disabled={
                !(
                  courseInfoExists &&
                  authzData.has_course_permission_edit &&
                  !course.example_course
                )
              }
              required
            />
            <small className="form-text text-muted">
              This is the official title of the course, as given in the course catalog.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="display_timezone">
              Timezone
            </label>
            <select
              className="form-select"
              id="display_timezone"
              name="display_timezone"
              defaultValue={course.display_timezone}
              disabled={
                !(
                  courseInfoExists &&
                  authzData.has_course_permission_edit &&
                  !course.example_course
                )
              }
            >
              {availableTimezones.map((tz) => (
                <option key={tz.name} value={tz.name}>
                  {formatTimezone(tz)}
                </option>
              ))}
            </select>
            <small className="form-text text-muted">
              The allowable timezones are from the
              <a
                href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                target="_blank"
                rel="noreferrer"
              >
                tz database
              </a>
              . It's best to use a city-based timezone that has the same times as you.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="institution">
              Institution
            </label>
            <input
              type="text"
              className="form-control"
              id="institution"
              name="institution"
              value={`${institution.short_name} (${institution.long_name})`}
              disabled
            />
            <small className="form-text text-muted">
              This is your academic institution (e.g., "University of Illinois").
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="path">
              Path
            </label>
            <input
              type="text"
              className="form-control"
              id="path"
              name="path"
              value={course.path}
              disabled
            />
            <small className="form-text text-muted">
              {' '}
              The path where course files can be found.{' '}
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="repository">
              Repository
            </label>
            <span className="input-group">
              <input
                type="text"
                className="form-control"
                id="repository"
                name="repository"
                value={course.repository ?? ''}
                disabled
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary btn-copy"
                data-clipboard-text={course.repository}
                aria-label="Copy repository"
                disabled={!course.repository}
              >
                <i className="far fa-clipboard" />
              </button>
            </span>
            <small className="form-text text-muted">
              The GitHub repository that can be used to sync course files.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="branch">
              Branch
            </label>
            <input
              type="text"
              className="form-control"
              id="branch"
              name="branch"
              value={course.branch}
              disabled
            />
            <small className="form-text text-muted">The git branch used for this course.</small>
          </div>
          <div className="form-check mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="show_getting_started"
              name="show_getting_started"
              defaultChecked={course.show_getting_started}
            />
            <label className="form-check-label" htmlFor="show_getting_started">
              Show the getting started checklist
            </label>
          </div>
          {aiQuestionGenerationCourseToggleEnabled && (
            <div className="form-check mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                name="ai_question_generation"
                value="1"
                id="ai_question_generation_toggle"
                checked={aiQuestionGenerationEnabled}
              />
              <label
                className="form-check-label d-flex align-items-center"
                htmlFor="ai_question_generation_toggle"
              >
                Enable AI question generation
                <span className="badge rounded-pill text-bg-success ms-2">Alpha preview</span>
              </label>
              <div className="small text-muted">
                Generate questions with natural language using AI.
              </div>
            </div>
          )}
          <EditActions
            coursePathExists={coursePathExists}
            courseInfoExists={courseInfoExists}
            hasCoursePermissionView={authzData.has_course_permission_view}
            hasCoursePermissionEdit={authzData.has_course_permission_edit}
            exampleCourse={course.example_course}
            urlPrefix={urlPrefix}
            navPage="course_admin"
          />
        </form>
      </div>
    </div>
  );
}

function CourseDirectoryMissingAlert({
  authzData,
  course,
  coursePathExists,
  courseInfoExists,
  csrfToken,
  urlPrefix,
}: {
  authzData: Record<string, any>;
  course: Course;
  coursePathExists: boolean;
  courseInfoExists: boolean;
  csrfToken: string;
  urlPrefix: string;
}) {
  if (!authzData.has_course_permission_edit || course.example_course) {
    return null;
  }
  if (!coursePathExists) {
    return (
      <div className="alert alert-danger">
        Course directory not found. You must
        <a href={`${urlPrefix}/course_admin/syncs`}>sync your course</a>.
      </div>
    );
  } else if (!courseInfoExists) {
    return (
      <form name="add-configuration-form" method="POST" className="alert alert-danger">
        <code>infoCourse.json</code> is missing. You must
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <button
          name="__action"
          value="add_configuration"
          className="btn btn-link btn-link-inline mt-n1 p-0 border-0"
        >
          create this file
        </button>
        to edit your course settings.
      </form>
    );
  }
}

function EditActions({
  coursePathExists,
  courseInfoExists,
  hasCoursePermissionView,
  hasCoursePermissionEdit,
  exampleCourse,
  urlPrefix,
  navPage,
}: {
  coursePathExists: boolean;
  courseInfoExists: boolean;
  hasCoursePermissionView: boolean;
  hasCoursePermissionEdit: boolean;
  exampleCourse: boolean;
  urlPrefix: string;
  navPage: string;
}) {
  if (!coursePathExists || !courseInfoExists || !hasCoursePermissionView) {
    return null;
  }

  if (!hasCoursePermissionEdit || exampleCourse) {
    return (
      <p className="mb-0">
        <a href={`${urlPrefix}/${navPage}/file_view/infoCourse.json`}>
          {' '}
          View course configuration{' '}
        </a>
        in <code>infoCourse.json</code>
      </p>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-end gap-2">
        <button
          id="save-button"
          type="submit"
          className="btn btn-primary mb-2"
          name="__action"
          value="update_configuration"
        >
          Save
        </button>
        <button id="cancel-button" type="button" className="btn btn-secondary mb-2">
          Cancel
        </button>
      </div>
      <p className="mb-0">
        <a
          data-testid="edit-course-configuration-link"
          href={`${urlPrefix}/${navPage}/file_edit/infoCourse.json`}
        >
          Edit course configuration
        </a>{' '}
        in <code>infoCourse.json</code>
      </p>
    </div>
  );
}
