import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Alert, Form } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { useModalState } from '@prairielearn/ui';

import { AssessmentModuleHeading } from '../../../components/AssessmentModuleHeading.js';
import { AssessmentUsageModal } from '../../../components/AssessmentUsageModal.js';
import {
  AddRowButton,
  InlineTableTextInput,
  ReorderableRowActionsCell,
  ReorderableRowsContext,
  getDuplicateNames,
  useReorderableRow,
} from '../../../components/ReorderableTable.js';
import { DEFAULT_ASSESSMENT_MODULE_NAME } from '../../../lib/assessment-modules.shared.js';
import { getCourseEditErrorUrl } from '../../../lib/client/url.js';
import type { AssessmentModulesError } from '../../../trpc/course/assessment-modules.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type {
  AssessmentModuleFormRow,
  StaffAssessmentModuleWithAssessments,
} from '../instructorCourseAdminModules.types.js';

import {
  DeleteAssessmentModuleModal,
  type DeleteAssessmentModuleModalData,
} from './DeleteAssessmentModuleModal.js';

interface ModulesFormValues {
  modules: AssessmentModuleFormRow[];
}

interface AssessmentModulesPageProps {
  trpcCsrfToken: string;
  courseId: string;
  initialModules: StaffAssessmentModuleWithAssessments[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  origHash: string | null;
}

const emptyModule = {
  assessments: [],
  course_id: null,
  heading: '',
  id: null,
  implicit: false,
  name: '',
  number: 0,
};

function toFormRow(module: StaffAssessmentModuleWithAssessments): AssessmentModuleFormRow {
  return { ...module, trackingId: module.id };
}

function AssessmentModuleRow({
  module,
  editMode,
  allowEdit,
  index,
  lockName,
  onDelete,
  onShowUsage,
}: {
  module: AssessmentModuleFormRow;
  editMode: boolean;
  allowEdit: boolean;
  index: number;
  lockName: boolean;
  onDelete: () => void;
  onShowUsage: () => void;
}) {
  const { ref, style, dragHandleProps } = useReorderableRow(module.trackingId);
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<ModulesFormValues>();
  const rowErrors = errors.modules?.[index];
  const onChange = () => setValue(`modules.${index}.implicit`, false, { shouldDirty: true });

  return (
    <tr ref={ref} style={style}>
      {editMode && allowEdit && (
        <ReorderableRowActionsCell
          trackingId={module.trackingId}
          dragHandleProps={dragHandleProps}
          deleteLabel={`Delete module ${module.name}`}
          deleteDisabledReason={
            lockName ? 'The Default module is required and cannot be deleted.' : null
          }
          onDelete={onDelete}
        />
      )}
      <td
        className={editMode && allowEdit ? 'align-top' : 'align-middle'}
        style={{ minWidth: '12rem' }}
      >
        {editMode && allowEdit ? (
          <InlineTableTextInput
            label={`Name for module ${index + 1}`}
            defaultValue={module.name}
            readOnly={lockName}
            description={
              lockName ? 'The Default module is required and cannot be renamed.' : undefined
            }
            error={rowErrors?.name}
            registration={register(`modules.${index}.name`, {
              onChange,
              validate: {
                required: (value) => !!value.trim() || 'Module name is required',
                unique: (value) =>
                  getValues('modules').every(
                    (row, i) => i === index || row.name.trim() !== value.trim(),
                  ) || 'Name must be unique',
              },
            })}
          />
        ) : (
          module.name
        )}
      </td>
      <td
        className={editMode && allowEdit ? 'align-top' : 'align-middle'}
        style={{ minWidth: '16rem' }}
      >
        {editMode && allowEdit ? (
          <InlineTableTextInput
            label={`Heading for module ${index + 1}`}
            defaultValue={module.heading}
            error={rowErrors?.heading}
            registration={register(`modules.${index}.heading`, {
              onChange,
              validate: (value) => !!value.trim() || 'Module heading is required',
            })}
          />
        ) : (
          <AssessmentModuleHeading assessmentModule={module} />
        )}
      </td>
      <td className={editMode && allowEdit ? 'align-top' : 'align-middle'}>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary text-nowrap"
          aria-label={`View ${module.assessments.length} assessment${module.assessments.length === 1 ? '' : 's'} in this module`}
          onClick={onShowUsage}
        >
          View assessments
        </button>
      </td>
    </tr>
  );
}

function AssessmentModulesTable({
  rows,
  onMove,
  editMode,
  allowEdit,
  defaultModuleId,
  handleDelete,
  handleCreate,
  handleShowUsage,
}: {
  rows: AssessmentModuleFormRow[];
  onMove: (from: number, to: number) => void;
  editMode: boolean;
  allowEdit: boolean;
  defaultModuleId: string | undefined;
  handleDelete: (module: AssessmentModuleFormRow) => void;
  handleCreate: () => void;
  handleShowUsage: (module: AssessmentModuleFormRow) => void;
}) {
  const rowsRef = useRef<HTMLTableSectionElement>(null);

  return (
    <ReorderableRowsContext rows={rows} rowsRef={rowsRef} onMove={onMove}>
      <table className="table table-sm table-hover table-striped" aria-label="Assessment modules">
        <thead>
          <tr>
            {editMode && allowEdit && (
              <th style={{ width: '1%' }}>
                <span className="visually-hidden">Drag and Delete</span>
              </th>
            )}
            <th>Name</th>
            <th className="col-6">Heading</th>
            <th>Action</th>
          </tr>
        </thead>
        {/* Table row groups don't support overflow clipping; clip the dragged row here. */}
        <tbody ref={rowsRef} style={{ clipPath: 'inset(0)' }}>
          {rows.map((module, index) => (
            <AssessmentModuleRow
              key={module.trackingId}
              module={module}
              editMode={editMode}
              allowEdit={allowEdit}
              index={index}
              lockName={module.id === defaultModuleId}
              onDelete={() => handleDelete(module)}
              onShowUsage={() => handleShowUsage(module)}
            />
          ))}
        </tbody>
        <tfoot>
          {editMode && allowEdit && (
            <tr>
              <td colSpan={4}>
                <AddRowButton onClick={handleCreate}>Add module</AddRowButton>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </ReorderableRowsContext>
  );
}

function AssessmentModulesCard({
  courseId,
  initialModules,
  allowEdit,
  isExampleCourse,
  origHash: initialOrigHash,
}: {
  courseId: string;
  initialModules: StaffAssessmentModuleWithAssessments[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  origHash: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const usageModal = useModalState<AssessmentModuleFormRow>();
  const deleteModal = useModalState<DeleteAssessmentModuleModalData>();

  const { data, refetch } = useQuery({
    ...trpc.assessmentModules.list.queryOptions(),
    staleTime: Infinity,
    initialData: { modules: initialModules, origHash: initialOrigHash },
  });
  const origHash = data.origHash;

  const [editMode, setEditMode] = useState(false);
  const form = useForm<ModulesFormValues>({ defaultValues: { modules: [] } });
  const { append, remove, move } = useFieldArray({ control: form.control, name: 'modules' });
  const modulesState = form.watch('modules');

  const saveMutation = useMutation({
    ...trpc.assessmentModules.save.mutationOptions(),
    onSuccess: async (result) => {
      // Record the new hash immediately so a failed refetch can't strand the
      // page with a stale hash, then refetch to pick up the saved modules.
      queryClient.setQueryData(trpc.assessmentModules.list.queryKey(), (old) =>
        old ? { ...old, origHash: result.origHash } : old,
      );
      try {
        await refetch();
      } finally {
        setEditMode(false);
      }
    },
  });

  const rows = editMode ? modulesState : data.modules.map(toFormRow);

  const duplicateNames = getDuplicateNames(rows.map((module) => module.name.trim()));

  const enterEditMode = () => {
    form.reset({ modules: data.modules.map(toFormRow) });
    saveMutation.reset();
    setEditMode(true);
  };

  const handleCreate = () => {
    append(
      { ...emptyModule, trackingId: crypto.randomUUID() },
      { focusName: `modules.${modulesState.length}.name` },
    );
  };

  const removeModule = (trackingId: string) => {
    remove(modulesState.findIndex((module) => module.trackingId === trackingId));
  };

  const handleDelete = (module: AssessmentModuleFormRow) => {
    if (module.assessments.length > 0) {
      deleteModal.showWithData(module);
    } else {
      removeModule(module.trackingId);
    }
  };

  const handleSubmit = ({ modules }: ModulesFormValues) => {
    saveMutation.mutate({
      modules: modules.map((module) => ({
        id: module.id,
        name: module.name.trim(),
        heading: module.heading.trim(),
        implicit: module.implicit,
      })),
      origHash,
    });
  };

  const saveError = getAppError<AssessmentModulesError['Save']>(saveMutation.error);

  return (
    <>
      <FormProvider {...form}>
        <Form as={editMode ? 'form' : 'div'} onSubmit={form.handleSubmit(handleSubmit)}>
          <fieldset disabled={saveMutation.isPending}>
            <legend className="visually-hidden">Assessment modules</legend>
            <div className="card mb-4">
              <div className="card-header bg-primary text-white d-flex align-items-center">
                <h1>Modules</h1>
                <div className="ms-auto">
                  {allowEdit && origHash ? (
                    !editMode ? (
                      <button
                        key="edit"
                        className="btn btn-sm btn-light"
                        type="button"
                        onClick={enterEditMode}
                      >
                        <i className="fa fa-edit" aria-hidden="true" /> Edit modules
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm btn-light mx-1"
                          type="submit"
                          disabled={!form.formState.isDirty || saveMutation.isPending}
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
                  <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Module
                  names must be unique; rename or remove the duplicates before saving.
                </div>
              )}

              <div className="table-responsive">
                <AssessmentModulesTable
                  rows={rows}
                  editMode={editMode}
                  allowEdit={allowEdit}
                  defaultModuleId={
                    data.modules.find((module) => module.name === DEFAULT_ASSESSMENT_MODULE_NAME)
                      ?.id
                  }
                  handleDelete={handleDelete}
                  handleCreate={handleCreate}
                  handleShowUsage={usageModal.showWithData}
                  onMove={move}
                />
              </div>

              <div className="card-footer">
                <small>
                  Modules can be used to group assessments by topic, chapter, section, or other
                  category. More information on modules can be found in the{' '}
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
          </fieldset>
        </Form>
      </FormProvider>

      {allowEdit && origHash === null && (
        <Alert variant="info">
          You cannot edit assessment modules because the <code>infoCourse.json</code> file does not
          exist.
        </Alert>
      )}

      {!allowEdit && isExampleCourse && (
        <Alert variant="info">You can't edit assessment modules in the example course.</Alert>
      )}

      <DeleteAssessmentModuleModal
        {...deleteModal}
        onConfirm={(module) => {
          removeModule(module.trackingId);
          deleteModal.hide();
        }}
      />

      <AssessmentUsageModal {...usageModal} entityLabel="module" />
    </>
  );
}

export function AssessmentModulesPage({
  trpcCsrfToken,
  courseId,
  ...innerProps
}: AssessmentModulesPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentModulesCard courseId={courseId} {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AssessmentModulesPage.displayName = 'AssessmentModulesPage';
