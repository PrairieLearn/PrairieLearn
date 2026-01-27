import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { NuqsAdapter } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { LabelDeleteModal, type LabelDeleteModalData } from './components/LabelDeleteModal.js';
import { LabelModifyModal, type LabelModifyModalData } from './components/LabelModifyModal.js';
import { LabelTableRow } from './components/LabelTableRow.js';
import {
  type StudentLabelWithUserData,
  StudentLabelWithUserDataSchema,
} from './instructorStudentsLabels.types.js';

interface StudentLabelsPageProps {
  csrfToken: string;
  courseInstanceId: string;
  initialLabels: StudentLabelWithUserData[];
  canEdit: boolean;
  isDevMode: boolean;
  search: string;
  origHash: string | null;
}

function StudentLabelsCard({
  csrfToken,
  courseInstanceId,
  initialLabels,
  canEdit,
  origHash,
}: Omit<StudentLabelsPageProps, 'isDevMode' | 'search'>) {
  const queryClient = useQueryClient();
  const [labelParam, setLabelParam] = useQueryState('label', parseAsString.withDefault(''));
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<LabelDeleteModalData | null>(null);
  const [deleteModalShow, setDeleteModalShow] = useState(false);

  const { data: labels } = useQuery<StudentLabelWithUserData[]>({
    queryKey: ['student-labels'],
    queryFn: async () => {
      const res = await fetch(`${window.location.pathname}/data.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch labels');
      const data = await res.json();
      return z.array(StudentLabelWithUserDataSchema).parse(data);
    },
    staleTime: Infinity,
    initialData: initialLabels,
  });

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
    setDeleteModalData({
      labelId: label.student_label.id,
      labelName: label.student_label.name,
      userData: label.user_data,
    });
    setDeleteModalShow(true);
  };

  const handleDeleteSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student-labels'] });
    setDeleteModalShow(false);
  };

  const handleModalHide = () => {
    setShowAddModal(false);
    void setLabelParam(null);
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student-labels'] });
    setShowAddModal(false);
    void setLabelParam(null);
  };

  return (
    <>
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Student labels</h5>
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
        csrfToken={csrfToken}
        courseInstanceId={courseInstanceId}
        show={modifyModalShow}
        onHide={handleModalHide}
        onSuccess={handleSuccess}
      />

      <LabelDeleteModal
        data={deleteModalData}
        csrfToken={csrfToken}
        courseInstanceId={courseInstanceId}
        origHash={origHash}
        show={deleteModalShow}
        onHide={() => setDeleteModalShow(false)}
        onExited={() => setDeleteModalData(null)}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}

export function InstructorStudentsLabels(props: StudentLabelsPageProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={props.search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
        <StudentLabelsCard {...props} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorStudentsLabels.displayName = 'InstructorStudentsLabels';
