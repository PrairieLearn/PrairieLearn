import { type z } from 'zod';

import { renderHtml } from '@prairielearn/react';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import { config } from '../../lib/config.js';
import { type CourseRequestRow } from '../../lib/course-request.js';
import { CourseSchema, type Institution, InstitutionSchema } from '../../lib/db-types.js';

export const CourseWithInstitutionSchema = CourseSchema.extend({
  institution: InstitutionSchema,
});
type CourseWithInstitution = z.infer<typeof CourseWithInstitutionSchema>;

export function AdministratorCourses({
  courseRequests,
  institutions,
  courses,
  coursesRoot,
  csrfToken,
  urlPrefix,
}: {
  courseRequests: CourseRequestRow[];
  institutions: Institution[];
  courses: CourseWithInstitution[];
  coursesRoot: string;
  csrfToken: string;
  urlPrefix: string;
}) {
  return (
    <>
      <h1 className="visually-hidden">Courses</h1>
      <CourseRequestsTable
        rows={courseRequests}
        institutions={institutions}
        coursesRoot={coursesRoot}
        csrfToken={csrfToken}
        urlPrefix={urlPrefix}
        showAll={false}
      />
      <div id="courses" className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>Courses</h2>
          <button
            type="button"
            className="btn btn-sm btn-light ms-auto"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Add new course"
            data-bs-content={renderHtml(
              CourseInsertForm({
                institutions,
                csrfToken,
              }),
            ).toString()}
          >
            <i className="fa fa-plus" aria-hidden="true" />
            <span className="d-none d-sm-inline">Add course</span>
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover table-striped" aria-label="Courses">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Short name</th>
                <th>Title</th>
                <th>Timezone</th>
                <th>Path</th>
                <th>Repository</th>
                <th>Branch</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                return (
                  <tr key={course.id}>
                    <td>
                      <a href={`/pl/administrator/institution/${course.institution.id}`}>
                        {course.institution.short_name}
                      </a>
                    </td>
                    <CourseUpdateColumn
                      course={course}
                      columnName="short_name"
                      label="short name"
                      href={`/pl/course/${course.id}`}
                      csrfToken={csrfToken}
                    />
                    <CourseUpdateColumn
                      course={course}
                      columnName="title"
                      label="title"
                      csrfToken={csrfToken}
                    />
                    <CourseUpdateColumn
                      course={course}
                      columnName="display_timezone"
                      label="timezone"
                      csrfToken={csrfToken}
                    />
                    <CourseUpdateColumn
                      course={course}
                      columnName="path"
                      label="path"
                      csrfToken={csrfToken}
                    />
                    <CourseUpdateColumn
                      course={course}
                      columnName="repository"
                      label="repository"
                      csrfToken={csrfToken}
                    />
                    <CourseUpdateColumn
                      course={course}
                      columnName="branch"
                      label="branch"
                      csrfToken={csrfToken}
                    />
                    <td className="align-middle">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger text-nowrap"
                        id={`courseDeleteButton${course.id}`}
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title={`Confirm deletion of ${course.short_name}`}
                        data-bs-content={renderHtml(
                          CourseDeleteForm({
                            id: `courseDeleteButton${course.id}`,
                            course,
                            csrfToken,
                          }),
                        ).toString()}
                      >
                        <i className="fa fa-times" aria-hidden="true" /> Delete course
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-footer">
          <small>
            When a course is synced, if the <strong>path</strong> does not exist on disk then a
            <code>git clone</code> is performed from the <strong>repository</strong>, otherwise a
            <code>git pull</code> is run in the <strong>path</strong> directory. The
            <strong>short name</strong> and <strong>title</strong> are updated from the JSON
            configuration file in the repository during the sync.
          </small>
        </div>
      </div>
    </>
  );
}

function CourseDeleteForm({
  id,
  course,
  csrfToken,
}: {
  id: string;
  course: CourseWithInstitution;
  csrfToken: string;
}) {
  return (
    <form name="add-user-form" method="POST">
      <input type="hidden" name="__action" value="courses_delete" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="course_id" value={course.id} />
      <div className="mb-3">
        <label className="form-label" htmlFor={`inputConfirm${id}`}>
          Type "{course.short_name}" to confirm:
        </label>
        <input
          type="text"
          className="form-control"
          id={`inputConfirm${id}`}
          name="confirm_short_name"
        />
      </div>
      <div className="text-end">
        <button type="button" className="btn btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" className="btn btn-danger">
          Delete course
        </button>
      </div>
    </form>
  );
}

function CourseInsertForm({
  institutions,
  csrfToken,
}: {
  institutions: Institution[];
  csrfToken: string;
}) {
  return (
    <form name="add-course-form" method="POST">
      <input type="hidden" name="__action" value="courses_insert" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInstitution">
          Institution:
        </label>
        <select
          id="courseAddInstitution"
          name="institution_id"
          className="form-select"
          // @ts-expect-error -- onchange is needed because this form is rendered
          // as a string for a Bootstrap popover, not managed by React
          onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
        >
          {institutions.map((i) => {
            return (
              <option key={i.id} value={i.id} data-timezone={i.display_timezone}>
                {i.short_name}
              </option>
            );
          })}
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputShortName">
          Short name:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputShortName"
          name="short_name"
          placeholder="XC 101"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputTitle">
          Title:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputTitle"
          name="title"
          placeholder="Template course title"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputTimezone">
          Timezone:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputTimezone"
          name="display_timezone"
          defaultValue={institutions[0]?.display_timezone}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputPath">
          Path:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputPath"
          name="path"
          defaultValue="/data1/courses/pl-XXX"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputRepository">
          Repository:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputRepository"
          name="repository"
          defaultValue="git@github.com:PrairieLearn/pl-XXX.git"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputBranch">
          Branch:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseAddInputBranch"
          name="branch"
          defaultValue={config.courseRepoDefaultBranch}
        />
      </div>
      <div className="text-end">
        <button type="button" className="btn btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Add course
        </button>
      </div>
    </form>
  );
}

function CourseUpdateColumn({
  course,
  columnName,
  label,
  href,
  csrfToken,
}: {
  course: CourseWithInstitution;
  columnName: keyof CourseWithInstitution;
  label: string;
  href?: string;
  csrfToken: string;
}) {
  return (
    <td className="align-middle">
      {href !== undefined ? <a href={href}>{course[columnName]}</a> : course[columnName]}
      <button
        type="button"
        className="btn btn-xs btn-secondary"
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-html="true"
        data-bs-placement="auto"
        data-bs-title={`Change ${label}`}
        data-bs-content={renderHtml(
          CourseUpdateColumnForm({
            course,
            columnName,
            csrfToken,
            label,
          }),
        ).toString()}
      >
        <i className="fa fa-edit" aria-hidden="true" />
      </button>
    </td>
  );
}

function CourseUpdateColumnForm({
  course,
  columnName,
  csrfToken,
  label,
}: {
  course: CourseWithInstitution;
  columnName: keyof CourseWithInstitution;
  csrfToken: string;
  label: string;
}) {
  return (
    <form name="edit-course-column-form" method="POST">
      <input type="hidden" name="__action" value="courses_update_column" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="course_id" value={course.id} />
      <input type="hidden" name="column_name" value={columnName} />
      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          name="value"
          defaultValue={course[columnName]}
          aria-label={label}
        />
      </div>
      <div className="text-end">
        <button type="button" className="btn btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Change
        </button>
      </div>
    </form>
  );
}
