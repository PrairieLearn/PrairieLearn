import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'preact/compat';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { z } from 'zod';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import {
  type StudentGroupRow,
  StudentGroupRowSchema,
} from './instructorInstanceAdminStudentGroups.types.js';

interface StudentGroupsPageProps {
  csrfToken: string;
  courseInstanceId: string;
  studentsPageUrl: string;
  initialGroups: StudentGroupRow[];
  canEdit: boolean;
  isDevMode: boolean;
}

function EditableGroupName({
  group,
  csrfToken,
  canEdit,
}: {
  group: StudentGroupRow;
  csrfToken: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(group.name);

  const renameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const body = new URLSearchParams({
        __action: 'rename_group',
        __csrf_token: csrfToken,
        group_id: group.id,
        name: newName,
      });
      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to rename group');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    if (editValue.trim() && editValue !== group.name) {
      renameMutation.mutate(editValue.trim());
    } else {
      setIsEditing(false);
      setEditValue(group.name);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(group.name);
    }
  };

  if (!canEdit) {
    return <span>{group.name}</span>;
  }

  if (isEditing) {
    return (
      <div className="d-flex align-items-center gap-2">
        <Form.Control
          type="text"
          size="sm"
          value={editValue}
          disabled={renameMutation.isPending}
          autoFocus
          onChange={(e) => setEditValue((e.target as HTMLInputElement).value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
        {renameMutation.isPending && <i className="fas fa-spinner fa-spin" />}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-link p-0 text-start text-decoration-none"
      title="Click to rename"
      onClick={() => {
        setEditValue(group.name);
        setIsEditing(true);
      }}
    >
      {group.name}
      <i className="fas fa-pencil-alt ms-2 text-muted small" />
    </button>
  );
}

function StudentGroupsCard({
  csrfToken,
  courseInstanceId,
  studentsPageUrl,
  initialGroups,
  canEdit,
}: Omit<StudentGroupsPageProps, 'isDevMode'>) {
  const queryClient = useQueryClient();
  const [newGroupName, setNewGroupName] = useState('');
  const [deleteModalGroup, setDeleteModalGroup] = useState<StudentGroupRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: groups } = useQuery<StudentGroupRow[]>({
    queryKey: ['student-groups'],
    queryFn: async () => {
      const res = await fetch(`${window.location.pathname}/data.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      return z.array(StudentGroupRowSchema).parse(data);
    },
    staleTime: Infinity,
    initialData: initialGroups,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const body = new URLSearchParams({
        __action: 'create_group',
        __csrf_token: csrfToken,
        name,
      });
      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to create group');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
      setNewGroupName('');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const body = new URLSearchParams({
        __action: 'delete_group',
        __csrf_token: csrfToken,
        group_id: groupId,
      });
      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to delete group');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
      setDeleteModalGroup(null);
    },
  });

  const handleCreateGroup = useCallback(
    (e: Event) => {
      e.preventDefault();
      if (newGroupName.trim()) {
        createMutation.mutate(newGroupName.trim());
      }
    },
    [newGroupName, createMutation],
  );

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h1>Student groups</h1>
        </div>
        <div className="card-body">
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {canEdit && (
            <form className="mb-4" onSubmit={handleCreateGroup}>
              <div className="row g-2 align-items-center">
                <div className="col-auto">
                  <Form.Control
                    type="text"
                    placeholder="New group name"
                    value={newGroupName}
                    disabled={createMutation.isPending}
                    onChange={(e) => setNewGroupName((e.target as HTMLInputElement).value)}
                  />
                </div>
                <div className="col-auto">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!newGroupName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin me-1" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus me-1" />
                        Create group
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {groups.length === 0 ? (
            <p className="text-muted mb-0">
              No student groups have been created yet.
              {canEdit && ' Use the form above to create your first group.'}
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Students</th>
                    {canEdit && <th style={{ width: '100px' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <EditableGroupName group={group} csrfToken={csrfToken} canEdit={canEdit} />
                      </td>
                      <td>
                        {group.student_count > 0 ? (
                          <a href={`${studentsPageUrl}?student_groups=${group.id}`}>
                            {group.student_count} student{group.student_count !== 1 ? 's' : ''}
                          </a>
                        ) : (
                          <span className="text-muted">0 students</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeleteModalGroup(group)}
                          >
                            <i className="fas fa-trash" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal show={deleteModalGroup !== null} onHide={() => setDeleteModalGroup(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete student group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to delete the group <strong>{deleteModalGroup?.name}</strong>?
          </p>
          {(deleteModalGroup?.student_count ?? 0) > 0 && (
            <Alert variant="warning">
              This group has {deleteModalGroup?.student_count} student
              {deleteModalGroup?.student_count !== 1 ? 's' : ''}. They will be removed from this
              group.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteModalGroup(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteModalGroup && deleteMutation.mutate(deleteModalGroup.id)}
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

export function InstructorInstanceAdminStudentGroups(props: StudentGroupsPageProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
      <StudentGroupsCard {...props} />
    </QueryClientProviderDebug>
  );
}

InstructorInstanceAdminStudentGroups.displayName = 'InstructorInstanceAdminStudentGroups';
