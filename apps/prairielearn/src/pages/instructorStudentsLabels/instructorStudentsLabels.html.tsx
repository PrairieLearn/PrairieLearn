import { QueryClient } from '@tanstack/react-query';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';

import { NuqsAdapter, useModalState } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { LabelDeleteModal, type LabelDeleteModalData } from './components/LabelDeleteModal.js';
import { LabelModifyModal, type LabelModifyModalData } from './components/LabelModifyModal.js';
import { LabelTableRow } from './components/LabelTableRow.js';
import type { StudentLabelWithUserData } from './instructorStudentsLabels.types.js';
import {
  type StudentLabelsTrpcClient,
  createStudentLabelsTrpcClient,
} from './utils/trpc-client.js';

interface StudentLabelsPageProps {
  csrfToken: string;
  trpcCsrfToken: string;
  courseInstanceId: string;
  initialLabels: StudentLabelWithUserData[];
  canEdit: boolean;
  isDevMode: boolean;
  search: string;
  origHash: string | null;
}

type StudentLabelsCardProps = Omit<
  StudentLabelsPageProps,
  'isDevMode' | 'search' | 'trpcCsrfToken'
> & {
  trpcClient: StudentLabelsTrpcClient;
};

function StudentLabelsCard({
  trpcClient,
  courseInstanceId,
  initialLabels,
  canEdit,
  origHash: initialOrigHash,
}: Omit<StudentLabelsCardProps, 'csrfToken'>) {
  const [labelParam, setLabelParam] = useQueryState('label', parseAsString.withDefault(''));
  const [showAddModal, setShowAddModal] = useState(false);
  const deleteModal = useModalState<LabelDeleteModalData>();
  const [labels, setLabels] = useState<StudentLabelWithUserData[]>(initialLabels);
  const [origHash, setOrigHash] = useState(initialOrigHash);

  const fetchLabels = async () => {
    const newLabels = await trpcClient.labels.query();
    setLabels(newLabels);
    return newLabels;
  };

  // Derive modal state from URL parameter (edit) or local state (add)
  const modifyModalData = useMemo((): LabelModifyModalData | null => {
    if (!canEdit) return null;

    if (showAddModal) {
      return { type: 'add', origHash };
    }

    if (labelParam) {
      const label = labels.find((l) => l.student_label.name === labelParam);
      if (label) {
        return {
          type: 'edit',
          labelId: label.student_label.id,
          name: label.student_label.name,
          color: label.student_label.color,
          uids: label.user_data.map((u) => u.uid).join('\n'),
          origHash,
        };
      }
    }

    return null;
  }, [showAddModal, labelParam, labels, canEdit, origHash]);

  const modifyModalShow = modifyModalData !== null;

  const handleEdit = (label: StudentLabelWithUserData) => {
    void setLabelParam(label.student_label.name);
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
    try {
      await fetchLabels();
    } catch {
      // The delete succeeded; if the refetch fails, the user can refresh the page.
    }
    deleteModal.hide();
  };

  const handleModalHide = () => {
    setShowAddModal(false);
    void setLabelParam(null);
  };

  const handleSuccess = async (newOrigHash: string | null) => {
    setOrigHash(newOrigHash);
    try {
      await fetchLabels();
    } catch {
      // The save succeeded; if the refetch fails, the user can refresh the page.
    }
    setShowAddModal(false);
    void setLabelParam(null);
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
              onClick={() => setShowAddModal(true)}
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
        data={modifyModalData}
        trpcClient={trpcClient}
        courseInstanceId={courseInstanceId}
        show={modifyModalShow}
        onHide={handleModalHide}
        onSuccess={handleSuccess}
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
  search,
  isDevMode,
  trpcCsrfToken,
  ...innerProps
}: StudentLabelsPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createStudentLabelsTrpcClient(trpcCsrfToken));

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <StudentLabelsCard trpcClient={trpcClient} {...innerProps} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorStudentsLabels.displayName = 'InstructorStudentsLabels';
