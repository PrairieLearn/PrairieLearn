import { type UseQueryResult, useMutation, useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Form, Modal, Spinner } from 'react-bootstrap';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import {
  CourseInstancePermissionsForm,
  type PermissionsFormValues,
} from '../../../components/CourseInstancePermissionsForm.js';
import {
  CourseInstancePublishingForm,
  type PublishingFormValues,
} from '../../../components/CourseInstancePublishingForm.js';
import {
  CourseInstanceSelfEnrollmentForm,
  type SelfEnrollmentFormValues,
} from '../../../components/CourseInstanceSelfEnrollmentForm.js';
import { CourseInstanceShortNameDescription } from '../../../components/ShortNameDescriptions.js';
import { getAppError } from '../../../lib/client/errors.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import {
  getCourseInstanceEditErrorUrl,
  getCourseInstanceSettingsUrl,
} from '../../../lib/client/url.js';
import { validateShortName } from '../../../lib/short-name.js';
import { useTRPC } from '../../../trpc/courseInstance/context.js';
import type { InstanceAdminSettingsError } from '../../../trpc/courseInstance/instance-admin-settings.js';
import type { CourseInstanceRouter } from '../../../trpc/courseInstance/trpc.js';

type AnalysisResult =
  inferRouterOutputs<CourseInstanceRouter>['instanceAdminSettings']['analyzeAccessControl'];

type Step = 'settings' | 'access-control';

interface CopyFormValues
  extends PublishingFormValues, SelfEnrollmentFormValues, PermissionsFormValues {
  short_name: string;
  long_name: string;
  access_control_strategy: 'migrate' | 'keep' | 'clear';
  clear_incompatible: boolean;
}

