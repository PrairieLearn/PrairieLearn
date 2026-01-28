import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { ServerJobsProgressInfo } from '../../../components/ServerJobProgress/ServerJobProgressBars.js';
import { useServerJobProgress } from '../../../components/ServerJobProgress/useServerJobProgress.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { AccessControlWithGroups } from '../instructorAssessmentAccessEdit.html.js';

import { AccessControlBreadcrumb } from './AccessControlBreadcrumb.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import { AppliesToField } from './fields/AppliesToField.js';
import {
  type AccessControlFormData,
  type AccessControlRuleFormData,
  createDefaultOverrideFormData,
  makeOverridable,
} from './types.js';

/**
 * Formats a Date to a local datetime string in the format expected by
 * datetime-local inputs (YYYY-MM-DDTHH:MM:SS), without timezone suffix.
 */
function toDatetimeLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

interface AccessControlRulePageProps {
  accessControl: AccessControlWithGroups | null;
  isMainRule: boolean;
  isNew: boolean;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  urlPrefix: string;
  assessmentId: string;
}

function dbRowToFormData(
  row: AccessControlWithGroups,
  isMainRule: boolean,
): AccessControlRuleFormData {
  // Convert groups and individual_targets to the appliesTo structure
  const groups = row.groups ?? ([] as { id: string; name: string }[]);
  const individualTargets =
    row.individual_targets ?? ([] as { enrollmentId: string; uid: string; name: string | null }[]);

  let appliesTo;
  if (groups.length > 0) {
    appliesTo = {
      targetType: 'group' as const,
      individuals: [],
      groups: groups.map((g) => ({ groupId: g.id, name: g.name })),
    };
  } else if (individualTargets.length > 0) {
    appliesTo = {
      targetType: 'individual' as const,
      individuals: individualTargets.map((t) => ({
        enrollmentId: t.enrollmentId,
        uid: t.uid,
        name: t.name,
      })),
      groups: [],
    };
  } else {
    appliesTo = {
      targetType: 'individual' as const,
      individuals: [],
      groups: [],
    };
  }

  // Build dateControl from database row
  const dateControlEnabled = row.date_control_overridden !== false;
  const earlyDeadlines = row.early_deadlines ?? [];
  const lateDeadlines = row.late_deadlines ?? [];

  const dateControl = {
    enabled: dateControlEnabled,
    releaseDate: makeOverridable(
      isMainRule,
      row.date_control_release_date_overridden === true,
      row.date_control_release_date !== null,
      row.date_control_release_date ? toDatetimeLocalString(row.date_control_release_date) : '',
    ),
    dueDate: makeOverridable(
      isMainRule,
      row.date_control_due_date_overridden === true,
      row.date_control_due_date !== null,
      row.date_control_due_date ? toDatetimeLocalString(row.date_control_due_date) : '',
    ),
    earlyDeadlines: makeOverridable(
      isMainRule,
      row.date_control_early_deadlines_overridden === true,
      earlyDeadlines.length > 0,
      earlyDeadlines,
    ),
    lateDeadlines: makeOverridable(
      isMainRule,
      row.date_control_late_deadlines_overridden === true,
      lateDeadlines.length > 0,
      lateDeadlines,
    ),
    afterLastDeadline: makeOverridable(
      isMainRule,
      row.date_control_after_last_deadline_credit_overridden === true,
      row.date_control_after_last_deadline_credit !== null ||
        row.date_control_after_last_deadline_allow_submissions !== null,
      {
        allowSubmissions: row.date_control_after_last_deadline_allow_submissions ?? undefined,
        credit: row.date_control_after_last_deadline_credit ?? undefined,
      },
    ),
    durationMinutes: makeOverridable(
      isMainRule,
      row.date_control_duration_minutes_overridden === true,
      row.date_control_duration_minutes !== null,
      row.date_control_duration_minutes ?? 60,
    ),
    password: makeOverridable(
      isMainRule,
      row.date_control_password_overridden === true,
      row.date_control_password !== null,
      row.date_control_password ?? '',
    ),
  };

  // Build prairieTestControl from database row
  const prairieTestExams =
    row.prairietest_exams ?? ([] as { examUuid: string; readOnly: boolean | null }[]);
  const prairieTestControl = {
    enabled: row.prairietest_control_overridden !== false,
    exams: prairieTestExams.map((e) => ({
      examUuid: e.examUuid,
      readOnly: e.readOnly ?? undefined,
    })),
  };

  // Build afterComplete from database row
  const hasQuestionVisibility =
    row.after_complete_hide_questions !== null ||
    row.after_complete_show_questions_again_date_overridden === true ||
    row.after_complete_hide_questions_again_date_overridden === true;

  const hasScoreVisibility =
    row.after_complete_hide_score !== null ||
    row.after_complete_show_score_again_date_overridden === true;

  const afterComplete = {
    questionVisibility: makeOverridable(isMainRule, hasQuestionVisibility, true, {
      hideQuestions: row.after_complete_hide_questions ?? false,
      showAgainDate: row.after_complete_show_questions_again_date
        ? toDatetimeLocalString(row.after_complete_show_questions_again_date)
        : undefined,
      hideAgainDate: row.after_complete_hide_questions_again_date
        ? toDatetimeLocalString(row.after_complete_hide_questions_again_date)
        : undefined,
    }),
    scoreVisibility: makeOverridable(isMainRule, hasScoreVisibility, true, {
      hideScore: row.after_complete_hide_score ?? false,
      showAgainDate: row.after_complete_show_score_again_date
        ? toDatetimeLocalString(row.after_complete_show_score_again_date)
        : undefined,
    }),
  };

  return {
    enabled: row.enabled ?? true,
    blockAccess: row.block_access ?? undefined,
    listBeforeRelease: row.list_before_release ?? undefined,
    appliesTo,
    dateControl,
    prairieTestControl,
    afterComplete,
  };
}

