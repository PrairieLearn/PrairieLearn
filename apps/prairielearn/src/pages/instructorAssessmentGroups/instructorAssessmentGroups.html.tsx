import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { getAppError } from '../../lib/client/errors.js';
import type { PageContext } from '../../lib/client/page-context.js';
import type { StaffGroupConfig } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { type GroupSettingsFormValues } from '../../lib/group-config.js';
import type { GroupUsersRow } from '../../models/group.js';
import type { AssessmentGroupsError } from '../../trpc/assessment/assessment-groups.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

import { GroupSettingsCard } from './components/GroupSettingsCard.js';
import { GroupsCard } from './components/GroupsCard.js';

function NoGroupConfigCard({
  origHash,
  canEdit,
  hasPreservedConfig,
  onEnable,
}: {
  origHash: string | null;
  canEdit: boolean;
  hasPreservedConfig: boolean;
  onEnable: (result: {
    origHash: string;
    groupConfig: StaffGroupConfig;
    groupSettingsDefaults: GroupSettingsFormValues | null;
  }) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.enableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['EnableGroupWork']>(mutation.error);

  const heading = hasPreservedConfig
    ? 'Group work is disabled.'
    : 'This is not a group assessment.';
  const description = canEdit
    ? hasPreservedConfig
      ? 'Re-enable group work to restore the previous configuration.'
      : 'Enable group work to allow students to collaborate and submit as teams.'
    : 'Group work is not enabled for this assessment.';
  const buttonLabel = hasPreservedConfig ? 'Re-enable group work' : 'Enable group work';

  return (
    <div className="container py-3">
      <div className="card">
        <div className="card-body text-center">
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          <i className="bi bi-people fs-1 mb-2" />
          <h2 className="h5">{heading}</h2>
          <div className="text-muted">{description}</div>
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-primary mt-3"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ origHash }, { onSuccess: onEnable })}
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface InstructorAssessmentGroupsProps {
  pageContext: PageContext<'assessment', 'instructor'>;
  groupsCsvFilename?: string;
  groupConfigInfo?: StaffGroupConfig;
  groups?: GroupUsersRow[];
  notAssigned?: string[];
  trpcCsrfToken: string;
  isDevMode: boolean;
  origHash: string | null;
  groupSettingsDefaults: GroupSettingsFormValues | null;
}

export function InstructorAssessmentGroups({
  pageContext,
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  trpcCsrfToken,
  isDevMode,
  origHash,
  groupSettingsDefaults,
}: InstructorAssessmentGroupsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: pageContext.course_instance.id,
      assessmentId: pageContext.assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentGroupsInner
          pageContext={pageContext}
          groupsCsvFilename={groupsCsvFilename}
          groupConfigInfo={groupConfigInfo}
          groups={groups}
          notAssigned={notAssigned}
          origHash={origHash}
          groupSettingsDefaults={groupSettingsDefaults}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentGroups.displayName = 'InstructorAssessmentGroups';

function InstructorAssessmentGroupsInner({
  pageContext,
  groupsCsvFilename,
  groupConfigInfo: initialGroupConfigInfo,
  groups,
  notAssigned,
  origHash: initialOrigHash,
  groupSettingsDefaults: initialGroupSettingsDefaults,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const { assessment, assessment_set: assessmentSet, course, authz_data } = pageContext;
  const canEditCourse = authz_data.has_course_permission_edit && !course.example_course;
  const canEditCourseInstance =
    authz_data.has_course_instance_permission_edit && !course.example_course;
  const [groupConfigInfo, setGroupConfigInfo] = useState(initialGroupConfigInfo);
  const [groupSettingsDefaults, setGroupSettingsDefaults] = useState(initialGroupSettingsDefaults);
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [groupMin, setGroupMin] = useState(
    groupSettingsDefaults?.minMembers ?? groupConfigInfo?.minimum ?? 2,
  );
  const [groupMax, setGroupMax] = useState(
    groupSettingsDefaults?.maxMembers ?? groupConfigInfo?.maximum ?? 4,
  );

  if (!groupConfigInfo) {
    return (
      <NoGroupConfigCard
        origHash={origHash}
        canEdit={canEditCourse}
        hasPreservedConfig={groupSettingsDefaults != null}
        onEnable={({ origHash: newHash, groupConfig, groupSettingsDefaults: newDefaults }) => {
          setOrigHash(newHash);
          setGroupConfigInfo(groupConfig);
          setGroupSettingsDefaults(newDefaults);
        }}
      />
    );
  }

  return (
    <div className="container d-flex flex-column gap-3">
      <GroupSettingsCard
        groupConfigInfo={groupConfigInfo}
        groupSettingsDefaults={groupSettingsDefaults}
        origHash={origHash}
        canEdit={canEditCourse}
        onOrigHashChange={setOrigHash}
        onGroupSizeSaved={(min, max) => {
          setGroupMin(min ?? 2);
          setGroupMax(max ?? 4);
        }}
        onDisable={({ origHash: newHash, groupSettingsDefaults: newDefaults }) => {
          setOrigHash(newHash);
          setGroupSettingsDefaults(newDefaults);
          setGroupConfigInfo(undefined);
        }}
      />
      <GroupsCard
        groupsCsvFilename={groupsCsvFilename}
        initialGroups={groups}
        initialNotAssigned={notAssigned}
        assessment={assessment}
        assessmentSet={assessmentSet}
        courseInstanceId={pageContext.course_instance.id}
        csrfToken={pageContext.__csrf_token}
        canEdit={canEditCourseInstance}
        groupMin={groupMin}
        groupMax={groupMax}
      />
    </div>
  );
}
