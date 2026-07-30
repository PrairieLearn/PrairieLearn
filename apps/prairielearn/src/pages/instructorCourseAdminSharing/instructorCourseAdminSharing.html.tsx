import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { useModalState } from '@prairielearn/ui';

import { CopyButton } from '../../components/CopyButton.js';
import { AppErrorAlert, getAppError } from '../../lib/client/errors.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { getCourseEditErrorUrl, getQuestionSettingsUrl } from '../../lib/client/url.js';
import type { SharingSetRow } from '../../models/sharing-set.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { SharingError } from '../../trpc/course/sharing.js';

interface InstructorCourseAdminSharingProps {
  sharingName: string | null;
  sharingToken: string;
  sharingSets: SharingSetRow[];
  publicSharingLink: string;
  canChooseSharingName: boolean;
  canEdit: boolean;
  origHash: string;
  courseId: string;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

export function InstructorCourseAdminSharing(props: InstructorCourseAdminSharingProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({
      csrfToken: props.trpcCsrfToken,
      courseId: props.courseId,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorCourseAdminSharingInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorCourseAdminSharing.displayName = 'InstructorCourseAdminSharing';

function InstructorCourseAdminSharingInner({
  sharingName: initialSharingName,
  sharingToken: initialSharingToken,
  sharingSets: initialSharingSets,
  publicSharingLink,
  canChooseSharingName,
  canEdit,
  origHash: initialOrigHash,
  courseId,
}: InstructorCourseAdminSharingProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [sharingName, setSharingName] = useState(initialSharingName);
  const [sharingToken, setSharingToken] = useState(initialSharingToken);
  const [origHash, setOrigHash] = useState(initialOrigHash);

  const sharingSetsQuery = useQuery({
    ...trpc.sharing.listSharingSets.queryOptions(),
    initialData: initialSharingSets,
  });
  const sharingSets = sharingSetsQuery.data;

  const invalidateSharingSets = () =>
    queryClient.invalidateQueries(trpc.sharing.listSharingSets.queryFilter());

  const chooseSharingNameModal = useModalState();
  const addSharingSetModal = useModalState();
  const addCourseModal = useModalState<SharingSetRow>();
  const editDescriptionModal = useModalState<SharingSetRow>();
  const deleteModal = useModalState<SharingSetRow>();

  return (
    <>
      <ChooseSharingNameModal
        show={chooseSharingNameModal.show}
        canChooseSharingName={canChooseSharingName}
        currentSharingName={sharingName}
        onSuccess={(name) => {
          setSharingName(name);
          chooseSharingNameModal.hide();
        }}
        onHide={chooseSharingNameModal.hide}
        onExited={chooseSharingNameModal.onExited}
      />
      {canEdit && (
        <AddSharingSetModal
          show={addSharingSetModal.show}
          origHash={origHash}
          courseId={courseId}
          onSuccess={(newOrigHash) => {
            setOrigHash(newOrigHash);
            void invalidateSharingSets();
            addSharingSetModal.hide();
          }}
          onHide={addSharingSetModal.hide}
          onExited={addSharingSetModal.onExited}
        />
      )}
      <AddCourseToSharingSetModal
        show={addCourseModal.show}
        data={addCourseModal.data}
        onSuccess={() => {
          void invalidateSharingSets();
          addCourseModal.hide();
        }}
        onHide={addCourseModal.hide}
        onExited={addCourseModal.onExited}
      />
      {canEdit && (
        <EditSharingSetDescriptionModal
          show={editDescriptionModal.show}
          data={editDescriptionModal.data}
          origHash={origHash}
          courseId={courseId}
          onSuccess={(newOrigHash) => {
            setOrigHash(newOrigHash);
            void invalidateSharingSets();
            editDescriptionModal.hide();
          }}
          onHide={editDescriptionModal.hide}
          onExited={editDescriptionModal.onExited}
        />
      )}
      {canEdit && (
        <DeleteSharingSetModal
          show={deleteModal.show}
          data={deleteModal.data}
          origHash={origHash}
          courseId={courseId}
          onSuccess={(newOrigHash) => {
            setOrigHash(newOrigHash);
            void invalidateSharingSets();
            deleteModal.hide();
          }}
          onHide={deleteModal.hide}
          onExited={deleteModal.onExited}
        />
      )}

      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex">
          <h1>Course sharing details</h1>
        </div>
        <div className="table-responsive">
          <table
            className="table table-sm table-hover two-column-description"
            aria-label="Course sharing details"
          >
            <tbody>
              <tr>
                <th>Sharing name</th>
                <td data-testid="sharing-name">
                  {sharingName !== null ? sharingName : ''}
                  {canEdit && canChooseSharingName && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary mx-2"
                      aria-label="Choose sharing name"
                      onClick={() => chooseSharingNameModal.showWithData(null)}
                    >
                      <i className="bi bi-share-fill" aria-hidden="true" />
                      <span className="d-none d-sm-inline"> Choose sharing name</span>
                    </button>
                  )}
                </td>
              </tr>
              <tr>
                <th>Sharing Token</th>
                <td>
                  {sharingToken}
                  <CopyButton
                    text={sharingToken}
                    label="Copy"
                    className="btn-xs btn-secondary mx-2"
                  />
                  {canEdit && <RegenerateSharingTokenButton onRegenerated={setSharingToken} />}
                </td>
              </tr>
              <tr>
                <th>Public Questions Page</th>
                <td className="align-middle">
                  <a href={publicSharingLink} target="_blank" rel="noreferrer">
                    {publicSharingLink}
                  </a>
                  <CopyButton
                    text={publicSharingLink}
                    label="Copy"
                    className="btn-xs btn-secondary mx-2"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h2>Sharing sets</h2>
          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => addSharingSetModal.showWithData(null)}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" /> Add sharing set
            </button>
          )}
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover table-striped" aria-label="Sharing sets">
            <thead>
              <tr>
                <th>Sharing Set Name</th>
                <th>Description</th>
                <th>Shared With</th>
                {canEdit && <th className="text-end">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sharingSets.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 4 : 3}
                    className="text-center text-muted align-middle py-3"
                  >
                    No sharing sets defined yet.
                  </td>
                </tr>
              ) : (
                sharingSets.map((sharingSet) => (
                  <SharingSetTableRow
                    key={sharingSet.id}
                    sharingSet={sharingSet}
                    courseId={courseId}
                    canEdit={canEdit}
                    onAddCourse={() => addCourseModal.showWithData(sharingSet)}
                    onEditDescription={() => editDescriptionModal.showWithData(sharingSet)}
                    onDelete={() => deleteModal.showWithData(sharingSet)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SharingSetTableRow({
  sharingSet,
  courseId,
  canEdit,
  onAddCourse,
  onEditDescription,
  onDelete,
}: {
  sharingSet: SharingSetRow;
  courseId: string;
  canEdit: boolean;
  onAddCourse: () => void;
  onEditDescription: () => void;
  onDelete: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inUse = sharingSet.question_count > 0 || sharingSet.shared_with.length > 0;
  const detailsId = `sharing-set-questions-${sharingSet.id}`;
  return (
    <Fragment>
      <tr>
        <td className="align-middle">
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-decoration-none align-baseline"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={() => setIsExpanded((v) => !v)}
          >
            <i
              className={clsx('bi', isExpanded ? 'bi-chevron-down' : 'bi-chevron-right', 'me-1')}
              aria-hidden="true"
            />
            {sharingSet.name}
          </button>{' '}
          <span className="text-muted small">
            ({sharingSet.question_count}{' '}
            {sharingSet.question_count === 1 ? 'question' : 'questions'})
          </span>
        </td>
        <td className="align-middle text-muted">{sharingSet.description ?? ''}</td>
        <td className="align-middle" data-testid="shared-with">
          {sharingSet.shared_with.map((courseSharedWith) => (
            <span key={courseSharedWith} className="badge color-gray1">
              {courseSharedWith}
            </span>
          ))}
          {canEdit && (
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark"
                aria-label="Add course to sharing set"
                onClick={onAddCourse}
              >
                Add...
                <i className="bi bi-plus-lg" aria-hidden="true" />
              </button>
            </div>
          )}
        </td>
        {canEdit && (
          <td className="align-middle">
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                aria-label={`Edit description for ${sharingSet.name}`}
                onClick={onEditDescription}
              >
                <i className="bi bi-pencil" aria-hidden="true" /> Edit
              </button>
              {inUse ? (
                <span
                  className="d-inline-block"
                  title="Cannot delete: sharing set contains questions or has been shared with other courses."
                >
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    aria-label={`Delete sharing set ${sharingSet.name}`}
                    disabled
                  >
                    <i className="bi bi-trash" aria-hidden="true" /> Delete
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  aria-label={`Delete sharing set ${sharingSet.name}`}
                  onClick={onDelete}
                >
                  <i className="bi bi-trash" aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr id={detailsId}>
          <td colSpan={canEdit ? 4 : 3} className="bg-light">
            {sharingSet.questions.length === 0 ? (
              <div className="small text-muted">No questions in this sharing set yet.</div>
            ) : (
              <div className="d-flex flex-wrap gap-1">
                {sharingSet.questions.map((q) => (
                  <a
                    key={q.id}
                    href={getQuestionSettingsUrl({ questionId: q.id, courseId })}
                    className="btn btn-badge color-gray1"
                  >
                    {q.qid}
                  </a>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function RegenerateSharingTokenButton({
  onRegenerated,
}: {
  onRegenerated: (sharingToken: string) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.regenerateSharingToken.mutationOptions());
  return (
    <>
      <button
        type="button"
        className="btn btn-xs btn-secondary"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate(undefined, {
            onSuccess: ({ sharingToken }) => onRegenerated(sharingToken),
          })
        }
      >
        <i className="bi bi-arrow-clockwise" aria-hidden="true" /> <span>Regenerate</span>
      </button>
      <AppErrorAlert
        error={getAppError<SharingError['RegenerateSharingToken']>(mutation.error)}
        className="mt-2"
        render={{
          UNKNOWN: ({ message }) => message,
        }}
        onDismiss={() => mutation.reset()}
      />
    </>
  );
}

function ChooseSharingNameModal({
  show,
  onHide,
  onExited,
  onSuccess,
  canChooseSharingName,
  currentSharingName,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: (sharingName: string) => void;
  canChooseSharingName: boolean;
  currentSharingName: string | null;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.chooseSharingName.mutationOptions());
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = useForm<{ courseSharingName: string }>({
    mode: 'onSubmit',
    defaultValues: { courseSharingName: currentSharingName ?? '' },
  });

  const onSubmit = (data: { courseSharingName: string }) => {
    mutation.mutate(
      { courseSharingName: data.courseSharingName },
      { onSuccess: () => onSuccess(data.courseSharingName) },
    );
  };

  const handleHide = () => {
    if (isSubmitting || mutation.isPending) return;
    mutation.reset();
    onHide();
  };

  const handleExited = () => {
    reset({ courseSharingName: currentSharingName ?? '' });
    mutation.reset();
    onExited();
  };

  if (!canChooseSharingName) {
    return (
      <Modal show={show} onHide={handleHide} onExited={handleExited}>
        <Modal.Header closeButton>
          <Modal.Title>Choose sharing name</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <strong>Unable to change your course's sharing name.</strong>
          <p>
            Your course's sharing name cannot be changed because at least one question has been
            shared. Doing so would break the assessments of other courses that have imported your
            questions.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Close
          </button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal show={show} onHide={handleHide} onExited={handleExited}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Choose sharing name</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={getAppError<SharingError['ChooseSharingName']>(mutation.error)}
            render={{
              DUPLICATE_NAME: ({ message }) => message,
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => mutation.reset()}
          />
          <p className="form-text">Enter the sharing name you would like for your course.</p>
          <div className="mb-3">
            <label className="form-label" htmlFor="course_sharing_name">
              Sharing name
            </label>
            <input
              className="form-control"
              type="text"
              id="course_sharing_name"
              defaultValue={currentSharingName ?? ''}
              aria-invalid={errors.courseSharingName ? 'true' : undefined}
              aria-errormessage={errors.courseSharingName ? 'course_sharing_name_error' : undefined}
              {...register('courseSharingName', {
                required: 'Course sharing name is required.',
                validate: (v) =>
                  (!v.includes('/') && !v.includes('@')) ||
                  'Course sharing name cannot contain "/" or "@".',
              })}
            />
            {errors.courseSharingName && (
              <div id="course_sharing_name_error" className="text-danger small">
                <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                {errors.courseSharingName.message}
              </div>
            )}
          </div>
          <Alert variant="secondary" className="py-2 small">
            <strong>
              Once you have shared a question either publicly or with another course, you will no
              longer be able to change your sharing name.
            </strong>{' '}
            Doing so would break the assessments of other courses that have imported your questions.
          </Alert>
          <p className="form-text mb-0">
            It is recommended that you choose something short but descriptive. For example, if
            you're teaching a calculus course at a university that goes by the abbreviation{' '}
            <code>XYZ</code>, then you could choose the sharing name <code>xyz-calculus</code>. Then
            other courses will import questions from your course with the syntax{' '}
            <code>@xyz-calculus/&lt;qid&gt;</code>.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isSubmitting || mutation.isPending}
            onClick={handleHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || mutation.isPending}
          >
            Choose sharing name
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddSharingSetModal({
  show,
  onHide,
  onExited,
  onSuccess,
  origHash,
  courseId,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: (origHash: string) => void;
  origHash: string;
  courseId: string;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.createSharingSet.mutationOptions());
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = useForm<{ name: string; description: string }>({
    mode: 'onSubmit',
    defaultValues: { name: '', description: '' },
  });

  const appError = getAppError<SharingError['CreateSharingSet']>(mutation.error);
  const inlineError = appError?.code === 'SYNC_JOB_FAILED' ? null : appError;

  const onSubmit = (data: { name: string; description: string }) => {
    mutation.mutate(
      {
        name: data.name,
        description: data.description || undefined,
        origHash,
      },
      {
        onSuccess: ({ origHash: newOrigHash }) => onSuccess(newOrigHash),
        onError: (err) => {
          const ae = getAppError<SharingError['CreateSharingSet']>(err);
          if (ae?.code === 'SYNC_JOB_FAILED') {
            window.location.assign(getCourseEditErrorUrl(courseId, ae.jobSequenceId));
          }
        },
      },
    );
  };

  const handleHide = () => {
    if (isSubmitting || mutation.isPending) return;
    mutation.reset();
    onHide();
  };

  const handleExited = () => {
    reset({ name: '', description: '' });
    mutation.reset();
    onExited();
  };

  return (
    <Modal show={show} onHide={handleHide} onExited={handleExited}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Add sharing set</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={inlineError}
            render={{
              DUPLICATE_NAME: ({ message }) => message,
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => mutation.reset()}
          />
          <p className="small text-muted">
            A{' '}
            <a
              href="https://docs.prairielearn.com/contentSharing/#sharing-sets"
              target="_blank"
              rel="noopener noreferrer"
            >
              sharing set
            </a>{' '}
            is a named set of questions which you can share to another course. This lets you share
            different sets of your questions &mdash; for example, share some questions only with
            other courses in your department. See the{' '}
            <a
              href="https://docs.prairielearn.com/contentSharing/"
              target="_blank"
              rel="noopener noreferrer"
            >
              content sharing docs
            </a>{' '}
            for details.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="new_sharing_set_name">
              Name
            </label>
            <input
              type="text"
              className="form-control"
              id="new_sharing_set_name"
              defaultValue=""
              aria-invalid={errors.name ? 'true' : undefined}
              aria-errormessage={errors.name ? 'new_sharing_set_name_error' : undefined}
              {...register('name', {
                required: 'Sharing set name is required.',
                validate: (v) =>
                  (!v.includes('/') && !v.includes('@')) ||
                  'Sharing set names cannot contain "/" or "@".',
              })}
            />
            {errors.name ? (
              <div id="new_sharing_set_name_error" className="text-danger small">
                <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                {errors.name.message}
              </div>
            ) : (
              <small className="form-text text-muted">
                A short identifier, e.g. <code>exam-questions</code>. Cannot contain "/" or "@".
              </small>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="new_sharing_set_description">
              Description (optional)
            </label>
            <textarea
              className="form-control"
              id="new_sharing_set_description"
              rows={2}
              defaultValue=""
              {...register('description')}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isSubmitting || mutation.isPending}
            onClick={handleHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || mutation.isPending}
          >
            Add sharing set
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddCourseToSharingSetModal({
  show,
  data,
  onHide,
  onExited,
  onSuccess,
}: {
  show: boolean;
  data: SharingSetRow | null;
  onHide: () => void;
  onExited: () => void;
  onSuccess: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.addCourseToSharingSet.mutationOptions());
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = useForm<{ courseSharingToken: string }>({
    mode: 'onSubmit',
    defaultValues: { courseSharingToken: '' },
  });

  if (!data) return null;

  const onSubmit = (formData: { courseSharingToken: string }) => {
    mutation.mutate(
      { sharingSetId: data.id, courseSharingToken: formData.courseSharingToken },
      { onSuccess },
    );
  };

  const handleHide = () => {
    if (isSubmitting || mutation.isPending) return;
    mutation.reset();
    onHide();
  };

  const handleExited = () => {
    reset({ courseSharingToken: '' });
    mutation.reset();
    onExited();
  };

  return (
    <Modal show={show} onHide={handleHide} onExited={handleExited}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Add course to sharing set</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={getAppError<SharingError['AddCourseToSharingSet']>(mutation.error)}
            render={{
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => mutation.reset()}
          />
          <p className="form-text text-wrap">
            To allow another course to access questions in the sharing set "{data.name}", enter
            their course sharing token below.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="course_sharing_token">
              Course sharing token
            </label>
            <input
              className="form-control"
              type="text"
              id="course_sharing_token"
              defaultValue=""
              aria-invalid={errors.courseSharingToken ? 'true' : undefined}
              aria-errormessage={
                errors.courseSharingToken ? 'course_sharing_token_error' : undefined
              }
              {...register('courseSharingToken', {
                required: 'Course sharing token is required.',
              })}
            />
            {errors.courseSharingToken && (
              <div id="course_sharing_token_error" className="text-danger small">
                <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                {errors.courseSharingToken.message}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isSubmitting || mutation.isPending}
            onClick={handleHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || mutation.isPending}
          >
            Add course
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function EditSharingSetDescriptionModal({
  show,
  data,
  onHide,
  onExited,
  onSuccess,
  origHash,
  courseId,
}: {
  show: boolean;
  data: SharingSetRow | null;
  onHide: () => void;
  onExited: () => void;
  onSuccess: (origHash: string) => void;
  origHash: string;
  courseId: string;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.updateSharingSetDescription.mutationOptions());
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ description: string }>({
    mode: 'onSubmit',
    values: { description: data?.description ?? '' },
  });

  const appError = getAppError<SharingError['UpdateSharingSetDescription']>(mutation.error);
  const inlineError = appError?.code === 'SYNC_JOB_FAILED' ? null : appError;

  if (!data) return null;
  const defaultDescription = data.description ?? '';

  const onSubmit = (formData: { description: string }) => {
    mutation.mutate(
      { name: data.name, description: formData.description || undefined, origHash },
      {
        onSuccess: ({ origHash: newOrigHash }) => onSuccess(newOrigHash),
        onError: (err) => {
          const ae = getAppError<SharingError['UpdateSharingSetDescription']>(err);
          if (ae?.code === 'SYNC_JOB_FAILED') {
            window.location.assign(getCourseEditErrorUrl(courseId, ae.jobSequenceId));
          }
        },
      },
    );
  };

  const handleHide = () => {
    if (isSubmitting || mutation.isPending) return;
    mutation.reset();
    onHide();
  };

  const handleExited = () => {
    mutation.reset();
    onExited();
  };

  return (
    <Modal show={show} onHide={handleHide} onExited={handleExited}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit sharing set "{data.name}"</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={inlineError}
            render={{
              NOT_FOUND: ({ message }) => message,
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => mutation.reset()}
          />
          <div className="mb-3">
            <label className="form-label" htmlFor={`sharing_set_description_${data.id}`}>
              Description
            </label>
            <textarea
              className="form-control"
              id={`sharing_set_description_${data.id}`}
              rows={3}
              defaultValue={defaultDescription}
              {...register('description')}
            />
            <small className="form-text text-muted">Leave blank to remove the description.</small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isSubmitting || mutation.isPending}
            onClick={handleHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || mutation.isPending}
          >
            Save
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function DeleteSharingSetModal({
  show,
  data,
  onHide,
  onExited,
  onSuccess,
  origHash,
  courseId,
}: {
  show: boolean;
  data: SharingSetRow | null;
  onHide: () => void;
  onExited: () => void;
  onSuccess: (origHash: string) => void;
  origHash: string;
  courseId: string;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharing.deleteSharingSet.mutationOptions());

  const appError = getAppError<SharingError['DeleteSharingSet']>(mutation.error);
  const inlineError = appError?.code === 'SYNC_JOB_FAILED' ? null : appError;

  if (!data) return null;

  const handleDelete = () => {
    mutation.mutate(
      { name: data.name, origHash },
      {
        onSuccess: ({ origHash: newOrigHash }) => onSuccess(newOrigHash),
        onError: (err) => {
          const ae = getAppError<SharingError['DeleteSharingSet']>(err);
          if (ae?.code === 'SYNC_JOB_FAILED') {
            window.location.assign(getCourseEditErrorUrl(courseId, ae.jobSequenceId));
          }
        },
      },
    );
  };

  const handleHide = () => {
    if (mutation.isPending) return;
    mutation.reset();
    onHide();
  };

  const handleExited = () => {
    mutation.reset();
    onExited();
  };

  return (
    <Modal show={show} onHide={handleHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>Delete sharing set</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={inlineError}
          render={{
            IN_USE: ({ message }) => message,
            NOT_FOUND: ({ message }) => message,
            UNKNOWN: ({ message }) => message,
          }}
          onDismiss={() => mutation.reset()}
        />
        <p className="form-text text-wrap">
          Delete the sharing set "{data.name}"? This cannot be undone.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={mutation.isPending}
          onClick={handleHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={mutation.isPending}
          onClick={handleDelete}
        >
          Delete
        </button>
      </Modal.Footer>
    </Modal>
  );
}
