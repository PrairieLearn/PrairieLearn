import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { useModalState } from '@prairielearn/ui';

import { AssessmentModuleHeading } from '../../../components/AssessmentModuleHeading.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import type { StaffAssessmentModule } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseEditErrorUrl } from '../../../lib/client/url.js';
import type { AssessmentModulesError } from '../../../trpc/course/assessment-modules.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { AssessmentModuleFormRow } from '../instructorCourseAdminModules.types.js';

import {
  EditAssessmentModuleModal,
  type EditAssessmentModuleModalData,
} from './EditAssessmentModuleModal.js';

interface AssessmentModulesPageProps {
  trpcCsrfToken: string;
  courseId: string;
  initialModules: StaffAssessmentModule[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  isDevMode: boolean;
  origHash: string | null;
}

const emptyModule = {
  course_id: null,
  heading: '',
  id: null,
  implicit: false,
  name: '',
  number: 0,
};

function toFormRow(module: StaffAssessmentModule): AssessmentModuleFormRow {
  return { ...module, trackingId: module.id };
}

function AssessmentModulesCard({
  courseId,
  initialModules,
  allowEdit,
  isExampleCourse,
  origHash: initialOrigHash,
}: {
  courseId: string;
  initialModules: StaffAssessmentModule[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  origHash: string | null;
}) {
  const trpc = useTRPC();
  const editModal = useModalState<EditAssessmentModuleModalData>();

  const { data, refetch } = useQuery({
    ...trpc.assessmentModules.list.queryOptions(),
    staleTime: Infinity,
    initialData: { modules: initialModules, origHash: initialOrigHash },
  });

  const [editMode, setEditMode] = useState(false);
  const [modulesState, setModulesState] = useState<AssessmentModuleFormRow[]>([]);
  const [origHashOverride, setOrigHashOverride] = useState<string | null>(null);
  const origHash = origHashOverride ?? data.origHash ?? initialOrigHash;

  const saveMutation = useMutation({
    ...trpc.assessmentModules.save.mutationOptions(),
    onSuccess: async (result) => {
      setOrigHashOverride(result.origHash);
      await refetch();
      setEditMode(false);
    },
  });

  const rows = editMode ? modulesState : data.modules.map(toFormRow);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const module of rows) {
      counts.set(module.name, (counts.get(module.name) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  }, [rows]);

  const existingNames = useMemo(() => {
    const editingId = editModal.data?.assessmentModule.trackingId ?? null;
    return new Set(
      modulesState.filter((module) => module.trackingId !== editingId).map((module) => module.name),
    );
  }, [modulesState, editModal.data]);

  const enterEditMode = () => {
    setModulesState(data.modules.map(toFormRow));
    saveMutation.reset();
    setEditMode(true);
  };

  const handleCreate = () => {
    editModal.showWithData({
      mode: 'create',
      assessmentModule: { ...emptyModule, trackingId: crypto.randomUUID() },
    });
  };

  const handleEdit = (trackingId: string) => {
    const module = modulesState.find((m) => m.trackingId === trackingId);
    if (!module) return;
    // Once a module is edited, it is no longer implicit.
    editModal.showWithData({ mode: 'edit', assessmentModule: { ...module, implicit: false } });
  };

  const handleSave = (assessmentModule: AssessmentModuleFormRow) => {
    if (editModal.data?.mode === 'create') {
      setModulesState((prev) => [...prev, assessmentModule]);
    } else {
      setModulesState((prev) =>
        prev.map((m) => (m.trackingId === assessmentModule.trackingId ? assessmentModule : m)),
      );
    }
    editModal.hide();
  };

  const handleDelete = (trackingId: string) => {
    setModulesState((prev) => prev.filter((m) => m.trackingId !== trackingId));
  };

  const handleSubmit = () => {
    saveMutation.mutate({
      modules: modulesState.map((module) => ({
        name: module.name,
        heading: module.heading,
        implicit: module.implicit,
      })),
      origHash,
    });
  };

  const saveError = getAppError<AssessmentModulesError['Save']>(saveMutation.error);

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>Modules</h1>
          <div className="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button className="btn btn-sm btn-light" type="button" onClick={enterEditMode}>
                  <i className="fa fa-edit" aria-hidden="true" /> Edit modules
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-sm btn-light mx-1"
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={handleSubmit}
                  >
                    {saveMutation.isPending ? (
                      <span
                        className="spinner-border spinner-border-sm me-1"
                        role="status"
                        aria-hidden="true"
                      />
                    ) : (
                      <i className="fa fa-save" aria-hidden="true" />
                    )}{' '}
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-light"
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={() => {
                      saveMutation.reset();
                      setEditMode(false);
                    }}
                  >
                    Cancel
                  </button>
                </>
              )
            ) : null}
          </div>
        </div>

        {saveError && (
          <AppErrorAlert
            error={saveError}
            className="m-3"
            render={{
              SYNC_JOB_FAILED: ({ message, jobSequenceId }) => (
                <>
                  {message}{' '}
                  <a href={getCourseEditErrorUrl(courseId, jobSequenceId)}>View job logs</a>
                </>
              ),
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => saveMutation.reset()}
          />
        )}

        {editMode && duplicateNames.length > 0 && (
          <div className="alert alert-warning m-3" role="alert">
            <i className="fa fa-exclamation-triangle" aria-hidden="true" />{' '}
            <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Only the last
            module with each name will be synced.
          </div>
        )}

        <div className="table-responsive">
          <table
            className="table table-sm table-hover table-striped"
            aria-label="Assessment modules"
          >
            <thead>
              <tr>
                {editMode && allowEdit && (
                  <th style={{ width: '1%' }}>
                    <span className="visually-hidden">Edit and Delete</span>
                  </th>
                )}
                <th>Name</th>
                <th className="col-9">Heading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((module) => (
                <tr key={module.trackingId}>
                  {editMode && allowEdit && (
                    <td className="align-middle">
                      <div className="d-flex align-items-center">
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          aria-label={`Edit module ${module.name}`}
                          onClick={() => handleEdit(module.trackingId)}
                        >
                          <i className="fa fa-edit" aria-hidden="true" />
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          aria-label={`Delete module ${module.name}`}
                          onClick={() => handleDelete(module.trackingId)}
                        >
                          <i className="fa fa-trash text-danger" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="align-middle">{module.name}</td>
                  <td className="align-middle">
                    <AssessmentModuleHeading assessmentModule={module} />
                  </td>
                </tr>
              ))}
              {editMode && allowEdit && (
                <tr>
                  <td colSpan={3}>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                      <i className="fa fa-plus" aria-hidden="true" /> New module
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card-footer">
          <small>
            Modules can be used to group assessments by topic, chapter, section, or other category.
            More information on modules can be found in the{' '}
            <a
              href="https://docs.prairielearn.com/course/#assessment-modules"
              target="_blank"
              rel="noreferrer"
            >
              PrairieLearn documentation
            </a>
            .
          </small>
        </div>
      </div>

      {allowEdit && origHash === null && (
        <Alert variant="info">
          You cannot edit assessment modules because the <code>infoCourse.json</code> file does not
          exist.
        </Alert>
      )}

      {!allowEdit && isExampleCourse && (
        <Alert variant="info">You can't edit assessment modules in the example course.</Alert>
      )}

      <EditAssessmentModuleModal {...editModal} existingNames={existingNames} onSave={handleSave} />
    </>
  );
}

export function AssessmentModulesPage({
  isDevMode,
  trpcCsrfToken,
  courseId,
  ...innerProps
}: AssessmentModulesPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentModulesCard courseId={courseId} {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AssessmentModulesPage.displayName = 'AssessmentModulesPage';
