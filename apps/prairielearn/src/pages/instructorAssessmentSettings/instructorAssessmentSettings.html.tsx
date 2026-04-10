import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PublicLinkSharing, StudentLinkSharing } from '../../components/LinkSharing.js';
import { AssessmentShortNameDescription } from '../../components/ShortNameDescriptions.js';
import { getAppError } from '../../lib/client/errors.js';
import type {
  StaffAssessment,
  StaffAssessmentModule,
  StaffAssessmentSet,
  StaffCourseInstance,
} from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { AssessmentToolsConfig } from '../../lib/editors.js';
import { validateShortName } from '../../lib/short-name.js';
import { encodePathNoNormalize } from '../../lib/uri-util.shared.js';
import type { AssessmentSettingsError } from '../../trpc/assessment/assessment-settings.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

interface SettingsFormValues {
  aid: string;
  title: string;
  set: string;
  number: string;
  module: string;
  text?: string;
  allow_issue_reporting: boolean;
  allow_personal_notes: boolean;
  multiple_instance: boolean;
  auto_close: boolean;
  require_honor_code: boolean;
  honor_code?: string;
  tools?: Record<string, boolean>;
}

interface InstructorAssessmentSettingsProps {
  trpcCsrfToken: string;
  urlPrefix: string;
  canEdit: boolean;
  origHash: string;
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  hasCoursePermissionView: boolean;
  assessmentGHLink: string | null;
  tids: string[];
  studentLink: string;
  publicLink: string;
  assessmentSets: StaffAssessmentSet[];
  assessmentModules: StaffAssessmentModule[];
  courseInstance: StaffCourseInstance;
  isDevMode: boolean;
  assessmentTools: AssessmentToolsConfig;
}

