import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { memo, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { FormProvider, useForm } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import {
  AdministratorCourseFormFields,
  type CourseFormFieldValues,
  useInstitutionPrefix,
} from '../../components/AdminstratorCourseFormFields.js';
import { getAppError } from '../../lib/client/errors.js';
import type { AdminInstitution } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { Timezone } from '../../lib/timezone.shared.js';
import { createAdministratorTrpcClient } from '../../trpc/administrator/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/administrator/context.js';
import type { AdminCourseError } from '../../trpc/administrator/courses.js';

import type { CourseWithInstitution } from './administratorCourses.shared.js';

interface InsertCourseFormData extends CourseFormFieldValues {
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
  institutions,
  availableTimezones,
  courses,
  coursesRoot,
  trpcCsrfToken,
  courseRepoDefaultBranch,
  aiSecretsConfigured,
}: {
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  courses: CourseWithInstitution[];
  coursesRoot: string;
  trpcCsrfToken: string;
  courseRepoDefaultBranch: string;
  aiSecretsConfigured: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdministratorTrpcClient({ csrfToken: trpcCsrfToken }));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <>
          <h1 className="visually-hidden">Courses</h1>
          <CoursesCard
            courses={courses}
            institutions={institutions}
            availableTimezones={availableTimezones}
            coursesRoot={coursesRoot}
            courseRepoDefaultBranch={courseRepoDefaultBranch}
            aiSecretsConfigured={aiSecretsConfigured}
          />
        </>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdministratorCourses.displayName = 'AdministratorCourses';

function CoursesCard({
  courses,
  institutions,
  availableTimezones,
  coursesRoot,
  courseRepoDefaultBranch,
  aiSecretsConfigured,
}: {
  courses: CourseWithInstitution[];
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  courseRepoDefaultBranch: string;
  aiSecretsConfigured: boolean;
}) {
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);

  return (
    <div id="courses" className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>Courses</h2>
        <button
          type="button"
          className="btn btn-sm btn-light ms-auto"
          aria-label="Add course"
          onClick={() => setShowAddCourseModal(true)}
        >
          <i className="fa fa-plus" aria-hidden="true" />
          <span className="d-none d-sm-inline">Add course</span>
        </button>
        <CourseInsertModal
          institutions={institutions}
          availableTimezones={availableTimezones}
          coursesRoot={coursesRoot}
          courseRepoDefaultBranch={courseRepoDefaultBranch}
          aiSecretsConfigured={aiSecretsConfigured}
          show={showAddCourseModal}
          onCancel={() => setShowAddCourseModal(false)}
        />
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
            {courses.map((row) => (
              <CourseRow key={row.course.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-footer">
        <small>
          When a course is synced, if the <strong>path</strong> does not exist on disk then a{' '}
          <code>git clone</code> is performed from the <strong>repository</strong>, otherwise a{' '}
          <code>git pull</code> is run in the <strong>path</strong> directory. The{' '}
          <strong>short name</strong> and <strong>title</strong> are updated from the JSON
          configuration file in the repository during the sync.
        </small>
      </div>
    </div>
  );
}

const CourseRow = memo(({ row }: { row: CourseWithInstitution }) => {
  const [showDeletePopover, setShowDeletePopover] = useState(false);

  return (
    <tr>
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
      <CourseUpdateColumn row={row} columnName="display_timezone" label="timezone" />
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
                onCancel={() => setShowDeletePopover(false)}
              />
            ),
          }}
          show={showDeletePopover}
          rootClose
          onToggle={setShowDeletePopover}
        >
          <button type="button" className="btn btn-sm btn-danger text-nowrap">
            <i className="fa fa-times" aria-hidden="true" /> Delete course
          </button>
        </OverlayTrigger>
      </td>
    </tr>
  );
});

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

  const appError = getAppError<AdminCourseError>(mutation.error);

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
          aria-invalid={errors.short_name ? true : undefined}
          aria-errormessage={errors.short_name ? `inputConfirm${id}-error` : undefined}
          {...register('short_name')}
        />
        {errors.short_name && (
          <div id={`inputConfirm${id}-error`} className="invalid-feedback">
            {errors.short_name.message}
          </div>
        )}
      </div>
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
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

function CourseInsertModal({
  institutions,
  availableTimezones,
  coursesRoot,
  courseRepoDefaultBranch,
  show,
  onCancel,
  aiSecretsConfigured,
}: {
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  courseRepoDefaultBranch: string;
  show: boolean;
  onCancel: () => void;
  aiSecretsConfigured: boolean;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courses.insert.mutationOptions());
  const appError = getAppError<AdminCourseError>(mutation.error);

  const methods = useForm<InsertCourseFormData>({
    mode: 'onSubmit',
    defaultValues: {
      institution_id: '',
      short_name: '',
      title: '',
      display_timezone: institutions[0]?.display_timezone ?? '',
      path: `${coursesRoot}/pl-XXX`,
      repository_short_name: 'pl-XXX',
      branch: courseRepoDefaultBranch,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = methods;
  const institutionId = methods.watch('institution_id');
  const prefixState = useInstitutionPrefix(institutionId, institutions);

  const onSubmit = (data: InsertCourseFormData) => {
    mutation.mutate(
      {
        title: data.title,
        path: data.path,
        branch: data.branch,
        shortName: data.short_name,
        institutionId: data.institution_id,
        displayTimezone: data.display_timezone,
        repository: `git@github.com:PrairieLearn/${data.repository_short_name}.git`,
      },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={onCancel}
      onEntering={() => methods.reset()}
    >
      <FormProvider {...methods}>
        <form name="add-course-form" onSubmit={handleSubmit(onSubmit)}>
          <Modal.Header closeButton>
            <Modal.Title>Add course</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <AdministratorCourseFormFields
              institutions={institutions}
              availableTimezones={availableTimezones}
              coursesRoot={coursesRoot}
              prefixState={prefixState}
              aiSecretsConfigured={aiSecretsConfigured}
            />
            <div className="mb-3">
              <label className="form-label" htmlFor="courseAddInputBranch">
                Branch
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
            {appError && (
              <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
                {appError.message}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || mutation.isPending || prefixState.status === 'loading'}
            >
              Add course
            </button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
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
  const appError = getAppError<AdminCourseError>(mutation.error);

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
          {...register('value', {
            required: `Enter a ${label}`,
            pattern:
              columnName === 'short_name'
                ? {
                    value: /^[A-Z]+ [A-Z0-9]+$/,
                    message:
                      'The course rubric and number should be a series of upper case letters, followed by a space, followed by a series of numbers and/or letters.',
                  }
                : undefined,
          })}
        />
        {errors.value && <div className="invalid-feedback">{errors.value.message}</div>}
      </div>
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
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
