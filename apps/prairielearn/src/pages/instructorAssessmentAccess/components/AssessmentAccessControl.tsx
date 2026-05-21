import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { run } from '@prairielearn/run';
import type { StickySaveBarAlert } from '@prairielearn/ui';

import { getAppError } from '../../../lib/client/errors.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type {
  AccessControlJsonWithId,
  PrairieTestExamMetadata,
} from '../../../models/assessment-access-control-rules.js';
import type { AccessControlError } from '../../../trpc/assessment/access-control.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessment/context.js';

import { AccessControlForm } from './AccessControlForm.js';

export interface AssessmentAccessControlPermissions {
  isExampleCourse: boolean;
  hasCoursePermissionEdit: boolean;
  hasCourseInstancePermissionView: boolean;
  hasCourseInstancePermissionEdit: boolean;
}

interface AssessmentAccessControlProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  origHash: string | null;
  assessmentId: string;
  isExam: boolean;
  initialData: AccessControlJsonWithId[];
  prairieTestExamMetadata: PrairieTestExamMetadata[];
  ptHost: string;
  permissions: AssessmentAccessControlPermissions;
  hiddenEnrollmentRuleCount: number;
}

function AssessmentAccessControlInner({
  courseInstance,
  origHash: initialOrigHash,
  isExam,
  initialData,
  prairieTestExamMetadata,
  ptHost,
  permissions,
  hiddenEnrollmentRuleCount,
}: AssessmentAccessControlProps) {
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canEditAccessSettings = permissions.hasCoursePermissionEdit && !permissions.isExampleCourse;
  const canEditEnrollmentRules =
    canEditAccessSettings && permissions.hasCourseInstancePermissionEdit;
  const readOnlyMessage = run(() => {
    if (permissions.isExampleCourse) {
      return 'Editing access settings is not available for the example course.';
    }
    if (!permissions.hasCoursePermissionEdit) {
      return 'Editing access settings requires course editor permissions.';
    }
    return null;
  });

  const saveMutation = useMutation(
    trpc.accessControl.saveAllRules.mutationOptions({
      onSuccess: (result) => {
        setOrigHash(result.newHash);
        void queryClient.invalidateQueries();
      },
    }),
  );

  const handleFormSubmit = async (data: AccessControlJsonWithId[]) => {
    const jsonRules = data.filter((r) => r.ruleType !== 'enrollment');
    const enrollmentRules = data
      .filter((r) => r.ruleType === 'enrollment')
      .map(({ ruleType: _, enrollments, ...ruleJson }) => ({
        id: ruleJson.id,
        enrollmentIds: (enrollments ?? []).map((e) => e.enrollmentId),
        ruleJson,
      }));
    const shouldSyncEnrollmentRules =
      canEditEnrollmentRules &&
      (initialData.some((r) => r.ruleType === 'enrollment') || enrollmentRules.length > 0);

    await saveMutation.mutateAsync({
      rules: jsonRules,
      ...(shouldSyncEnrollmentRules ? { enrollmentRules } : {}),
      origHash,
    });
  };

  const saveError = getAppError<AccessControlError['SaveAllRules']>(saveMutation.error);

  const saveAlert = run<StickySaveBarAlert | null>(() => {
    if (saveMutation.isSuccess) {
      return {
        variant: 'success',
        message: 'Access control updated successfully.',
        onDismiss: () => saveMutation.reset(),
      };
    }
    if (saveError?.code === 'SYNC_JOB_FAILED') {
      return {
        variant: 'danger',
        message: (
          <>
            {saveError.message}{' '}
            <a href={getCourseInstanceJobSequenceUrl(courseInstance.id, saveError.jobSequenceId)}>
              View job logs
            </a>
          </>
        ),
        onDismiss: () => saveMutation.reset(),
      };
    }
    if (saveError?.code === 'UNKNOWN') {
      return {
        variant: 'danger',
        message: saveError.message,
        onDismiss: () => saveMutation.reset(),
      };
    }
    return null;
  });

  return (
    <div style={{ height: '100%' }} data-split-pane-page>
      <AccessControlForm
        courseInstance={courseInstance}
        isExam={isExam}
        initialData={initialData}
        prairieTestExamMetadata={prairieTestExamMetadata}
        ptHost={ptHost}
        isSaving={saveMutation.isPending}
        alert={saveAlert}
        canEditAccessSettings={canEditAccessSettings}
        canEditEnrollmentRules={canEditEnrollmentRules}
        readOnlyMessage={readOnlyMessage}
        hiddenEnrollmentRuleCount={hiddenEnrollmentRuleCount}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

export function AssessmentAccessControl(props: AssessmentAccessControlProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: props.csrfToken,
      courseInstanceId: props.courseInstance.id,
      assessmentId: props.assessmentId,
    }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentAccessControlInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
AssessmentAccessControl.displayName = 'AssessmentAccessControl';
