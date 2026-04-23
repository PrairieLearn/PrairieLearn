import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { getAppError } from '../../lib/client/errors.js';
import type {
  StaffAssessment,
  StaffAssessmentSet,
  StaffGroupConfig,
} from '../../lib/client/safe-db-types.js';
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
  onEnable,
}: {
  origHash: string | null;
  canEdit: boolean;
  onEnable: (result: {
    origHash: string;
    groupConfig: StaffGroupConfig;
    groupSettingsDefaults: GroupSettingsFormValues | null;
  }) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.enableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['EnableGroupWork']>(mutation.error);

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
          <h2 className="h5">This is not a group assessment.</h2>
          <div className="text-muted">
            {canEdit
              ? 'Enable group work to allow students to collaborate and submit as teams.'
              : 'Group work is not enabled for this assessment.'}
          </div>
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-primary mt-3"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ origHash }, { onSuccess: onEnable })}
            >
              Enable group work
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface InstructorAssessmentGroupsProps {
  groupsCsvFilename?: string;
  groupConfigInfo?: StaffGroupConfig;
  groups?: GroupUsersRow[];
  notAssigned?: string[];
  trpcCsrfToken: string;
  isDevMode: boolean;
  origHash: string | null;
  groupSettingsDefaults: GroupSettingsFormValues | null;
  courseInstanceId: string;
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  urlPrefix: string;
  csrfToken: string;
  canEditCourse: boolean;
  canEditCourseInstance: boolean;
}

export function InstructorAssessmentGroups({
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  trpcCsrfToken,
  isDevMode,
  origHash,
  groupSettingsDefaults,
  courseInstanceId,
  assessment,
  assessmentSet,
  urlPrefix,
  csrfToken,
  canEditCourse,
  canEditCourseInstance,
}: InstructorAssessmentGroupsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId,
      assessmentId: assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentGroupsInner
          groupsCsvFilename={groupsCsvFilename}
          groupConfigInfo={groupConfigInfo}
          groups={groups}
          notAssigned={notAssigned}
          origHash={origHash}
          groupSettingsDefaults={groupSettingsDefaults}
          assessment={assessment}
          assessmentSet={assessmentSet}
          urlPrefix={urlPrefix}
          csrfToken={csrfToken}
          canEditCourse={canEditCourse}
          canEditCourseInstance={canEditCourseInstance}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentGroups.displayName = 'InstructorAssessmentGroups';

function InstructorAssessmentGroupsInner({
  groupsCsvFilename,
  groupConfigInfo: initialGroupConfigInfo,
  groups,
  notAssigned,
  origHash: initialOrigHash,
  groupSettingsDefaults: initialGroupSettingsDefaults,
  assessment,
  assessmentSet,
  urlPrefix,
  csrfToken,
  canEditCourse,
  canEditCourseInstance,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode' | 'courseInstanceId'>) {
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
      />
      <GroupsCard
        groupsCsvFilename={groupsCsvFilename}
        initialGroups={groups}
        initialNotAssigned={notAssigned}
        assessment={assessment}
        assessmentSet={assessmentSet}
        urlPrefix={urlPrefix}
        csrfToken={csrfToken}
        canEdit={canEditCourseInstance}
        groupMin={groupMin}
        groupMax={groupMax}
      />
    </div>
  );
}