function AccessControlRulePageInner({
  accessControl,
  isMainRule,
  isNew,
  courseInstance,
  csrfToken,
  urlPrefix,
  assessmentId,
}: AccessControlRulePageProps) {
  const [deleteModalState, setDeleteModalState] = useState<{ show: boolean }>({ show: false });
  const [saveJobSequenceId, setSaveJobSequenceId] = useState<string | null>(null);
  const [deleteJobSequenceId, setDeleteJobSequenceId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const queryClient = useQueryClient();

  const baseUrl = `${urlPrefix}/assessment/${assessmentId}/access`;

  // Progress tracking for save operations
  const onProgressChange = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const { jobsProgress, handleAddOngoingJobSequence, handleDismissCompleteJobSequence } =
    useServerJobProgress({
      enabled: true,
      initialOngoingJobSequenceTokens: null,
      onProgressChange,
    });

  // Convert jobsProgress object to array for display
  const jobProgressArray = useMemo(() => Object.values(jobsProgress), [jobsProgress]);

  // Check if there's an ongoing save job
  const isSaveInProgress = jobProgressArray.some(
    (job) => job.num_total > 0 && job.num_complete < job.num_total,
  );

  // Set up form with initial data
  const ruleFormData = accessControl
    ? dbRowToFormData(accessControl, isMainRule)
    : createDefaultOverrideFormData();

  // Use the full form structure for compatibility with existing components
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { isDirty },
  } = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule: isMainRule ? ruleFormData : createDefaultOverrideFormData(),
      overrides: isMainRule ? [] : [ruleFormData],
    },
  });

  const watchedData = watch();

  const saveMutation = useMutation({
    mutationKey: ['save-access-control', accessControl?.id ?? 'new'],
    mutationFn: async (data: AccessControlFormData) => {
      setSaveJobSequenceId(null);

      const body = new URLSearchParams({
        __action: isNew ? 'create_access_control' : 'update_access_control',
        __csrf_token: csrfToken,
        form_data: JSON.stringify(data),
      });

      const targetUrl = window.location.href;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body,
      });

      if (!res.ok) {
        let errorMessage = 'Failed to save access control';
        try {
          const result = await res.json();
          errorMessage = result.error || errorMessage;
          if (result.job_sequence_id) {
            setSaveJobSequenceId(result.job_sequence_id);
          }
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMessage);
      }

      // Check if this is a pending (background) job
      if (res.status === 200) {
        const result = await res.json();
        if (result.pending && result.job_sequence_id && result.job_sequence_token) {
          // Add to progress tracking
          handleAddOngoingJobSequence(result.job_sequence_id, result.job_sequence_token);
          return { pending: true, jobSequenceId: result.job_sequence_id };
        }
      }

      return { pending: false };
    },
    onSuccess: (result) => {
      // Only show success immediately if not pending (i.e., synchronous completion)
      if (!result.pending) {
        setShowSuccess(true);
        reset(getValues());
      }
      // For pending jobs, success will be shown via progress tracking
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ['delete-access-control', accessControl?.id],
    mutationFn: async () => {
      setDeleteJobSequenceId(null);

      const body = new URLSearchParams({
        __action: 'delete_access_control',
        __csrf_token: csrfToken,
      });

      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body,
      });

      if (!res.ok) {
        let errorMessage = 'Failed to delete access control';
        try {
          const result = await res.json();
          errorMessage = result.error || errorMessage;
          if (result.job_sequence_id) {
            setDeleteJobSequenceId(result.job_sequence_id);
          }
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMessage);
      }

      return res;
    },
    onSuccess: () => {
      window.location.href = baseUrl;
    },
  });

  const handleFormSubmit = (data: AccessControlFormData) => {
    setShowSuccess(false);
    saveMutation.mutate(data);
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate();
    setDeleteModalState({ show: false });
  };

  const ruleName = isMainRule
    ? 'Main rule'
    : isNew
      ? 'New override'
      : `Override ${accessControl?.number}`;

  // currentFormData is always defined because:
  // - When isMainRule is true, we select mainRule (always defined)
  // - When isMainRule is false, overrides[0] is always defined (initialized with ruleFormData)
  const currentFormData = isMainRule ? watchedData.mainRule : watchedData.overrides[0];
  const isEnabled = currentFormData.enabled;

  // Check if override has at least one target (student or group)
  const hasNoTargets =
    !isMainRule &&
    ((currentFormData.appliesTo.targetType === 'individual' &&
      currentFormData.appliesTo.individuals.length === 0) ||
      (currentFormData.appliesTo.targetType === 'group' &&
        currentFormData.appliesTo.groups.length === 0));

  return (
    <div>
      {showSuccess && (
        <Alert variant="success" dismissible onClose={() => setShowSuccess(false)}>
          Access control saved successfully.
        </Alert>
      )}
      {saveMutation.isError && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            saveMutation.reset();
            setSaveJobSequenceId(null);
          }}
        >
          {saveMutation.error.message}
          {saveJobSequenceId && (
            <>
              {' '}
              <Alert.Link
                href={getCourseInstanceJobSequenceUrl(courseInstance.id, saveJobSequenceId)}
              >
                View job logs
              </Alert.Link>
            </>
          )}
        </Alert>
      )}

      {deleteMutation.isError && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            deleteMutation.reset();
            setDeleteJobSequenceId(null);
          }}
        >
          {deleteMutation.error.message}
          {deleteJobSequenceId && (
            <>
              {' '}
              <Alert.Link
                href={getCourseInstanceJobSequenceUrl(courseInstance.id, deleteJobSequenceId)}
              >
                View job logs
              </Alert.Link>
            </>
          )}
        </Alert>
      )}

      {/* Progress bar for save operations */}
      {jobProgressArray.length > 0 && (
        <ServerJobsProgressInfo
          itemNames="sync stages"
          jobsProgress={jobProgressArray}
          courseInstanceId={courseInstance.id}
          statusText={{
            inProgress: 'Saving access control...',
            complete: 'Save complete',
            failed: 'Save failed',
          }}
          onDismissCompleteJobSequence={handleDismissCompleteJobSequence}
        />
      )}

      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Breadcrumb navigation */}
        <AccessControlBreadcrumb baseUrl={baseUrl} currentPage={{ type: 'edit', ruleName }} />

        {/* Rule header with name and actions */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0">{ruleName}</h5>

          <div className="d-flex gap-2">
            {/* Enable/Disable toggle */}
            <Button
              variant={isEnabled ? 'success' : 'outline-secondary'}
              size="sm"
              onClick={() => {
                if (isMainRule) {
                  setValue('mainRule.enabled', !isEnabled, { shouldDirty: true });
                } else {
                  setValue('overrides.0.enabled', !isEnabled, { shouldDirty: true });
                }
              }}
            >
              <i className={`fa fa-${isEnabled ? 'check' : 'times'} me-1`} />
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Button>

            {/* Delete button (overrides only, not for new) */}
            {!isMainRule && !isNew && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setDeleteModalState({ show: true })}
              >
                <i className="fa fa-trash me-1" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* "Applies to" selector for overrides */}
        {!isMainRule && (
          <AppliesToField
            control={control}
            setValue={setValue}
            namePrefix="overrides.0"
            urlPrefix={urlPrefix}
            assessmentId={assessmentId}
          />
        )}

        {/* Main content area */}
        <div className="mb-4">
          {isMainRule ? (
            <MainRuleForm control={control} courseInstance={courseInstance} setValue={setValue} />
          ) : (
            <OverrideRuleContent control={control} index={0} setValue={setValue} />
          )}
        </div>

        {/* Form actions */}
        {hasNoTargets && (
          <Alert variant="warning" className="mt-3">
            You must add at least one student or group before saving this override.
          </Alert>
        )}
        <div className="mt-4 d-flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={
              (!isDirty && !isNew) || saveMutation.isPending || isSaveInProgress || hasNoTargets
            }
          >
            {saveMutation.isPending || isSaveInProgress
              ? isNew
                ? 'Creating...'
                : 'Saving...'
              : isNew
                ? isMainRule
                  ? 'Create main rule'
                  : 'Create override'
                : 'Save changes'}
          </Button>
          <a href={baseUrl} className="btn btn-outline-secondary">
            Cancel
          </a>
        </div>
      </Form>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        show={deleteModalState.show}
        title="Delete override rule"
        message={`Are you sure you want to delete "${ruleName}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModalState({ show: false })}
      />
    </div>
  );
}

export function AccessControlRulePage(props: AccessControlRulePageProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProviderDebug client={queryClient}>
      <AccessControlRulePageInner {...props} />
    </QueryClientProviderDebug>
  );
}
AccessControlRulePage.displayName = 'AccessControlRulePage';
