import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { run } from '@prairielearn/run';

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
import { GroupWorkInstancesWarning } from './components/GroupWorkInstancesWarning.js';
import { GroupsCard } from './components/GroupsCard.js';
import { ManageGroupWorkCard } from './components/ManageGroupWorkCard.js';

function NoGroupConfigCard({
  origHash,
  canEdit,
  hasAssessmentInstances,
  courseInstanceId,
  assessment,
  enableUnavailableReason,
  onEnable,
}: {
  origHash: string | null;
  canEdit: boolean;
  hasAssessmentInstances: boolean;
  courseInstanceId: string;
  assessment: StaffAssessment;
  enableUnavailableReason?: string;
  onEnable: (result: {
    origHash: string;
    groupConfig: StaffGroupConfig;
    groupSettingsDefaults: GroupSettingsFormValues | null;
    groups?: GroupUsersRow[];
    notAssigned?: string[];
  }) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.enableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['EnableGroupWork']>(mutation.error);

  const description = canEdit
    ? 'Enable group work to allow students to collaborate and submit as groups.'
    : 'Group work is not enabled for this assessment.';

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
          <div className="text-muted">{description}</div>
          {!canEdit && enableUnavailableReason && (
            <Alert variant="info" className="mt-3 mb-0">
              {enableUnavailableReason}
            </Alert>
          )}
          {canEdit && hasAssessmentInstances && (
            <GroupWorkInstancesWarning
              action="enabling"
              courseInstanceId={courseInstanceId}
              assessmentId={assessment.id}
              className="mt-3 mb-0"
            />
          )}
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-primary mt-3"
              disabled={mutation.isPending || hasAssessmentInstances}
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

interface InstructorAssessmentGroupsPermissions {
  isExampleCourse: boolean;
  hasCoursePermissionEdit: boolean;
  hasCourseInstancePermissionView: boolean;
  hasCourseInstancePermissionEdit: boolean;
}

interface InstructorAssessmentGroupsProps {
  courseInstanceId: string;
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  permissions: InstructorAssessmentGroupsPermissions;
  csrfToken: string;
  groupsCsvFilename: string;
  groupConfigInfo?: StaffGroupConfig;
  groups?: GroupUsersRow[];
  notAssigned?: string[];
  trpcCsrfToken: string;
  isDevMode: boolean;
  origHash: string | null;
  groupSettingsDefaults: GroupSettingsFormValues | null;
  hasAssessmentInstances: boolean;
}

export function InstructorAssessmentGroups({
  courseInstanceId,
  assessment,
  assessmentSet,
  permissions,
  csrfToken,
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  trpcCsrfToken,
  isDevMode,
  origHash,
  groupSettingsDefaults,
  hasAssessmentInstances,
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
          courseInstanceId={courseInstanceId}
          assessment={assessment}
          assessmentSet={assessmentSet}
          permissions={permissions}
          csrfToken={csrfToken}
          groupsCsvFilename={groupsCsvFilename}
          groupConfigInfo={groupConfigInfo}
          groups={groups}
          notAssigned={notAssigned}
          origHash={origHash}
          groupSettingsDefaults={groupSettingsDefaults}
          hasAssessmentInstances={hasAssessmentInstances}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentGroups.displayName = 'InstructorAssessmentGroups';

function InstructorAssessmentGroupsInner({
  courseInstanceId,
  assessment,
  assessmentSet,
  permissions,
  csrfToken,
  groupsCsvFilename,
  groupConfigInfo: initialGroupConfigInfo,
  groups: initialGroups,
  notAssigned: initialNotAssigned,
  origHash: initialOrigHash,
  groupSettingsDefaults: initialGroupSettingsDefaults,
  hasAssessmentInstances,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const [groupConfigInfo, setGroupConfigInfo] = useState(initialGroupConfigInfo);
  const [groupSettingsDefaults, setGroupSettingsDefaults] = useState(initialGroupSettingsDefaults);
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [groups, setGroups] = useState(initialGroups);
  const [notAssigned, setNotAssigned] = useState(initialNotAssigned);
  const [minGroupSize, setMinGroupSize] = useState(
    groupSettingsDefaults?.minMembers ?? groupConfigInfo?.minimum ?? 2,
  );
  const [maxGroupSize, setMaxGroupSize] = useState(
    groupSettingsDefaults?.maxMembers ?? groupConfigInfo?.maximum ?? 4,
  );
  const [saveStatus, setSaveStatus] = useState<
    { kind: 'success' } | { kind: 'error'; message: string } | null
  >(null);
  const canEditGroupSettings = permissions.hasCoursePermissionEdit && !permissions.isExampleCourse;
  const canEditStudentData =
    permissions.hasCourseInstancePermissionEdit && !permissions.isExampleCourse;
  const canDisableGroupWork = canEditGroupSettings && canEditStudentData;
  const showManageGroupWork =
    permissions.hasCoursePermissionEdit || permissions.hasCourseInstancePermissionEdit;

  if (!groupConfigInfo) {
    return (
      <NoGroupConfigCard
        origHash={origHash}
        canEdit={canEditGroupSettings}
        hasAssessmentInstances={hasAssessmentInstances}
        courseInstanceId={courseInstanceId}
        assessment={assessment}
        enableUnavailableReason={run(() => {
          if (permissions.isExampleCourse) {
            return 'Enabling group work is not available for example courses.';
          }
          if (!permissions.hasCoursePermissionEdit) {
            return 'Enabling group work requires course editor permissions.';
          }
        })}
        onEnable={({
          origHash: newHash,
          groupConfig,
          groupSettingsDefaults: newDefaults,
          groups: newGroups,
          notAssigned: newNotAssigned,
        }) => {
          setOrigHash(newHash);
          setGroupConfigInfo(groupConfig);
          setGroupSettingsDefaults(newDefaults);
          setGroups(newGroups);
          setNotAssigned(newNotAssigned);
        }}
      />
    );
  }

  return (
    <>
      <div className="container d-flex flex-column gap-3 py-3">
        <GroupSettingsCard
          groupConfigInfo={groupConfigInfo}
          groupSettingsDefaults={groupSettingsDefaults}
          origHash={origHash}
          canEdit={canEditGroupSettings}
          editUnavailableReason={run(() => {
            if (permissions.isExampleCourse) {
              return 'Editing group settings is not available for example courses.';
            }
            if (!permissions.hasCoursePermissionEdit) {
              return 'Editing group settings requires course editor permissions.';
            }
          })}
          onOrigHashChange={setOrigHash}
          onGroupSizeSaved={(min, max) => {
            setMinGroupSize(min ?? 2);
            setMaxGroupSize(max ?? 4);
          }}
          onSaved={() => setSaveStatus({ kind: 'success' })}
          onSaveError={(message) => setSaveStatus({ kind: 'error', message })}
          onClearSaveStatus={() => setSaveStatus(null)}
        />

        {permissions.hasCourseInstancePermissionView ? (
          <GroupsCard
            groupsCsvFilename={groupsCsvFilename}
            initialGroups={groups}
            initialNotAssigned={notAssigned}
            assessment={assessment}
            assessmentSet={assessmentSet}
            courseInstanceId={courseInstanceId}
            csrfToken={csrfToken}
            canEdit={canEditStudentData}
            editUnavailableReason={run(() => {
              if (permissions.isExampleCourse) {
                return 'Editing group memberships is not available for example courses.';
              }
              if (!permissions.hasCourseInstancePermissionEdit) {
                return 'Editing group memberships requires student data editor permissions.';
              }
            })}
            minGroupSize={minGroupSize}
            maxGroupSize={maxGroupSize}
          />
        ) : (
          <div className="card">
            <div className="card-body">
              <h5 className="mb-1">Groups</h5>
              <div className="text-muted small mb-3">
                View and manage student group memberships for this assessment.
              </div>
              <Alert variant="info" className="mb-0">
                You must have student data viewer permissions to view student group memberships.
              </Alert>
            </div>
          </div>
        )}

        {showManageGroupWork && (
          <ManageGroupWorkCard
            origHash={origHash}
            hasAssessmentInstances={hasAssessmentInstances}
            courseInstanceId={courseInstanceId}
            assessmentId={assessment.id}
            canDisable={canDisableGroupWork}
            disableUnavailableReason={run(() => {
              if (permissions.isExampleCourse) {
                return 'Disabling group work is not available for example courses.';
              }
              if (
                !permissions.hasCoursePermissionEdit &&
                !permissions.hasCourseInstancePermissionEdit
              ) {
                return 'Disabling group work requires both course editor and student data editor permissions because it changes group settings and permanently removes group memberships.';
              }
              if (!permissions.hasCoursePermissionEdit) {
                return 'Disabling group work requires course editor permissions because it changes group settings.';
              }
              if (!permissions.hasCourseInstancePermissionEdit) {
                return 'Disabling group work requires student data editor permissions because it permanently removes group memberships.';
              }
            })}
            onDisable={({ origHash: newHash }) => {
              setOrigHash(newHash);
              setGroupSettingsDefaults(null);
              setGroupConfigInfo(undefined);
              setGroups([]);
              setNotAssigned([]);
            }}
          />
        )}
      </div>

      {canEditGroupSettings && saveStatus && (
        <div className="position-sticky bottom-0 z-3 bg-body border-top">
          {saveStatus.kind === 'success' && (
            <Alert
              className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
              variant="success"
              dismissible
              onClose={() => setSaveStatus(null)}
            >
              Group configuration saved.
            </Alert>
          )}
          {saveStatus.kind === 'error' && (
            <Alert
              className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
              variant="danger"
              dismissible
              onClose={() => setSaveStatus(null)}
            >
              {saveStatus.message}
            </Alert>
          )}
        </div>
      )}
    </>
  );
}
