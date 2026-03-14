import { QueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { useModalState } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createCourseInstanceTrpcClient } from '../../trpc/courseInstance/client.js';

import { LabelDeleteModal, type LabelDeleteModalData } from './components/LabelDeleteModal.js';
import { LabelModifyModal, type LabelModifyModalData } from './components/LabelModifyModal.js';
import { LabelTableRow } from './components/LabelTableRow.js';
import type { StudentLabelWithUserData } from './instructorStudentsLabels.types.js';

type StudentLabelsTrpcClient = ReturnType<typeof createCourseInstanceTrpcClient>;

interface StudentLabelsPageProps {
  csrfToken: string;
  trpcCsrfToken: string;
  courseInstanceId: string;
  initialLabels: StudentLabelWithUserData[];
  canEdit: boolean;
  isDevMode: boolean;
  origHash: string | null;
}

type StudentLabelsCardProps = Omit<StudentLabelsPageProps, 'isDevMode' | 'trpcCsrfToken'> & {
  trpcClient: StudentLabelsTrpcClient;
};

function StudentLabelsCard({
  trpcClient,
  courseInstanceId,
  initialLabels,
  canEdit: canEditProp,
  origHash: initialOrigHash,
}: Omit<StudentLabelsCardProps, 'csrfToken'>) {
  const editModal = useModalState<LabelModifyModalData>();
  const deleteModal = useModalState<LabelDeleteModalData>();
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [enrollmentWarning, setEnrollmentWarning] = useState<string | null>(null);

  const { data: labels = initialLabels, refetch: refetchLabels } = useQuery({
    queryKey: ['student-labels-with-user-data', courseInstanceId],
    queryFn: async () => {
      const result = await trpcClient.studentLabels.list.query();
      setOrigHash(result.origHash);
      return result.labels;
    },
    staleTime: Infinity,
    initialData: initialLabels,
  });

  const canEdit = canEditProp && origHash !== null;

  const handleEdit = (label: StudentLabelWithUserData) => {
    editModal.showWithData({
      type: 'edit',
      labelId: label.student_label.id,
      name: label.student_label.name,
      color: label.student_label.color,
      uids: label.user_data.map((u) => u.uid),
      origHash,
    });
  };

  const handleDelete = (label: StudentLabelWithUserData) => {
    deleteModal.showWithData({
      labelId: label.student_label.id,
      labelName: label.student_label.name,
      userData: label.user_data,
    });
  };

  const handleDeleteSuccess = async (newOrigHash: string | null) => {
    setOrigHash(newOrigHash);
    await refetchLabels();
    deleteModal.hide();
  };

  const handleEditSuccess = async (result: {
    origHash: string | null;
    enrollmentWarning?: string;
  }) => {
    setOrigHash(result.origHash);
    setEnrollmentWarning(result.enrollmentWarning ?? null);
    await refetchLabels();
    editModal.hide();
  };

  return (
    <>
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Student labels</h2>
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm text-nowrap"
              onClick={() => editModal.showWithData({ type: 'add', origHash })}
            >
              Add label
            </button>
          )}
        </div>
        <small className="text-muted">
          Organize students for filtering and analysis. Labels can be used to track sections,
          accommodations, or any custom categorization. Labels are not visible to students.
        </small>
      </div>

      {enrollmentWarning && (
        <Alert variant="warning" dismissible onClose={() => setEnrollmentWarning(null)}>
          {enrollmentWarning}
        </Alert>
      )}

      {canEditProp && origHash === null && (
        <div className="alert alert-info" role="alert">
          You cannot edit student labels because the <code>infoCourseInstance.json</code> file does
          not exist.
        </div>
      )}

      {labels.length === 0 ? (
        <div className="text-center text-muted mb-3">
          <p className="mb-0">No student labels configured.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Name</th>
                <th>Students</th>
                {canEdit && <th style={{ width: '140px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <LabelTableRow
                  key={label.student_label.id}
                  label={label}
                  courseInstanceId={courseInstanceId}
                  canEdit={canEdit}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LabelModifyModal
        data={editModal.data}
        trpcClient={trpcClient}
        courseInstanceId={courseInstanceId}
        show={editModal.show}
        onHide={editModal.onHide}
        onExited={editModal.onExited}
        onSuccess={handleEditSuccess}
      />

      <LabelDeleteModal
        data={deleteModal.data}
        trpcClient={trpcClient}
        courseInstanceId={courseInstanceId}
        origHash={origHash}
        show={deleteModal.show}
        onHide={deleteModal.onHide}
        onExited={deleteModal.onExited}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}

export function InstructorStudentsLabels({
  isDevMode,
  trpcCsrfToken,
  courseInstanceId,
  ...innerProps
}: StudentLabelsPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseInstanceTrpcClient({ csrfToken: trpcCsrfToken, courseInstanceId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <StudentLabelsCard
        trpcClient={trpcClient}
        courseInstanceId={courseInstanceId}
        {...innerProps}
      />
    </QueryClientProviderDebug>
  );
}

InstructorStudentsLabels.displayName = 'InstructorStudentsLabels';
