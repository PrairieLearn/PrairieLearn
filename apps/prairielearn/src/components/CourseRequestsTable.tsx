import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Alert, Dropdown, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';

import { OverlayTrigger } from '@prairielearn/ui';

import type { AdminInstitution } from '../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../lib/client/tanstackQuery.js';
import { getAdministratorCourseRequestsUrl } from '../lib/client/url.js';
import type { CourseRequestRow } from '../lib/course-request.js';
import { createAdministratorTrpcClient } from '../trpc/administrator/trpc-client.js';
import { TRPCProvider, useTRPC } from '../trpc/administrator/trpc-context.js';

import { JobStatus } from './JobStatus.js';

interface CourseRequestApproveFormData {
  institution_id: string;
  short_name: string;
  title: string;
  display_timezone: string;
  path: string;
  repository_short_name: string;
  github_user: string;
}

export function CourseRequestsTable({
  rows,
  institutions,
  coursesRoot,
  showAll,
  trpcCsrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  institutions: AdminInstitution[];
  coursesRoot: string;
  showAll: boolean;
  trpcCsrfToken: string;
  urlPrefix: string;
}) {
  const headerPrefix = showAll ? 'All' : 'Pending';
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdministratorTrpcClient({ csrfToken: trpcCsrfToken }));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <div className="card mb-4">
          <div className="card-header bg-primary text-white d-flex align-items-center">
            <h2>{headerPrefix} course requests</h2>
            {!showAll && (
              <a
                className="btn btn-sm btn-light ms-auto"
                href={getAdministratorCourseRequestsUrl({ urlPrefix })}
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
                    institutions={institutions}
                    coursesRoot={coursesRoot}
                    showAll={showAll}
                    urlPrefix={urlPrefix}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-footer">
            <small>
              Accepting a course request will automatically create a new GitHub repository and add
              the course to the database.
            </small>
          </div>
        </div>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseRequestsTable.displayName = 'CourseRequestsTable';

function CourseRequestTableRow({
  row,
  institutions,
  coursesRoot,
  showAll,
  urlPrefix,
}: {
  row: CourseRequestRow;
  institutions: AdminInstitution[];
  coursesRoot: string;
  showAll: boolean;
  urlPrefix: string;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(row.note));
  const [jobsOpen, setJobsOpen] = useState(false);
  const [showDenyPopover, setShowDenyPopover] = useState(false);
  const [showApprovePopover, setShowApprovePopover] = useState(false);

  return (
    <>
      <tr>
        <td className="align-middle">{row.created_at.toISOString()}</td>
        <td className="align-middle">
          {row.short_name}: {row.title}
        </td>
        <td className="align-middle">{row.institution}</td>
        <td className="align-middle">
          {row.first_name} {row.last_name} ({row.work_email})
        </td>
        <td className="align-middle">
          {row.user_name} ({row.user_uid})
        </td>
        <td className="align-middle">{row.github_user}</td>
        <td className="align-middle">{row.referral_source}</td>
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
                onClick={() => setShowApprovePopover(true)}
              >
                <i className="fa fa-check" aria-hidden="true" /> Approve
              </button>
              <Modal
                show={showApprovePopover}
                backdrop="static"
                onHide={() => setShowApprovePopover(false)}
              >
                <Modal.Body>
                  <CourseRequestApproveForm
                    request={row}
                    institutions={institutions}
                    coursesRoot={coursesRoot}
                    urlPrefix={urlPrefix}
                    onCancel={() => setShowApprovePopover(false)}
                  />
                </Modal.Body>
              </Modal>
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
              <table className="table table-sm table-active mb-0" aria-label="Course request jobs">
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
                            href={`${urlPrefix}/administrator/jobSequence/${job.id}`}
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
}

function CourseRequestApproveForm({
  request,
  institutions,
  coursesRoot,
  urlPrefix,
  onCancel,
}: {
  request: CourseRequestRow;
  institutions: AdminInstitution[];
  coursesRoot: string;
  urlPrefix: string;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.courseRequests.createCourseMutation.mutationOptions());

  const repoName = 'pl-' + request.short_name.replaceAll(' ', '').toLowerCase();
  const path = coursesRoot + '/' + repoName;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CourseRequestApproveFormData>({
    mode: 'onSubmit',
    defaultValues: {
      institution_id: '',
      short_name: request.short_name,
      title: request.title,
      display_timezone: '',
      path,
      repository_short_name: repoName,
      github_user: request.github_user ?? '',
    },
  });
  const institutionId = watch('institution_id');

  const { data: prefixData } = useQuery({
    ...trpc.courseRequests.selectInstitutionPrefixQuery.queryOptions({ institutionId }),
    enabled: !!institutionId,
  });

  useEffect(() => {
    if (prefixData?.prefix) {
      const shortNameSlug = request.short_name.replaceAll(' ', '').toLowerCase();
      const newRepoName = `pl-${prefixData.prefix}-${shortNameSlug}`;
      setValue('repository_short_name', newRepoName);
      setValue('path', `${coursesRoot}/${newRepoName}`);
    }
  }, [prefixData, request.short_name, coursesRoot, setValue]);

  const selectedInstitution = institutions.find((i) => i.id === institutionId);
  const isDefaultInstitution = selectedInstitution?.short_name === 'Default';

  const onSubmit = async (data: CourseRequestApproveFormData) => {
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
          window.location.href = `${urlPrefix}/administrator/jobSequence/${jobSequenceId}/`;
        },
      },
    );
  };

  const {
    data: legitimacyData,
    isFetching: isCheckingLegitimacy,
    isError: isLegitimacyError,
    refetch: checkLegitimacy,
  } = useQuery({
    ...trpc.courseRequests.checkInstructorLegitimacyQuery.queryOptions({
      courseRequestId: request.id,
    }),
    enabled: false,
  });

  const emailDomain = request.work_email?.split('@')[1] ?? '';
  const {
    data: suggestedPrefixData,
    isFetching: isFetchingPrefix,
    isError: isPrefixError,
    refetch: suggestRepositoryNamePrefix,
  } = useQuery({
    ...trpc.courseRequests.suggestPrefixFromEmailQuery.queryOptions({
      institutionName: request.institution ?? '',
      emailDomain,
    }),
    enabled: false,
  });

  useEffect(() => {
    if (suggestedPrefixData?.prefix) {
      const shortNameSlug = request.short_name.replaceAll(' ', '').toLowerCase();
      const newRepoName = `pl-${suggestedPrefixData.prefix}-${shortNameSlug}`;
      setValue('repository_short_name', newRepoName);
      setValue('path', `${coursesRoot}/${newRepoName}`);
    }
  }, [suggestedPrefixData, request.short_name, coursesRoot, setValue]);

  return (
    <form name={`create-course-from-request-form-${request.id}`} onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInstitution">
          Institution:
        </label>
        <select
          id="courseRequestAddInstitution"
          className={clsx(
            'form-select',
            selectedInstitution && isDefaultInstitution && 'is-warning',
            errors.institution_id && 'is-invalid',
          )}
          aria-invalid={errors.institution_id ? true : undefined}
          aria-errormessage={
            errors.institution_id ? 'courseRequestAddInstitution-error' : undefined
          }
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
          <div id="courseRequestAddInstitution-error" className="invalid-feedback">
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
        <label className="form-label" htmlFor="courseRequestAddInputShortName">
          Short name:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.short_name && 'is-invalid')}
          id="courseRequestAddInputShortName"
          placeholder="XC 101"
          aria-invalid={errors.short_name ? true : undefined}
          aria-errormessage={errors.short_name ? 'courseRequestAddInputShortName-error' : undefined}
          {...register('short_name', { required: 'Enter a short name' })}
        />
        {errors.short_name && (
          <div id="courseRequestAddInputShortName-error" className="invalid-feedback">
            {errors.short_name.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputTitle">
          Title:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.title && 'is-invalid')}
          id="courseRequestAddInputTitle"
          placeholder="Template course title"
          aria-invalid={errors.title ? true : undefined}
          aria-errormessage={errors.title ? 'courseRequestAddInputTitle-error' : undefined}
          {...register('title', { required: 'Enter a title' })}
        />
        {errors.title && (
          <div id="courseRequestAddInputTitle-error" className="invalid-feedback">
            {errors.title.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputTimezone">
          Timezone:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.display_timezone && 'is-invalid')}
          id="courseRequestAddInputTimezone"
          aria-invalid={errors.display_timezone ? true : undefined}
          aria-errormessage={
            errors.display_timezone ? 'courseRequestAddInputTimezone-error' : undefined
          }
          {...register('display_timezone', { required: 'Enter a timezone' })}
        />
        {errors.display_timezone && (
          <div id="courseRequestAddInputTimezone-error" className="invalid-feedback">
            {errors.display_timezone.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputPath">
          Path:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.path && 'is-invalid')}
          id="courseRequestAddInputPath"
          aria-invalid={errors.path ? true : undefined}
          aria-errormessage={errors.path ? 'courseRequestAddInputPath-error' : undefined}
          {...register('path', { required: 'Enter a path' })}
        />
        {errors.path && (
          <div id="courseRequestAddInputPath-error" className="invalid-feedback">
            {errors.path.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputRepositoryName">
          Repository name:
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.repository_short_name && 'is-invalid')}
          id="courseRequestAddInputRepositoryName"
          aria-invalid={errors.repository_short_name ? true : undefined}
          aria-errormessage={
            errors.repository_short_name ? 'courseRequestAddInputRepositoryName-error' : undefined
          }
          {...register('repository_short_name', { required: 'Enter a repository name' })}
        />
        {errors.repository_short_name && (
          <div id="courseRequestAddInputRepositoryName-error" className="invalid-feedback">
            {errors.repository_short_name.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputGithubUser">
          GitHub username:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputGithubUser"
          {...register('github_user')}
        />
      </div>

      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
      <div className="mb-3">
        <OverlayTrigger
          trigger={['hover', 'focus']}
          placement="top"
          tooltip={{
            body: 'Uses AI web search to verify whether the instructor appears in faculty directories or professional profiles at their stated institution.',
            props: { id: 'check-instructor-legitimacy-tooltip' },
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isCheckingLegitimacy}
            aria-busy={isCheckingLegitimacy}
            onClick={() => checkLegitimacy()}
          >
            {isCheckingLegitimacy ? 'Checking...' : 'Check instructor legitimacy'}
          </button>
        </OverlayTrigger>
        {isLegitimacyError && (
          <div className="mt-2 text-danger small">Failed to check legitimacy. Try again.</div>
        )}
        {legitimacyData && (
          <div aria-live="polite" aria-atomic="true">
            <div className="mt-2 d-flex align-items-start gap-2">
              <span
                className={clsx('badge', {
                  'text-bg-success': legitimacyData.confidence === 'high',
                  'text-bg-warning': legitimacyData.confidence === 'medium',
                  'text-bg-danger': legitimacyData.confidence === 'low',
                })}
              >
                {legitimacyData.isLikely ? 'Likely legitimate' : 'Uncertain'} &middot;{' '}
                {legitimacyData.confidence} confidence
              </span>
            </div>
            <small className="text-muted">
              <ReactMarkdown>{legitimacyData.summary}</ReactMarkdown>
            </small>
            {legitimacyData.sources.length > 0 && (
              <div className="mt-1">
                <span className="small text-muted">Sources</span>
                <div className="d-flex flex-wrap gap-1">
                  {legitimacyData.sources
                    .filter(
                      (source, index, arr) => arr.findIndex((s) => s.url === source.url) === index,
                    )
                    .map((source) => (
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
      <div className="mb-3">
        <OverlayTrigger
          trigger={['hover', 'focus']}
          placement="top"
          tooltip={{
            body: 'Uses AI web search to suggest a short prefix for the repository name based on the institution (e.g. "uiuc" for the University of Illinois). Useful when no existing courses are found for the selected institution.',
            props: { id: 'suggest-prefix-tooltip' },
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isFetchingPrefix || !request.institution || !request.work_email}
            aria-busy={isFetchingPrefix}
            onClick={() => suggestRepositoryNamePrefix()}
          >
            {isFetchingPrefix ? 'Suggesting...' : 'Suggest prefix'}
          </button>
        </OverlayTrigger>
        {isPrefixError && (
          <div className="mt-2 text-danger small">Failed to suggest prefix. Try again.</div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {suggestedPrefixData && (
            <div className="mt-2 text-muted small">
              <ReactMarkdown>{suggestedPrefixData.reasoning}</ReactMarkdown>
            </div>
          )}
          {suggestedPrefixData && suggestedPrefixData.sources.length > 0 && (
            <div className="mt-1">
              <span className="small text-muted">Sources</span>
              <div className="d-flex flex-wrap gap-1">
                {suggestedPrefixData.sources
                  .filter(
                    (source, index, arr) => arr.findIndex((s) => s.url === source.url) === index,
                  )
                  .map((source) => (
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
      </div>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || mutation.isPending}
        >
          Create course
        </button>
      </div>
    </form>
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
  const mutation = useMutation(trpc.courseRequests.denyCourseRequestMutation.mutationOptions());

  return (
    <>
      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
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
  const mutation = useMutation(
    trpc.courseRequests.updateCourseRequestNoteMutation.mutationOptions(),
  );

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
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
          Cancel
        </button>
        <button type="submit" className="btn btn-primary text-nowrap" disabled={isSubmitting}>
          <i className="fa fa-save" aria-hidden="true" /> Save note
        </button>
      </div>
      {mutation.isError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
    </form>
  );
}
