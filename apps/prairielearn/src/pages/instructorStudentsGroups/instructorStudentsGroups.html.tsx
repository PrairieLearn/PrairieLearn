import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { z } from 'zod';

import { NuqsAdapter } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';

class DeleteError extends Error {
  jobSequenceId?: string;

  constructor(message: string, jobSequenceId?: string) {
    super(message);
    this.jobSequenceId = jobSequenceId;
  }
}

import { GroupModifyModal, type GroupModifyModalData } from './components/GroupModifyModal.js';
import { GroupTableRow } from './components/GroupTableRow.js';
import {
  type StudentGroupWithUserData,
  StudentGroupWithUserDataSchema,
} from './instructorStudentsGroups.types.js';

interface StudentGroupsPageProps {
  csrfToken: string;
  courseInstanceId: string;
  studentsPageUrl: string;
  initialGroups: StudentGroupWithUserData[];
  canEdit: boolean;
  isDevMode: boolean;
  search: string;
  origHash: string | null;
}

interface DeleteModalData {
  groupId: string;
  groupName: string;
  userData: StudentGroupWithUserData['user_data'];
}

function StudentGroupsCard({
  csrfToken,
  courseInstanceId,
  studentsPageUrl: _studentsPageUrl,
  initialGroups,
  canEdit,
  origHash,
}: Omit<StudentGroupsPageProps, 'isDevMode' | 'search'>) {
  const queryClient = useQueryClient();
  const [groupParam, setGroupParam] = useQueryState('group', parseAsString.withDefault(''));
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModalDataState, setDeleteModalDataState] = useState<DeleteModalData | null>(null);
  const [deleteModalShow, setDeleteModalShow] = useState(false);
  const [showAllDeletedStudents, setShowAllDeletedStudents] = useState(false);

  const { data: groups } = useQuery<StudentGroupWithUserData[]>({
    queryKey: ['student-groups'],
    queryFn: async () => {
      const res = await fetch(`${window.location.pathname}/data.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      return z.array(StudentGroupWithUserDataSchema).parse(data);
    },
    staleTime: Infinity,
    initialData: initialGroups,
  });

  // Derive modal state from URL parameter (edit) or local state (add)
  const modifyModalData = useMemo((): GroupModifyModalData | null => {
    if (!canEdit) return null;

    if (showAddModal) {
      return { type: 'add', origHash };
    }

    if (groupParam) {
      const group = groups.find((g) => g.student_group.name === groupParam);
      if (group) {
        return {
          type: 'edit',
          groupId: group.student_group.id,
          name: group.student_group.name,
          color: group.student_group.color ?? 'gray1',
          uids: group.user_data.map((u) => u.uid).join('\n'),
          origHash,
        };
      }
    }

    return null;
  }, [showAddModal, groupParam, groups, canEdit, origHash]);

  const modifyModalShow = modifyModalData !== null;

  const deleteMutation = useMutation({
    mutationFn: async ({ groupId, groupName }: { groupId: string; groupName: string }) => {
      const body = new URLSearchParams({
        __action: 'delete_group',
        __csrf_token: csrfToken,
        group_id: groupId,
        group_name: groupName,
        orig_hash: origHash ?? '',
      });
      const res = await fetch(window.location.href.split('?')[0], {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new DeleteError(json.error ?? 'Failed to delete group', json.jobSequenceId);
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
      setDeleteModalShow(false);
    },
  });

  const handleEdit = (group: StudentGroupWithUserData) => {
    void setGroupParam(group.student_group.name);
  };

  const handleDelete = (group: StudentGroupWithUserData) => {
    setDeleteModalDataState({
      groupId: group.student_group.id,
      groupName: group.student_group.name,
      userData: group.user_data,
    });
    setDeleteModalShow(true);
  };

  const handleModalHide = () => {
    setShowAddModal(false);
    void setGroupParam(null);
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
    setShowAddModal(false);
    void setGroupParam(null);
  };

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h1 className="h6 mb-0">Student groups</h1>
          {canEdit && (
            <Button variant="light" size="sm" onClick={() => setShowAddModal(true)}>
              <i className="fas fa-plus me-1" />
              Add group
            </Button>
          )}
        </div>
        <div className="card-body">
          {groups.length === 0 ? (
            <p className="text-muted mb-0">
              No student groups have been created yet.
              {canEdit && ' Click "Add group" above to create your first group.'}
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Students</th>
                    {canEdit && <th style={{ width: '140px' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <GroupTableRow
                      key={group.student_group.id}
                      group={group}
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
        </div>
      </div>

      <GroupModifyModal
        data={modifyModalData}
        csrfToken={csrfToken}
        courseInstanceId={courseInstanceId}
        show={modifyModalShow}
        onHide={handleModalHide}
        onExited={() => {}}
        onSuccess={handleSuccess}
      />

      <Modal
        show={deleteModalShow}
        onHide={() => setDeleteModalShow(false)}
        onExited={() => {
          setShowAllDeletedStudents(false);
          setDeleteModalDataState(null);
          deleteMutation.reset();
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete student group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
              {deleteMutation.error.message}
              {deleteMutation.error instanceof DeleteError &&
                deleteMutation.error.jobSequenceId && (
                  <>
                    {' '}
                    <a
                      href={getCourseInstanceJobSequenceUrl(
                        courseInstanceId,
                        deleteMutation.error.jobSequenceId,
                      )}
                    >
                      View job logs
                    </a>
                  </>
                )}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the group{' '}
            <strong>{deleteModalDataState?.groupName}</strong>?
          </p>
          {(deleteModalDataState?.userData.length ?? 0) > 0 && (
            <Alert variant="warning">
              This group has {deleteModalDataState?.userData.length} student
              {deleteModalDataState?.userData.length !== 1 ? 's' : ''}. They will be removed from
              this group.
              <details className="mt-2">
                <summary className="cursor-pointer">
                  {showAllDeletedStudents ? 'Hide' : 'Show'} affected students
                </summary>
                <div className="mt-2 p-2 bg-light border rounded">
                  {deleteModalDataState?.userData.map((user) => (
                    <div key={user.uid}>{user.name || user.uid}</div>
                  ))}
                </div>
              </details>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteModalShow(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() =>
              deleteModalDataState &&
              deleteMutation.mutate({
                groupId: deleteModalDataState.groupId,
                groupName: deleteModalDataState.groupName,
              })
            }
          >
            {deleteMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin me-1" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export function InstructorStudentsGroups(props: StudentGroupsPageProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={props.search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
        <StudentGroupsCard {...props} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorStudentsGroups.displayName = 'InstructorStudentsGroups';
