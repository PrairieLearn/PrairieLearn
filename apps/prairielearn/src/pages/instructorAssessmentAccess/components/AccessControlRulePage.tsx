import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getAssessmentAccessUrl } from '../../../lib/client/url.js';
import type { AccessControlWithStudentLabels } from '../instructorAssessmentAccessEdit.html.js';
import { createAccessControlTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPCClient } from '../utils/trpc-context.js';

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
  accessControl: AccessControlWithStudentLabels | null;
  isMainRule: boolean;
  isNew: boolean;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  assessmentId: string;
}

function dbRowToFormData(
  row: AccessControlWithStudentLabels,
  isMainRule: boolean,
): AccessControlRuleFormData {
  // Convert student labels and individual_targets to the appliesTo structure
  const studentLabels = row.student_labels ?? ([] as { id: string; name: string }[]);
  const individualTargets =
    row.individual_targets ?? ([] as { enrollmentId: string; uid: string; name: string | null }[]);

  let appliesTo;
  if (studentLabels.length > 0) {
    appliesTo = {
      targetType: 'student_label' as const,
      individuals: [],
      studentLabels: studentLabels.map((sl) => ({ studentLabelId: sl.id, name: sl.name })),
    };
  } else if (individualTargets.length > 0) {
    appliesTo = {
      targetType: 'individual' as const,
      individuals: individualTargets.map((t) => ({
        enrollmentId: t.enrollmentId,
        uid: t.uid,
        name: t.name,
      })),
      studentLabels: [],
    };
  } else {
    appliesTo = {
      targetType: 'individual' as const,
      individuals: [],
      studentLabels: [],
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

  // Build integrations from database row
  const prairieTestExams =
    row.prairietest_exams ?? ([] as { examUuid: string; readOnly: boolean | null }[]);
  const integrations = {
    prairieTest: {
      enabled: row.integrations_prairietest_overridden !== false,
      exams: prairieTestExams.map((e) => ({
        examUuid: e.examUuid,
        readOnly: e.readOnly ?? undefined,
      })),
    },
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
    integrations,
    afterComplete,
  };
}

function AccessControlRulePageInner({
  accessControl,
  isMainRule,
  isNew,
  courseInstance,
  assessmentId,
}: AccessControlRulePageProps) {
  const [deleteModalState, setDeleteModalState] = useState<{ show: boolean }>({ show: false });
  const [showSuccess, setShowSuccess] = useState(false);
  const trpcClient = useTRPCClient();

  const baseUrl = getAssessmentAccessUrl({ courseInstanceId: courseInstance.id, assessmentId });

  const ruleFormData = accessControl
    ? dbRowToFormData(accessControl, isMainRule)
    : createDefaultOverrideFormData();

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
      const ruleData = isMainRule ? data.mainRule : data.overrides[0];
      return trpcClient.saveRule.mutate({
        isMainRule,
        isNew,
        ruleId: accessControl?.id,
        formData: ruleData,
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      reset(getValues());
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ['delete-access-control', accessControl?.id],
    mutationFn: async () => {
      return trpcClient.deleteRule.mutate({
        ruleId: accessControl!.id,
        targetType: accessControl!.target_type,
      });
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

  const currentFormData = isMainRule ? watchedData.mainRule : watchedData.overrides[0];
  const isEnabled = currentFormData.enabled;

  // Check if override has at least one target (student or student label)
  const hasNoTargets =
    !isMainRule &&
    ((currentFormData.appliesTo.targetType === 'individual' &&
      currentFormData.appliesTo.individuals.length === 0) ||
      (currentFormData.appliesTo.targetType === 'student_label' &&
        currentFormData.appliesTo.studentLabels.length === 0));

  return (
    <div>
      {showSuccess && (
        <Alert variant="success" dismissible onClose={() => setShowSuccess(false)}>
          Access control saved successfully.
        </Alert>
      )}
      {saveMutation.isError && (
        <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
          {saveMutation.error.message}
        </Alert>
      )}

      {deleteMutation.isError && (
        <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
          {deleteMutation.error.message}
        </Alert>
      )}

      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        <AccessControlBreadcrumb baseUrl={baseUrl} currentPage={{ type: 'edit', ruleName }} />

        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0">{ruleName}</h5>

          <div className="d-flex gap-2">
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
              <i className={`bi bi-${isEnabled ? 'check-lg' : 'x-lg'} me-1`} />
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Button>

            {!isMainRule && !isNew && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setDeleteModalState({ show: true })}
              >
                <i className="bi bi-trash me-1" /> Delete
              </Button>
            )}
          </div>
        </div>

        {!isMainRule && (
          <AppliesToField control={control} setValue={setValue} namePrefix="overrides.0" />
        )}

        <div className="mb-4">
          {isMainRule ? (
            <MainRuleForm control={control} courseInstance={courseInstance} setValue={setValue} />
          ) : (
            <OverrideRuleContent control={control} index={0} setValue={setValue} />
          )}
        </div>

        {hasNoTargets && (
          <Alert variant="warning" className="mt-3">
            You must add at least one student or student label before saving this override.
          </Alert>
        )}
        <div className="mt-4 d-flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={(!isDirty && !isNew) || saveMutation.isPending || hasNoTargets}
          >
            {saveMutation.isPending
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
  const [trpcClient] = useState(() => {
    const accessUrl = getAssessmentAccessUrl({
      courseInstanceId: props.courseInstance.id,
      assessmentId: props.assessmentId,
    });
    return createAccessControlTrpcClient(props.csrfToken, `${accessUrl}/edit/trpc`);
  });
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AccessControlRulePageInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
AccessControlRulePage.displayName = 'AccessControlRulePage';