export function CopyCourseInstanceModal({
  show,
  onHide,
  csrfToken,
  courseInstance,
  courseShortName,
  isAdministrator,
}: {
  show: boolean;
  onHide: () => void;
  csrfToken: string;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  courseShortName: string;
  isAdministrator: boolean;
}) {
  const [step, setStep] = useState<Step>('settings');

  const trpc = useTRPC();
  const analysisQuery = useQuery(trpc.instanceAdminSettings.analyzeAccessControl.queryOptions());

  const methods = useForm<CopyFormValues>({
    defaultValues: {
      short_name: '',
      long_name: '',
      start_date: '',
      end_date: '',
      self_enrollment_enabled: courseInstance.self_enrollment_enabled,
      self_enrollment_use_enrollment_code: courseInstance.self_enrollment_use_enrollment_code,
      course_instance_permission: isAdministrator ? 'None' : 'Student Data Editor',
      access_control_strategy: 'migrate',
      clear_incompatible: true,
    },
    mode: 'onSubmit',
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    trigger,
    formState: { errors },
  } = methods;

  const accessControlStrategy = useWatch({ control, name: 'access_control_strategy' });

  const copyMutation = useMutation({
    mutationFn: async (data: CopyFormValues) => {
      const body = {
        __csrf_token: csrfToken,
        __action: 'copy_course_instance',
        short_name: data.short_name.trim(),
        long_name: data.long_name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        self_enrollment_enabled: data.self_enrollment_enabled,
        self_enrollment_use_enrollment_code: data.self_enrollment_use_enrollment_code,
        course_instance_permission: data.course_instance_permission,
        access_control_strategy: data.access_control_strategy,
        clear_incompatible: data.clear_incompatible,
      };

      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await resp.json();
      if (!resp.ok) {
        if (result.job_sequence_id) {
          window.location.href = getCourseInstanceEditErrorUrl(
            courseInstance.id,
            result.job_sequence_id,
          );
          return null;
        }

        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (data) => {
      if (data?.course_instance_id) {
        window.location.href = getCourseInstanceSettingsUrl(data.course_instance_id);
      }
    },
  });

  const handleClose = () => {
    copyMutation.reset();
    reset();
    setStep('settings');
    onHide();
  };

  const handleSettingsNext = async () => {
    const valid = await trigger(['short_name', 'long_name']);
    if (!valid) return;

    if (analysisQuery.isError || analysisQuery.data?.hasLegacyRules) {
      setStep('access-control');
    } else {
      void handleSubmit((data) => copyMutation.mutate(data))();
    }
  };

  const handleCopy = () => {
    void handleSubmit((data) => copyMutation.mutate(data))();
  };

  const isPending = copyMutation.isPending;

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>
          {step === 'settings' ? 'Copy course instance' : 'Access control migration'}
        </Modal.Title>
      </Modal.Header>
      <FormProvider {...methods}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 'settings') {
              void handleSettingsNext();
            } else {
              handleCopy();
            }
          }}
        >
          {step === 'settings' && (
            <SettingsStep
              courseInstance={courseInstance}
              courseShortName={courseShortName}
              errors={errors}
              register={register}
            />
          )}
          {step === 'access-control' && (
            <AccessControlStep
              analysisQuery={analysisQuery}
              accessControlStrategy={accessControlStrategy}
              register={register}
            />
          )}

          <Modal.Footer>
            {step === 'access-control' && (
              <button
                type="button"
                className="btn btn-secondary me-auto"
                disabled={isPending}
                onClick={() => setStep('settings')}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isPending}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || (step === 'settings' && analysisQuery.isLoading)}
            >
              {isPending
                ? 'Copying...'
                : step === 'settings' &&
                    (analysisQuery.isError || analysisQuery.data?.hasLegacyRules)
                  ? 'Next'
                  : 'Copy course instance'}
            </button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

CopyCourseInstanceModal.displayName = 'CopyCourseInstanceModal';

function SettingsStep({
  courseInstance,
  courseShortName,
  errors,
  register,
}: {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  courseShortName: string;
  errors: ReturnType<typeof useForm<CopyFormValues>>['formState']['errors'];
  register: ReturnType<typeof useForm<CopyFormValues>>['register'];
}) {
  return (
    <Modal.Body>
      <div className="mb-3">
        <label className="form-label" htmlFor="copy-long-name">
          Long name
        </label>
        <input
          id="copy-long-name"
          type="text"
          className={clsx('form-control', errors.long_name && 'is-invalid')}
          aria-describedby="copy-long-name-help"
          aria-invalid={!!errors.long_name}
          aria-errormessage={errors.long_name ? 'copy-long-name-error' : undefined}
          placeholder={courseInstance.long_name ?? undefined}
          {...register('long_name', {
            required: 'Long name is required',
          })}
        />
        <small id="copy-long-name-help" className="form-text text-muted">
          The full course instance name, such as &quot;Fall 2025&quot;. Users see it joined to the
          course name, e.g. &quot;
          {courseShortName} Fall 2025&quot;.
        </small>
        {errors.long_name && (
          <div className="invalid-feedback" id="copy-long-name-error">
            {errors.long_name.message}
          </div>
        )}
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="copy-short-name">
          Short name
        </label>
        <input
          id="copy-short-name"
          type="text"
          className={clsx('form-control font-monospace', errors.short_name && 'is-invalid')}
          aria-describedby="copy-short-name-help"
          aria-invalid={!!errors.short_name}
          aria-errormessage={errors.short_name ? 'copy-short-name-error' : undefined}
          placeholder={courseInstance.short_name}
          {...register('short_name', {
            required: 'Short name is required',
            validate: (value) => {
              const result = validateShortName(value);
              return result.valid || result.message;
            },
          })}
        />
        <small id="copy-short-name-help" className="form-text text-muted">
          <CourseInstanceShortNameDescription />
        </small>
        {errors.short_name && (
          <div className="invalid-feedback" id="copy-short-name-error">
            {errors.short_name.message}
          </div>
        )}
      </div>

      <hr />

      <h3 className="h5">Publishing settings</h3>
      <p className="text-muted small">
        Choose the initial publishing status for your new course instance. This can be changed
        later.
      </p>

      <CourseInstancePublishingForm
        displayTimezone={courseInstance.display_timezone}
        canEdit={true}
        originalStartDate={null}
        originalEndDate={null}
        showButtons={false}
        formId="copy-course-instance"
      />

      <hr />

      <h3 className="h5">Self-enrollment settings</h3>
      <p className="text-muted small">
        Configure self-enrollment for your new course instance. This can be changed later.
      </p>

      <CourseInstanceSelfEnrollmentForm formId="copy-course-instance" />

      <hr />

      <h3 className="h5">Course instance permissions</h3>
      <p className="text-muted small">
        Choose your initial permissions for this course instance. This can be changed later.
      </p>

      <CourseInstancePermissionsForm formId="copy-course-instance" />
    </Modal.Body>
  );
}

function AccessControlStep({
  analysisQuery,
  accessControlStrategy,
  register,
}: {
  analysisQuery: UseQueryResult<AnalysisResult, unknown>;
  accessControlStrategy: string;
  register: ReturnType<typeof useForm<CopyFormValues>>['register'];
}) {
  const analysis = analysisQuery.data;

  if (analysisQuery.isLoading) {
    return (
      <Modal.Body className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Analyzing access control rules...</span>
        </Spinner>
        <p className="mt-2 text-muted">Analyzing access control rules...</p>
      </Modal.Body>
    );
  }

  const assessments = analysis?.assessments ?? [];
  const allCanMigrate = analysis?.assessments.every((a) => a.errors.length === 0) ?? false;
  const appError = analysisQuery.isError
    ? getAppError<InstanceAdminSettingsError>(analysisQuery.error)
    : null;
  const assessmentsWithNotes = assessments.filter(
    (a) => a.errors.length === 0 && a.notes.length > 0,
  );
  const blockedAssessments = assessments.filter((a) => a.errors.length > 0);
  const showPreserveOption =
    accessControlStrategy === 'migrate' && (analysisQuery.isError || !allCanMigrate);

  return (
    <Modal.Body>
      {analysisQuery.isError && (
        <Alert variant="danger">
          {appError?.message ?? 'Failed to analyze access control rules.'} You can still choose how
          copied assessments should handle any legacy access control rules that are encountered.
        </Alert>
      )}

      {assessments.length > 0 && (
        <>
          <p>
            This course instance has{' '}
            <strong>
              {assessments.length} assessment{assessments.length !== 1 ? 's' : ''}
            </strong>{' '}
            with legacy access control rules. Choose how to handle them in the copy. Learn more
            about{' '}
            <a
              href="https://docs.prairielearn.com/assessment/accessControl/"
              target="_blank"
              rel="noreferrer noopener"
            >
              access control
            </a>
            .
          </p>

          {(assessmentsWithNotes.length > 0 || blockedAssessments.length > 0) && (
            <Alert variant="warning">
              {assessmentsWithNotes.length > 0 && (
                <div>
                  <strong>{assessmentsWithNotes.length}</strong> assessment
                  {assessmentsWithNotes.length !== 1 ? 's' : ''} can migrate with caveats.
                </div>
              )}
              {blockedAssessments.length > 0 && (
                <div>
                  <strong>{blockedAssessments.length}</strong> assessment
                  {blockedAssessments.length !== 1 ? 's' : ''} require
                  {blockedAssessments.length === 1 ? 's' : ''} manual review.
                </div>
              )}
            </Alert>
          )}

          <div className="border rounded mb-3" style={{ maxHeight: '240px', overflowY: 'auto' }}>
            <table
              className="table table-sm table-hover mb-0"
              aria-label="Assessments with legacy access control"
            >
              <thead className="table-light sticky-top">
                <tr>
                  <th>Assessment</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.tid}>
                    <td>
                      <code>{a.tid}</code>
                      <small className="text-muted d-block">{a.title}</small>
                    </td>
                    <td>
                      {a.errors.length === 0 ? (
                        a.notes.length > 0 ? (
                          <span className="badge text-bg-info">Migrates with notes</span>
                        ) : (
                          <span className="badge text-bg-success">Can migrate</span>
                        )
                      ) : (
                        <span className="badge text-bg-warning">Manual review</span>
                      )}
                    </td>
                    <td>
                      {a.errors.length > 0 ? (
                        <small className="text-danger">{a.errors.join(' ')}</small>
                      ) : a.notes.length > 0 ? (
                        <small className="text-muted">{a.notes.join(' ')}</small>
                      ) : (
                        <small className="text-muted">-</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <fieldset>
        <legend className="h6">Migration strategy</legend>

        <Form.Check
          type="radio"
          id="strategy-migrate"
          label="Migrate to modern format (Recommended)"
          value="migrate"
          {...register('access_control_strategy')}
        />
        {accessControlStrategy === 'migrate' && assessmentsWithNotes.some((a) => a.hasUidRules) && (
          <div className="ms-4 mt-1 mb-2">
            <small className="text-muted d-block">
              UID-based rules are copied only in legacy format. If you migrate the copy, those
              individual-student rules are omitted and should be recreated later as enrollment
              overrides if needed.
            </small>
          </div>
        )}
        {showPreserveOption && (
          <div className="ms-4 mt-1 mb-2">
            <Form.Check
              type="checkbox"
              id="clear-incompatible"
              label={
                <small className="text-muted">
                  Clear access control for incompatible assessments
                </small>
              }
              defaultChecked
              {...register('clear_incompatible')}
            />
          </div>
        )}

        <Form.Check
          type="radio"
          id="strategy-keep"
          label="Don't migrate to modern access control"
          value="keep"
          {...register('access_control_strategy')}
        />

        <Form.Check
          type="radio"
          id="strategy-clear"
          label="Migrate to modern format and clear all rules"
          value="clear"
          {...register('access_control_strategy')}
        />
      </fieldset>
    </Modal.Body>
  );
}
