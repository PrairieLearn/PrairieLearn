import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import type { AdminInstitution } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { CourseRequestRow } from '../../lib/course-request.js';
import type { Timezone } from '../../lib/timezone.shared.js';
import { createAdministratorTrpcClient } from '../../trpc/administrator/trpc-client.js';
import { TRPCProvider, useTRPC } from '../../trpc/administrator/trpc-context.js';

import type { CourseWithInstitution } from './administratorCourses.shared.js';

interface InsertCourseFormData {
  institution_id: string;
  short_name: string;
  title: string;
  display_timezone: string;
  path: string;
  repository: string;
  branch: string;
}

interface UpdateCourseColumnFormData {
  value: string;
}

interface DeleteCourseFormData {
  short_name: string;
}

type CourseColumnName =
  | 'short_name'
  | 'title'
  | 'display_timezone'
  | 'path'
  | 'repository'
  | 'branch';

export function AdministratorCourses({
  courseRequests,
  institutions,
  availableTimezones,
  courses,
  coursesRoot,
  trpcCsrfToken,
  urlPrefix,
  courseRepoDefaultBranch,
}: {
  courseRequests: CourseRequestRow[];
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  courses: CourseWithInstitution[];
  coursesRoot: string;
  trpcCsrfToken: string;
  urlPrefix: string;
  courseRepoDefaultBranch: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdministratorTrpcClient({ csrfToken: trpcCsrfToken }));

  const [showInsertCoursePopover, setShowInsertCoursePopover] = useState(false);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <>
          <h1 className="visually-hidden">Courses</h1>
          <CourseRequestsTable
            rows={courseRequests}
            institutions={institutions}
            availableTimezones={availableTimezones}
            coursesRoot={coursesRoot}
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
                  {courses.map((row) => {
                    return (
                      <tr key={row.course.id}>
                        <td>
                          <a href={`/pl/administrator/institution/${row.institution.id}`}>
                            {row.institution.short_name}
                          </a>
                        </td>
                        <CourseUpdateColumn
                          row={row}
                          columnName="short_name"
                          label="short name"
                          href={`/pl/course/${row.course.id}`}
                        />
                        <CourseUpdateColumn row={row} columnName="title" label="title" />
                        <CourseUpdateColumn
                          row={row}
                          columnName="display_timezone"
                          label="timezone"
                        />
                        <CourseUpdateColumn row={row} columnName="path" label="path" />
                        <CourseUpdateColumn row={row} columnName="repository" label="repository" />
                        <CourseUpdateColumn row={row} columnName="branch" label="branch" />
                        <td className="align-middle">
                          <OverlayTrigger
                            trigger="click"
                            placement="auto"
                            popover={{
                              header: `Confirm deletion of ${row.course.short_name}`,
                              body: (
                                <CourseDeleteForm
                                  id={`courseDeleteButton${row.course.id}`}
                                  row={row}
                                  onCancel={() => setDeleteCourseId(null)}
                                />
                              ),
                            }}
                            show={deleteCourseId === row.course.id}
                            rootClose
                            onToggle={(open) => setDeleteCourseId(open ? row.course.id : null)}
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
                <code>git clone</code> is performed from the <strong>repository</strong>, otherwise
                a <code>git pull</code> is run in the <strong>path</strong> directory. The
                <strong>short name</strong> and <strong>title</strong> are updated from the JSON
                configuration file in the repository during the sync.
              </small>
            </div>
          </div>
        </>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdministratorCourses.displayName = 'AdministratorCourses';

function CourseDeleteForm({
  id,
  row,
  onCancel,
}: {
  id: string;
  row: CourseWithInstitution;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courses.delete.mutationOptions());

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteCourseFormData>({
    mode: 'onSubmit',
    defaultValues: {
      short_name: '',
    },
  });

  const onSubmit = (data: DeleteCourseFormData) => {
    mutation.mutate(
      { courseId: row.course.id, confirmShortName: data.short_name },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <form name="course-delete-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <label className="form-label" htmlFor={`inputConfirm${id}`}>
          Type "{row.course.short_name}" to confirm:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.short_name && 'is-invalid')}
          id={`inputConfirm${id}`}
          {...register('short_name')}
        />
        {errors.short_name && <div className="invalid-feedback">{errors.short_name.message}</div>}
      </div>
      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary gap-2" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" disabled={mutation.isPending}>
          Delete course
        </button>
      </div>
    </form>
  );
}

function CourseInsertForm({
  institutions,
  courseRepoDefaultBranch,
  onCancel,
}: {
  institutions: AdminInstitution[];
  courseRepoDefaultBranch: string;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courses.insert.mutationOptions());

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InsertCourseFormData>({
    mode: 'onSubmit',
    defaultValues: {
      institution_id: '',
      short_name: '',
      title: '',
      display_timezone: institutions[0]?.display_timezone ?? '',
      path: '',
      repository: '',
      branch: courseRepoDefaultBranch,
    },
  });
  const institutionId = watch('institution_id');

  const selectedInstitution = institutions.find((i) => i.id === institutionId);
  const isDefaultInstitution = selectedInstitution?.short_name === 'Default';

  const onSubmit = (data: InsertCourseFormData) => {
    mutation.mutate(
      {
        title: data.title,
        path: data.path,
        branch: data.branch,
        shortName: data.short_name,
        institutionId: data.institution_id,
        displayTimezone: data.display_timezone,
        repository: data.repository,
      },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <form name="add-course-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInstitution">
          Institution:
        </label>
        <select
          id="courseAddInstitution"
          className={clsx('form-select', errors.institution_id && 'is-invalid')}
          aria-invalid={errors.institution_id ? true : undefined}
          aria-errormessage={errors.institution_id ? 'courseAddInstitution-error' : undefined}
          {...register('institution_id', {
            required: 'Select an institution',
            onChange: (e) => {
              const selected = institutions.find((i) => i.id === e.target.value);
              if (selected) {
                setValue('display_timezone', selected.display_timezone);
              }
            },
          })}
        >
          <option value="" disabled>
            Select an institution...
          </option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.short_name}
            </option>
          ))}
        </select>
        {errors.institution_id && (
          <div id="courseAddInstitution-error" className="invalid-feedback">
            {errors.institution_id.message}
          </div>
        )}
        {isDefaultInstitution && (
          <div className="form-text text-warning">
            <i className="fa fa-exclamation-triangle" aria-hidden="true" /> The "Default"
            institution is typically not intended for new courses.
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputShortName">
          Short name:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.short_name && 'is-invalid')}
          id="courseAddInputShortName"
          placeholder="XC 101"
          aria-invalid={errors.short_name ? true : undefined}
          aria-errormessage={errors.short_name ? 'courseAddInputShortName-error' : undefined}
          {...register('short_name', {
            required: 'Enter a short name',
            pattern: {
              value: /^[A-Z]+ [A-Z0-9]+$/,
              message:
                'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
            },
          })}
        />
        {errors.short_name && (
          <div id="courseAddInputShortName-error" className="invalid-feedback">
            {errors.short_name.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputTitle">
          Title:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.title && 'is-invalid')}
          id="courseAddInputTitle"
          placeholder="Template course title"
          aria-invalid={errors.title ? true : undefined}
          aria-errormessage={errors.title ? 'courseAddInputTitle-error' : undefined}
          maxLength={75}
          {...register('title', {
            required: 'Enter a title',
            maxLength: { value: 75, message: 'Title must be at most 75 characters' },
          })}
        />
        {errors.title && (
          <div id="courseAddInputTitle-error" className="invalid-feedback">
            {errors.title.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputTimezone">
          Timezone:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.display_timezone && 'is-invalid')}
          id="courseAddInputTimezone"
          aria-invalid={errors.display_timezone ? true : undefined}
          aria-errormessage={errors.display_timezone ? 'courseAddInputTimezone-error' : undefined}
          {...register('display_timezone', { required: 'Enter a timezone' })}
        />
        {errors.display_timezone && (
          <div id="courseAddInputTimezone-error" className="invalid-feedback">
            {errors.display_timezone.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputPath">
          Path:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.path && 'is-invalid')}
          id="courseAddInputPath"
          placeholder="/data1/courses/pl-XXX"
          aria-invalid={errors.path ? true : undefined}
          aria-errormessage={errors.path ? 'courseAddInputPath-error' : undefined}
          {...register('path', { required: 'Enter a path' })}
        />
        {errors.path && (
          <div id="courseAddInputPath-error" className="invalid-feedback">
            {errors.path.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputRepository">
          Repository:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.repository && 'is-invalid')}
          id="courseAddInputRepository"
          placeholder="git@github.com:PrairieLearn/pl-XXX.git"
          aria-invalid={errors.repository ? true : undefined}
          aria-errormessage={errors.repository ? 'courseAddInputRepository-error' : undefined}
          {...register('repository', { required: 'Enter a repository' })}
        />
        {errors.repository && (
          <div id="courseAddInputRepository-error" className="invalid-feedback">
            {errors.repository.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseAddInputBranch">
          Branch:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.branch && 'is-invalid')}
          id="courseAddInputBranch"
          aria-invalid={errors.branch ? true : undefined}
          aria-errormessage={errors.branch ? 'courseAddInputBranch-error' : undefined}
          {...register('branch', { required: 'Enter a branch' })}
        />
        {errors.branch && (
          <div id="courseAddInputBranch-error" className="invalid-feedback">
            {errors.branch.message}
          </div>
        )}
      </div>
      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
      <div className="d-flex flex-wrap gap-1">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || mutation.isPending}
        >
          Add course
        </button>
      </div>
    </form>
  );
}

function CourseUpdateColumn({
  row,
  columnName,
  label,
  href,
}: {
  row: CourseWithInstitution;
  columnName: CourseColumnName;
  label: string;
  href?: string;
}) {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <td className="align-middle">
      {href !== undefined ? <a href={href}>{row.course[columnName]}</a> : row.course[columnName]}
      <OverlayTrigger
        trigger="click"
        placement="auto"
        popover={{
          header: `Change ${label}`,
          body: (
            <CourseUpdateColumnForm
              row={row}
              columnName={columnName}
              label={label}
              onCancel={() => setShowPopover(false)}
            />
          ),
        }}
        show={showPopover}
        rootClose
        onToggle={setShowPopover}
      >
        <button
          type="button"
          className="btn btn-xs btn-secondary ms-1"
          aria-label={`Edit ${label}`}
        >
          <i className="fa fa-edit" aria-hidden="true" />
        </button>
      </OverlayTrigger>
    </td>
  );
}

function CourseUpdateColumnForm({
  row,
  columnName,
  label,
  onCancel,
}: {
  row: CourseWithInstitution;
  columnName: CourseColumnName;
  label: string;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courses.updateColumn.mutationOptions());

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateCourseColumnFormData>({
    mode: 'onSubmit',
    defaultValues: {
      value: row.course[columnName] ?? '',
    },
  });

  const onSubmit = (data: UpdateCourseColumnFormData) => {
    mutation.mutate(
      { courseId: row.course.id, columnName, value: data.value },
      {
        onSuccess: () => {
          onCancel();
          window.location.reload();
        },
      },
    );
  };

  return (
    <form name="edit-course-column-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <input
          type="text"
          className={clsx('form-control', errors.value && 'is-invalid')}
          aria-label={label}
          {...register('value', { required: `Enter a ${label}` })}
        />
        {errors.value && <div className="invalid-feedback">{errors.value.message}</div>}
      </div>
      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          Change
        </button>
      </div>
    </form>
  );
}
