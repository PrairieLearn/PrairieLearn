import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { memo, useState } from 'react';
import { Alert, Dropdown, Modal } from 'react-bootstrap';
import { FormProvider, useForm } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';

import { OverlayTrigger, useModalState } from '@prairielearn/ui';

import {
  AdministratorCourseFormFields,
  type CourseFormFieldValues,
  buildRepoShortName,
  useInstitutionPrefix,
} from '../../../components/AdminstratorCourseFormFields.js';
import { JobStatus } from '../../../components/JobStatus.js';
import { type AppError, getAppError } from '../../../lib/client/errors.js';
import type { AdminInstitution } from '../../../lib/client/safe-db-types.js';
import {
  getAdministratorCourseRequestsUrl,
  getAdministratorJobSequenceUrl,
} from '../../../lib/client/url.js';
import type { CourseRequestRow } from '../../../lib/course-request.js';
import { type Timezone } from '../../../lib/timezone.shared.js';
import { useTRPC } from '../../../trpc/administrator/context.js';
import type { AdminCourseRequestError } from '../../../trpc/administrator/course-requests.js';

interface CourseRequestApproveFormData extends CourseFormFieldValues {
  github_user: string;
}

export function CourseRequestsTable({
  rows,
  institutions,
  availableTimezones,
  coursesRoot,
  showAll,
  aiSecretsConfigured,
}: {
  rows: CourseRequestRow[];
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  showAll: boolean;
  aiSecretsConfigured: boolean;
}) {
  const approveModal = useModalState<CourseRequestRow>();

  const headerPrefix = showAll ? 'All' : 'Pending';
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h1 className="h2 mb-0">{headerPrefix} course requests</h1>
        {!showAll && (
          <a
            className="btn btn-sm btn-light ms-auto"
            href={getAdministratorCourseRequestsUrl({ showAll: true })}
          >
            <i className="fa fa-search" aria-hidden="true" />
            <span className="d-none d-sm-inline">View all</span>
          </a>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-sm" aria-label="Course requests">
          <thead>
            <tr>
              <th>Created At</th>
              <th>Short Name / Title</th>
              <th>Institution</th>
              <th>Requested By</th>
              <th>PrairieLearn User</th>
              <th>GitHub Username</th>
              <th>Referral Source</th>
              <th>Status</th>
              {showAll && <th>Updated By</th>}
              <th>Actions</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CourseRequestTableRow
                key={row.id}
                row={row}
                showAll={showAll}
                onApprove={approveModal.showWithData}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-footer">
        <small>
          Accepting a course request will automatically create a new GitHub repository and add the
          course to the database.
        </small>
      </div>
      <CourseRequestApproveModal
        {...approveModal}
        institutions={institutions}
        availableTimezones={availableTimezones}
        coursesRoot={coursesRoot}
        aiSecretsConfigured={aiSecretsConfigured}
      />
    </div>
  );
}

CourseRequestsTable.displayName = 'CourseRequestsTable';

const CourseRequestTableRow = memo(
  ({
    row,
    showAll,
    onApprove,
  }: {
    row: CourseRequestRow;
    showAll: boolean;
    onApprove: (row: CourseRequestRow) => void;
  }) => {
    const [noteOpen, setNoteOpen] = useState(Boolean(row.note));
    const [jobsOpen, setJobsOpen] = useState(false);
    const [showDenyPopover, setShowDenyPopover] = useState(false);

    return (
      <>
        <tr>
          <td className="align-middle">{row.created_at.toISOString()}</td>
          <td className="align-middle">
            {row.short_name}: {row.title}
          </td>
          <td className="align-middle">
            <EmptyState value={row.institution} label="No institution" />
          </td>
          <td className="align-middle">
            {row.first_name || row.last_name ? (
              <>
                {row.first_name} {row.last_name} {row.work_email ? `(${row.work_email})` : ''}
              </>
            ) : (
              <span className="text-muted fst-italic">No contact info</span>
            )}
          </td>
          <td className="align-middle">
            {row.user_name} ({row.user_uid})
          </td>
          <td className="align-middle">
            <EmptyState value={row.github_user} label="No GitHub user" />
          </td>
          <td className="align-middle">
            <EmptyState value={row.referral_source} label="No referral source" />
          </td>
          <td className="align-middle">
            <CourseRequestStatusIcon status={row.approved_status} />
          </td>
          {showAll && (
            <td className="align-middle">
              {row.approved_status !== 'pending' &&
                (row.approved_by_name ?? 'Automatically Approved')}
            </td>
          )}
          <td className="align-middle py-1">
            {row.approved_status !== 'approved' && (
              <div className="d-flex flex-wrap gap-1">
                <OverlayTrigger
                  trigger="click"
                  placement="auto"
                  popover={{
                    header: 'Deny course request',
                    body: (
                      <CourseRequestDenyForm
                        request={row}
                        onCancel={() => setShowDenyPopover(false)}
                      />
                    ),
                  }}
                  show={showDenyPopover}
                  rootClose
                  onToggle={setShowDenyPopover}
                >
                  <button type="button" className="btn btn-sm btn-danger text-nowrap">
                    <i className="fa fa-times" aria-hidden="true" /> Deny
                  </button>
                </OverlayTrigger>
                <button
                  type="button"
                  className="btn btn-sm btn-success text-nowrap"
                  onClick={() => onApprove(row)}
                >
                  <i className="fa fa-check" aria-hidden="true" /> Approve
                </button>
              </div>
            )}
          </td>
          <td className="align-middle">
            <Dropdown>
              <Dropdown.Toggle
                variant="secondary"
                size="sm"
                className="btn-xs"
                aria-label={`Show details for ${row.short_name}`}
              >
                Show details
              </Dropdown.Toggle>
              <Dropdown.Menu popperConfig={{ strategy: 'fixed' }} renderOnMount>
                <Dropdown.Item as="button" onClick={() => setNoteOpen(!noteOpen)}>
                  {noteOpen ? 'Close note' : 'Edit note'}
                </Dropdown.Item>
                {row.jobs.length > 0 && (
                  <Dropdown.Item as="button" onClick={() => setJobsOpen(!jobsOpen)}>
                    {jobsOpen ? 'Hide jobs' : 'Show jobs'}
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown>
          </td>
        </tr>
        {noteOpen && (
          <tr>
            <td colSpan={showAll ? 11 : 10} className="p-0">
              <CourseRequestEditNoteForm request={row} onCancel={() => setNoteOpen(false)} />
            </td>
          </tr>
        )}
        {row.jobs.length > 0 && (
          <tr>
            <td colSpan={showAll ? 11 : 10} className="p-0">
              {jobsOpen && (
                <table
                  className="table table-sm table-active mb-0"
                  aria-label="Course request jobs"
                >
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>User</th>
                      <th>Status</th>
                      <th>
                        <span className="visually-hidden">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...row.jobs].reverse().map((job) => {
                      return (
                        <tr key={job.id}>
                          <td>{job.number}</td>
                          <td>{job.start_date.toISOString()}</td>
                          <td>{job.finish_date?.toISOString()}</td>
                          <td>{job.authn_user_name}</td>
                          <td>
                            <JobStatus status={job.status} />
                          </td>
                          <td>
                            <a
                              href={getAdministratorJobSequenceUrl(job.id)}
                              className="btn btn-xs btn-info float-end"
                            >
                              Details
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </>
    );
  },
);

function CourseRequestApproveModal({
  show,
  data,
  onHide,
  onExited,
  institutions,
  availableTimezones,
  coursesRoot,
  aiSecretsConfigured,
}: ReturnType<typeof useModalState<CourseRequestRow>> & {
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  aiSecretsConfigured: boolean;
}) {
  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide} onExited={onExited}>
      {data && (
        <CourseRequestApproveModalContent
          key={data.id}
          request={data}
          institutions={institutions}
          availableTimezones={availableTimezones}
          coursesRoot={coursesRoot}
          aiSecretsConfigured={aiSecretsConfigured}
          onCancel={onHide}
        />
      )}
    </Modal>
  );
}

function CourseRequestApproveModalContent({
  request,
  institutions,
  availableTimezones,
  coursesRoot,
  aiSecretsConfigured,
  onCancel,
}: {
  request: CourseRequestRow;
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  aiSecretsConfigured: boolean;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courseRequests.createCourse.mutationOptions());
  const appError = getAppError<AdminCourseRequestError['CreateCourse']>(mutation.error);

  const userInstitution = institutions.find((i) => i.id === request.user_institution_id);
  const isDefaultInstitution = userInstitution?.short_name === 'Default';
  const autoFilledInstitutionId =
    userInstitution && !isDefaultInstitution ? userInstitution.id : null;
  const defaultInstitutionId = autoFilledInstitutionId ?? '';
  const defaultTimezone =
    userInstitution && autoFilledInstitutionId ? userInstitution.display_timezone : '';

  const repoName = buildRepoShortName(null, request.short_name);
  const path = coursesRoot + '/' + repoName;

  const methods = useForm<CourseRequestApproveFormData>({
    mode: 'onSubmit',
    defaultValues: {
      institution_id: defaultInstitutionId,
      short_name: request.short_name,
      title: request.title,
      display_timezone: defaultTimezone,
      path,
      repository_short_name: repoName,
      github_user: request.github_user ?? '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;
  const institutionId = methods.watch('institution_id');
  const prefixState = useInstitutionPrefix(institutionId, institutions);

  const onSubmit = (data: CourseRequestApproveFormData) => {
    mutation.mutate(
      {
        courseRequestId: request.id,
        shortName: data.short_name,
        title: data.title,
        institutionId: data.institution_id,
        displayTimezone: data.display_timezone,
        path: data.path,
        repoShortName: data.repository_short_name,
        githubUser: data.github_user,
      },
      {
        onSuccess: ({ jobSequenceId }) => {
          window.location.href = getAdministratorJobSequenceUrl(jobSequenceId);
        },
      },
    );
  };

  const legitimacyQuery = useQuery({
    ...trpc.courseRequests.checkInstructorLegitimacy.queryOptions({
      courseRequestId: request.id,
    }),
    enabled: false,
  });

  return (
    <FormProvider {...methods}>
      <form
        name={`create-course-from-request-form-${request.id}`}
        onSubmit={handleSubmit(onSubmit)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Approve course request</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="card mb-3">
            <div className="card-header d-flex align-items-center justify-content-between py-2">
              <strong>Requesting instructor</strong>
              <OverlayTrigger
                trigger={['hover', 'focus']}
                placement="bottom"
                tooltip={{
                  body: aiSecretsConfigured
                    ? 'Uses AI web search to verify whether the instructor appears in faculty directories or professional profiles at their stated institution.'
                    : 'AI features require the corresponding OpenAI key to be configured.',
                  props: { id: 'check-instructor-legitimacy-tooltip' },
                }}
              >
                <span className="d-inline-block">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={legitimacyQuery.isFetching || !aiSecretsConfigured}
                    aria-busy={legitimacyQuery.isFetching}
                    onClick={() => legitimacyQuery.refetch()}
                  >
                    {legitimacyQuery.isFetching ? (
                      <>
                        <i className="fa fa-spinner fa-spin" aria-hidden="true" /> Checking...
                      </>
                    ) : (
                      <>
                        <i className="fa fa-search" aria-hidden="true" /> Check legitimacy
                      </>
                    )}
                  </button>
                </span>
              </OverlayTrigger>
            </div>
            <div className="card-body py-2">
              <div className="row g-2 small">
                <div className="col-12">
                  <strong>Requested by:</strong>{' '}
                  {request.first_name || request.last_name ? (
                    <span>
                      {request.first_name} {request.last_name}
                      {request.work_email && ` (${request.work_email})`}
                    </span>
                  ) : request.work_email ? (
                    <span>{request.work_email}</span>
                  ) : (
                    <span className="fst-italic text-muted">Not provided</span>
                  )}
                </div>
                <div className="col-12">
                  <strong>PrairieLearn user:</strong>{' '}
                  {request.user_name ? (
                    <span>
                      {request.user_name} ({request.user_uid})
                    </span>
                  ) : (
                    <span>{request.user_uid}</span>
                  )}
                </div>
                <div className="col-12">
                  <strong>Institution:</strong>{' '}
                  {request.institution ? (
                    <span>{request.institution}</span>
                  ) : (
                    <span className="fst-italic text-muted">Not provided</span>
                  )}
                </div>
                <div className="col-12">
                  <strong>GitHub:</strong>{' '}
                  {request.github_user ? (
                    <a
                      href={`https://github.com/${request.github_user}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {request.github_user}
                    </a>
                  ) : (
                    <span className="fst-italic text-muted">Not provided</span>
                  )}
                </div>
              </div>
              <div aria-live="polite" aria-atomic="true">
                {legitimacyQuery.isError && (
                  <div className="mt-2 text-danger small">
                    Failed to check legitimacy. Try again.
                  </div>
                )}
                {legitimacyQuery.data && (
                  <div className="mt-2 pt-2 border-top">
                    <div className="d-flex align-items-start gap-2">
                      <span
                        className={clsx('badge', {
                          'text-bg-success':
                            legitimacyQuery.data.legitimate &&
                            legitimacyQuery.data.confidence === 'high',
                          'text-bg-warning':
                            legitimacyQuery.data.legitimate &&
                            legitimacyQuery.data.confidence !== 'high',
                          'text-bg-danger': !legitimacyQuery.data.legitimate,
                        })}
                      >
                        {legitimacyQuery.data.legitimate
                          ? 'Likely legitimate'
                          : 'Likely not legitimate'}{' '}
                        &middot; {legitimacyQuery.data.confidence} confidence
                      </span>
                    </div>
                    <small className="text-muted">
                      <ReactMarkdown>{legitimacyQuery.data.summary}</ReactMarkdown>
                    </small>
                    {legitimacyQuery.data.sources.length > 0 && (
                      <div className="mt-1">
                        <span className="small text-muted">Sources</span>
                        <div className="d-flex flex-wrap gap-1">
                          {[
                            ...new Map(
                              legitimacyQuery.data.sources.map((s) => [s.url, s]),
                            ).values(),
                          ].map((source) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="small"
                            >
                              {source.title ?? source.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <AdministratorCourseFormFields
            institutions={institutions}
            availableTimezones={availableTimezones}
            coursesRoot={coursesRoot}
            prefixState={prefixState}
            emailDomain={request.work_email?.split('@')[1] ?? ''}
            aiSecretsConfigured={aiSecretsConfigured}
            autoFilledInstitutionId={autoFilledInstitutionId}
          />
          <div className="mb-3">
            <label className="form-label" htmlFor="courseRequestAddInputGithubUser">
              GitHub username
            </label>
            <input
              type="text"
              className="form-control"
              id="courseRequestAddInputGithubUser"
              {...register('github_user')}
            />
          </div>
          <MutationError appError={appError} onDismiss={() => mutation.reset()} />
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
            Create course
          </button>
        </Modal.Footer>
      </form>
    </FormProvider>
  );
}

function MutationError({
  appError,
  onDismiss,
}: {
  appError: AppError<AdminCourseRequestError['CreateCourse']> | null;
  onDismiss: () => void;
}) {
  if (!appError) return null;

  if (appError.code === 'CONFLICTS') {
    return (
      <Alert variant="danger" className="mb-3" dismissible onClose={onDismiss}>
        <Alert.Heading as="h6" className="mb-1">
          <i className="fa fa-times-circle" aria-hidden="true" /> Conflicts detected
        </Alert.Heading>
        <ul className="mb-0 small">
          {appError.repoCourse && (
            <li>
              A course with this repository name already exists:{' '}
              <a href={`/pl/course/${appError.repoCourse.id}`} target="_blank" rel="noreferrer">
                {appError.repoCourse.short_name}: {appError.repoCourse.title}
              </a>
            </li>
          )}
          {appError.githubRepoUrl && (
            <li>
              A GitHub repository with this name already exists. This can happen if a repository was
              previously renamed.{' '}
              <a href={appError.githubRepoUrl} target="_blank" rel="noreferrer">
                Open repo
              </a>
              .
            </li>
          )}
          {appError.pathCourse && (
            <li>
              A course with this path already exists:{' '}
              <a href={`/pl/course/${appError.pathCourse.id}`} target="_blank" rel="noreferrer">
                {appError.pathCourse.short_name}: {appError.pathCourse.title}
              </a>
            </li>
          )}
        </ul>
      </Alert>
    );
  }

  return (
    <Alert variant="danger" dismissible onClose={onDismiss}>
      {appError.message}
    </Alert>
  );
}

function CourseRequestDenyForm({
  request,
  onCancel,
}: {
  request: CourseRequestRow;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courseRequests.deny.mutationOptions());
  const appError = getAppError<Record<string, never>>(mutation.error);

  return (
    <>
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
        </Alert>
      )}
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { courseRequestId: request.id },
              { onSuccess: () => window.location.reload() },
            )
          }
        >
          Deny
        </button>
      </div>
    </>
  );
}

function CourseRequestStatusIcon({ status }: { status: CourseRequestRow['approved_status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span className="badge text-bg-secondary">
          <i className="fa fa-clock" aria-hidden="true" /> Pending
        </span>
      );
    case 'creating':
      return (
        <span className="badge text-bg-info">
          <i className="fa fa-sync" aria-hidden="true" /> Job in progress
        </span>
      );
    case 'failed':
      return (
        <span className="badge text-bg-danger">
          <i className="fa fa-times" aria-hidden="true" /> Job failed
        </span>
      );
    case 'approved':
      return (
        <span className="badge text-bg-success">
          <i className="fa fa-check" aria-hidden="true" /> Approved
        </span>
      );
    case 'denied':
      return (
        <span className="badge text-bg-danger">
          <i className="fa fa-times" aria-hidden="true" /> Denied
        </span>
      );
  }
}

function CourseRequestEditNoteForm({
  request,
  onCancel,
}: {
  request: CourseRequestRow;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courseRequests.updateNote.mutationOptions());
  const appError = getAppError<Record<string, never>>(mutation.error);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = useForm<{ note: string }>({
    defaultValues: { note: request.note ?? '' },
  });

  const onSubmit = ({ note }: { note: string }) => {
    mutation.mutate(
      { courseRequestId: request.id, note },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="d-flex gap-2 align-items-center py-2 px-2">
        <label className="visually-hidden" htmlFor={`course-request-note-${request.id}`}>
          Note for course request {request.short_name}
        </label>
        <textarea
          className="form-control flex-grow-1"
          id={`course-request-note-${request.id}`}
          rows={1}
          maxLength={10000}
          placeholder="Add a note about this course request..."
          defaultValue={request.note ?? ''}
          {...register('note')}
        />
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Close
        </button>
        <button
          type="submit"
          className="btn btn-primary text-nowrap"
          disabled={!isDirty || isSubmitting || mutation.isPending}
        >
          <i className="fa fa-save" aria-hidden="true" /> Save note
        </button>
      </div>
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
        </Alert>
      )}
    </form>
  );
}

function EmptyState({ value, label }: { value: string | null; label: string }) {
  if (value) return value;
  return <span className="text-muted fst-italic">{label}</span>;
}
