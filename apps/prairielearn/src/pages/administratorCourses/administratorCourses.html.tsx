import { useState } from 'react';
import type { z } from 'zod';

import { OverlayTrigger } from '@prairielearn/ui';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import type { RawAdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import type { CourseRequestRow } from '../../lib/course-request.js';

import type { CourseWithInstitution } from './administratorCourses.shared.js';

type AdminInstitution = z.infer<typeof RawAdminInstitutionSchema>;

export function AdministratorCourses({
  courseRequests,
  institutions,
  courses,
  coursesRoot,
  csrfToken,
  urlPrefix,
  courseRepoDefaultBranch,
}: {
  courseRequests: CourseRequestRow[];
  institutions: AdminInstitution[];
  courses: CourseWithInstitution[];
  coursesRoot: string;
  csrfToken: string;
  urlPrefix: string;
  courseRepoDefaultBranch: string;
}) {
  const [showInsertCoursePopover, setShowInsertCoursePopover] = useState(false);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);

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
          <OverlayTrigger
            trigger="click"
            placement="auto"
            popover={{
              header: 'Add new course',
              body: (
                <CourseInsertForm
                  institutions={institutions}
                  csrfToken={csrfToken}
                  courseRepoDefaultBranch={courseRepoDefaultBranch}
                  onCancel={() => setShowInsertCoursePopover(false)}
                />
              ),
            }}
            show={showInsertCoursePopover}
            rootClose
            onToggle={setShowInsertCoursePopover}
          >
            <button type="button" className="btn btn-sm btn-light ms-auto">
              <i className="fa fa-plus" aria-hidden="true" />
              <span className="d-none d-sm-inline">Add course</span>
            </button>
          </OverlayTrigger>
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
                      <OverlayTrigger
                        trigger="click"
                        placement="auto"
                        popover={{
                          header: `Confirm deletion of ${course.short_name}`,
                          body: (
                            <CourseDeleteForm
                              id={`courseDeleteButton${course.id}`}
                              course={course}
                              csrfToken={csrfToken}
                              onCancel={() => setDeleteCourseId(null)}
                            />
                          ),
                        }}
                        show={deleteCourseId === course.id}
                        rootClose
                        onToggle={(open) => setDeleteCourseId(open ? course.id : null)}
                      >
                        <button type="button" className="btn btn-sm btn-danger text-nowrap">
                          <i className="fa fa-times" aria-hidden="true" /> Delete course
                        </button>
                      </OverlayTrigger>
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

AdministratorCourses.displayName = 'AdministratorCourses';

function CourseDeleteForm({
  id,
  course,
  csrfToken,
  onCancel,
}: {
  id: string;
  course: CourseWithInstitution;
  csrfToken: string;
  onCancel: () => void;
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
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary gap-2" onClick={onCancel}>
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
  courseRepoDefaultBranch,
  onCancel,
}: {
  institutions: AdminInstitution[];
  csrfToken: string;
  courseRepoDefaultBranch: string;
  onCancel: () => void;
}) {
  const [timezone, setTimezone] = useState(institutions[0]?.display_timezone ?? '');

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
          onChange={({ currentTarget }) => {
            const selected = institutions.find((i) => i.id === currentTarget.value);
            if (selected) {
              setTimezone(selected.display_timezone);
            }
          }}
        >
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.short_name}
            </option>
          ))}
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
          value={timezone}
          onChange={(e) => setTimezone(e.currentTarget.value)}
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
          defaultValue={courseRepoDefaultBranch}
        />
      </div>
      <div className="d-flex flex-wrap gap-1">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
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
  const [showPopover, setShowPopover] = useState(false);

  return (
    <td className="align-middle">
      {href !== undefined ? <a href={href}>{course[columnName]}</a> : course[columnName]}
      <OverlayTrigger
        trigger="click"
        placement="auto"
        popover={{
          header: `Change ${label}`,
          body: (
            <CourseUpdateColumnForm
              course={course}
              columnName={columnName}
              csrfToken={csrfToken}
              label={label}
              onCancel={() => setShowPopover(false)}
            />
          ),
        }}
        show={showPopover}
        rootClose
        onToggle={setShowPopover}
      >
        <button type="button" className="btn btn-xs btn-secondary ms-1" aria-label={`Edit ${label}`}>
          <i className="fa fa-edit" aria-hidden="true" />
        </button>
      </OverlayTrigger>
    </td>
  );
}

function CourseUpdateColumnForm({
  course,
  columnName,
  csrfToken,
  label,
  onCancel,
}: {
  course: CourseWithInstitution;
  columnName: keyof CourseWithInstitution;
  csrfToken: string;
  label: string;
  onCancel: () => void;
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
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Change
        </button>
      </div>
    </form>
  );
}