export function InstructorAssessmentSettings({
  trpcCsrfToken,
  urlPrefix,
  canEdit,
  origHash,
  assessment,
  assessmentSet,
  hasCoursePermissionView,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  assessmentSets,
  assessmentModules,
  courseInstance,
  isDevMode,
  assessmentTools,
}: InstructorAssessmentSettingsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentSettingsInner
          urlPrefix={urlPrefix}
          canEdit={canEdit}
          origHash={origHash}
          assessment={assessment}
          assessmentSet={assessmentSet}
          hasCoursePermissionView={hasCoursePermissionView}
          assessmentGHLink={assessmentGHLink}
          tids={tids}
          studentLink={studentLink}
          publicLink={publicLink}
          assessmentSets={assessmentSets}
          assessmentModules={assessmentModules}
          assessmentTools={assessmentTools}
          courseInstance={courseInstance}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentSettings.displayName = 'InstructorAssessmentSettings';

function InstructorAssessmentSettingsInner({
  urlPrefix,
  canEdit,
  origHash,
  assessment,
  assessmentSet,
  hasCoursePermissionView,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  assessmentSets,
  assessmentModules,
  assessmentTools,
  courseInstance,
}: Omit<InstructorAssessmentSettingsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const trpc = useTRPC();
  const [currentOrigHash, setCurrentOrigHash] = useState(origHash);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const tidSet = new Set(tids);

  const currentModuleName =
    assessmentModules.find((m) => m.id === assessment.assessment_module_id)?.name ??
    assessmentModules[0]?.name;

  const defaultValues: SettingsFormValues = {
    aid: assessment.tid ?? '',
    title: assessment.title ?? '',
    set: assessmentSet.name,
    number: assessment.number,
    module: currentModuleName,
    text: assessment.text ?? '',
    allow_issue_reporting: assessment.allow_issue_reporting ?? true,
    allow_personal_notes: assessment.allow_personal_notes,
    multiple_instance: assessment.multiple_instance,
    auto_close: assessment.auto_close ?? true,
    require_honor_code: assessment.require_honor_code ?? true,
    honor_code: assessment.honor_code ?? '',
    tools: Object.fromEntries(assessmentTools.map(({ name, enabled }) => [name, enabled])),
  };

  const {
    register,
    reset,
    watch,
    handleSubmit,
    formState: { isDirty, errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const saveMutation = useMutation(trpc.assessmentSettings.updateAssessment.mutationOptions());
  const copyMutation = useMutation(trpc.assessmentSettings.copyAssessment.mutationOptions());
  const deleteMutation = useMutation(trpc.assessmentSettings.deleteAssessment.mutationOptions());

  const appError = getAppError<AssessmentSettingsError['UpdateAssessment']>(saveMutation.error);
  const copyError = getAppError<AssessmentSettingsError['CopyAssessment']>(copyMutation.error);
  const deleteError = getAppError<AssessmentSettingsError['DeleteAssessment']>(
    deleteMutation.error,
  );

  const onFormSubmit = (data: SettingsFormValues) => {
    saveMutation.mutate(
      { ...data, origHash: currentOrigHash },
      {
        onSuccess: (result) => {
          setCurrentOrigHash(result.origHash);
          reset(data);
        },
      },
    );
  };

  const requireHonorCode = watch('require_honor_code');
  const currentAid = watch('aid');
  const currentSetName = watch('set');
  const currentNumber = watch('number');

  const currentInfoAssessmentPath = encodePathNoNormalize(
    `courseInstances/${courseInstance.short_name!}/assessments/${currentAid}/infoAssessment.json`,
  );
  const currentGHLink =
    assessmentGHLink && assessment.tid
      ? assessmentGHLink.replace(
          `/assessments/${encodeURIComponent(assessment.tid)}`,
          `/assessments/${encodeURIComponent(currentAid)}`,
        )
      : assessmentGHLink;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1>
          {currentSetName} {currentNumber}: Settings
        </h1>
        <GitHubButton gitHubLink={currentGHLink} />
      </div>
      <div className="card-body">
        <form name="edit-assessment-settings-form" onSubmit={handleSubmit(onFormSubmit)}>
          <div className="mb-3">
            <label className="form-label" htmlFor="aid">
              Short name
            </label>
            <input
              type="text"
              className={clsx('form-control font-monospace', errors.aid && 'is-invalid')}
              id="aid"
              aria-invalid={errors.aid ? 'true' : 'false'}
              aria-describedby="aid-help"
              {...(errors.aid ? { 'aria-errormessage': 'aid-error' } : {})}
              disabled={!canEdit}
              defaultValue={defaultValues.aid}
              {...register('aid', {
                required: 'Short name is required',
                validate: {
                  shortName: (value) => {
                    const result = validateShortName(value, defaultValues.aid);
                    return result.valid || result.message;
                  },
                  duplicate: (value) => {
                    if (tidSet.has(value) && value !== defaultValues.aid) {
                      return 'This ID is already in use';
                    }
                    return true;
                  },
                },
              })}
            />
            {errors.aid && (
              <div id="aid-error" className="invalid-feedback">
                {errors.aid.message}
              </div>
            )}
            <small id="aid-help" className="form-text text-muted">
              <AssessmentShortNameDescription />
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
              aria-describedby="title-help"
              disabled={!canEdit}
              defaultValue={defaultValues.title}
              {...register('title')}
            />
            <small id="title-help" className="form-text text-muted">
              The title of the assessment.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="type">
              Type
            </label>
            <input
              type="text"
              className="form-control"
              id="type"
              aria-describedby="type-help"
              value={assessment.type}
              disabled
              readOnly
            />
            <small id="type-help" className="form-text text-muted">
              The type of the assessment. This can be either Homework or Exam.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="set">
              Set
            </label>
            <Form.Select
              id="set"
              aria-describedby="set-help"
              disabled={!canEdit}
              defaultValue={defaultValues.set}
              {...register('set')}
            >
              {assessmentSets.map((set) => (
                <option key={set.id} value={set.name}>
                  {set.name}
                </option>
              ))}
            </Form.Select>
            <small id="set-help" className="form-text text-muted">
              The <a href={`${urlPrefix}/course_admin/sets`}>assessment set</a> this assessment
              belongs to.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="number">
              Number
            </label>
            <input
              type="text"
              className="form-control"
              id="number"
              aria-describedby="number-help"
              disabled={!canEdit}
              defaultValue={defaultValues.number}
              {...register('number')}
            />
            <small id="number-help" className="form-text text-muted">
              The number of the assessment within the set.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="module">
              Module
            </label>
            <Form.Select
              id="module"
              aria-describedby="module-help"
              disabled={!canEdit}
              defaultValue={defaultValues.module}
              {...register('module')}
            >
              {assessmentModules.map((mod) => (
                <option key={mod.id} value={mod.name}>
                  {mod.name}
                </option>
              ))}
            </Form.Select>
            <small id="module-help" className="form-text text-muted">
              The <a href={`${urlPrefix}/course_admin/modules`}>module</a> this assessment belongs
              to.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="text">
              Text
            </label>
            <textarea
              className="form-control"
              id="text"
              aria-describedby="text-help"
              disabled={!canEdit}
              defaultValue={defaultValues.text}
              {...register('text')}
            />
            <small id="text-help" className="form-text text-muted">
              HTML text shown on the assessment overview page.
            </small>
          </div>

          <div className="mb-3">
            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="allow_issue_reporting"
                aria-describedby="allow-issue-reporting-help"
                disabled={!canEdit}
                defaultChecked={defaultValues.allow_issue_reporting}
                {...register('allow_issue_reporting')}
              />
              <label className="form-check-label" htmlFor="allow_issue_reporting">
                Allow issue reporting
              </label>
              <div id="allow-issue-reporting-help" className="small text-muted">
                Whether to allow students to report issues for assessment questions.
              </div>
            </div>
          </div>

          {assessment.type === 'Exam' && (
            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="multiple_instance"
                aria-describedby="multiple-instance-help"
                disabled={!canEdit}
                defaultChecked={defaultValues.multiple_instance}
                {...register('multiple_instance')}
              />
              <label className="form-check-label" htmlFor="multiple_instance">
                Multiple instances
              </label>
              <div id="multiple-instance-help" className="small text-muted">
                Whether to allow students to create additional instances of the assessment.
              </div>
            </div>
          )}

          <div className="mb-3 form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="allow_personal_notes"
              aria-describedby="allow-personal-notes-help"
              disabled={!canEdit}
              defaultChecked={defaultValues.allow_personal_notes}
              {...register('allow_personal_notes')}
            />
            <label className="form-check-label" htmlFor="allow_personal_notes">
              Allow personal notes
            </label>
            <div id="allow-personal-notes-help" className="small text-muted">
              Whether students are allowed to upload personal notes for this assessment.
            </div>
          </div>

          {assessment.type === 'Exam' && (
            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="auto_close"
                aria-describedby="auto-close-help"
                disabled={!canEdit}
                defaultChecked={defaultValues.auto_close}
                {...register('auto_close')}
              />
              <label className="form-check-label" htmlFor="auto_close">
                Auto close
              </label>
              <div id="auto-close-help" className="small text-muted">
                Whether to automatically close the assessment after 6 hours of inactivity.
              </div>
            </div>
          )}

          {assessment.type === 'Exam' && (
            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="require_honor_code"
                aria-describedby="require-honor-code-help"
                disabled={!canEdit}
                defaultChecked={defaultValues.require_honor_code}
                {...register('require_honor_code')}
              />
              <label className="form-check-label" htmlFor="require_honor_code">
                Require honor code
              </label>
              <div id="require-honor-code-help" className="small text-muted">
                Requires the student to accept an honor code before starting exam assessments.
              </div>
            </div>
          )}

          {assessment.type === 'Exam' && requireHonorCode && (
            <div className="mb-3">
              <label className="form-label" htmlFor="honor_code">
                Custom honor code
              </label>
              <textarea
                className="form-control"
                id="honor_code"
                aria-describedby="honor-code-help"
                disabled={!canEdit}
                defaultValue={defaultValues.honor_code}
                {...register('honor_code')}
              />
              <small id="honor-code-help" className="form-text text-muted">
                Custom honor code text that will be shown to students before starting the exam.
                While this field cannot accept HTML, you can use Markdown formatting. The user's
                name can be included with Mustache templating: <code>{'{{user_name}}'}</code>. To
                use the default honor code, leave this blank.
              </small>
            </div>
          )}

          <h2 className="h4">Tools</h2>
          {assessmentTools.map(({ name, label, enabled }) => (
            <div key={name} className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id={`tool_${name}`}
                disabled={!canEdit}
                defaultChecked={enabled}
                {...register(`tools.${name}`)}
              />
              <label className="form-check-label" htmlFor={`tool_${name}`}>
                {label}
              </label>
              <div className="small text-muted">
                Enable the {name} tool for students taking this assessment.
              </div>
            </div>
          ))}

          <StudentLinkSharing
            studentLink={studentLink}
            studentLinkMessage="The link that students will use to access this assessment."
          />

          <h2 className="h4">Sharing</h2>
          {assessment.share_source_publicly ? (
            <PublicLinkSharing
              publicLink={publicLink}
              sharingMessage="This assessment's source is publicly shared."
              publicLinkMessage="The link that other instructors can use to view this assessment."
            />
          ) : (
            <p>This assessment is not being shared.</p>
          )}

          {saveMutation.isSuccess && (
            <Alert variant="success" dismissible onClose={() => saveMutation.reset()}>
              Assessment updated successfully.
            </Alert>
          )}
          {appError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {appError.message}
            </Alert>
          )}

          {hasCoursePermissionView &&
            (canEdit ? (
              <>
                <div>
                  <button
                    id="save-button"
                    type="submit"
                    className="btn btn-primary mb-2"
                    disabled={!isDirty || isSubmitting || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    id="cancel-button"
                    type="button"
                    className="btn btn-secondary mb-2 ms-2"
                    onClick={() => {
                      reset();
                      saveMutation.reset();
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <p className="mb-0">
                  <a
                    data-testid="edit-assessment-configuration-link"
                    href={encodePathNoNormalize(
                      `${urlPrefix}/assessment/${assessment.id}/file_edit/${currentInfoAssessmentPath}`,
                    )}
                  >
                    Edit assessment configuration
                  </a>{' '}
                  in <code>infoAssessment.json</code>
                </p>
              </>
            ) : (
              <p className="mb-0">
                <a
                  href={`${urlPrefix}/assessment/${assessment.id}/file_view/${currentInfoAssessmentPath}`}
                >
                  View assessment configuration
                </a>{' '}
                in <code>infoAssessment.json</code>
              </p>
            ))}
        </form>
      </div>
      {canEdit && (
        <div className="card-footer">
          {copyError && (
            <Alert variant="danger" dismissible onClose={() => copyMutation.reset()}>
              {copyError.message}
            </Alert>
          )}
          <div className="d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={copyMutation.isPending}
              onClick={() =>
                copyMutation.mutate(undefined, {
                  onSuccess: (result) => {
                    window.location.href = `${urlPrefix}/assessment/${result.assessmentId}/settings`;
                  },
                })
              }
            >
              <i className="fa fa-clone" />{' '}
              {copyMutation.isPending ? 'Copying...' : 'Make a copy of this assessment'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowDeleteModal(true)}>
              <i className="fa fa-times" aria-hidden="true" /> Delete this assessment
            </Button>
          </div>
          <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>Delete assessment</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {deleteError && (
                <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
                  {deleteError.message}
                </Alert>
              )}
              <p>
                Are you sure you want to delete the assessment <strong>{assessment.tid}</strong>?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(undefined, {
                    onSuccess: () => {
                      window.location.href = `${urlPrefix}/instance_admin/assessments`;
                    },
                  })
                }
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </Modal.Footer>
          </Modal>
        </div>
      )}
    </div>
  );
}
