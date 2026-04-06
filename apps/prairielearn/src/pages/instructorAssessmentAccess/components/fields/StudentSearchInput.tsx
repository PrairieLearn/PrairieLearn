import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, ListGroup, Spinner, Tab, Tabs } from 'react-bootstrap';

import { parseUniqueValuesFromString } from '../../../../lib/string-util.js';
import { useTRPC, useTRPCClient } from '../../../../trpc/assessment/context.js';
import type { EnrollmentTarget } from '../types.js';

export function StudentSearchInput({
  initialSelectedUids,
  onSave,
  onClose,
}: {
  initialSelectedUids: Set<string>;
  onSave: (students: EnrollmentTarget[]) => void;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [uidInput, setUidInput] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set(initialSelectedUids));

  const { data: allStudents, isLoading: isLoadingStudents } = useQuery(
    trpc.accessControl.students.queryOptions(),
  );

  const validateMutation = useMutation({
    mutationFn: (uids: string[]) => trpcClient.accessControl.validateUids.query({ uids }),
  });

  const validatedUids = validateMutation.data ?? [];

  const filteredStudents = useMemo(() => {
    if (!allStudents) return [];
    return allStudents.filter((student) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        student.uid.toLowerCase().includes(query) ||
        (student.name?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [allStudents, searchQuery]);

  const handleValidate = () => {
    const uids = parseUniqueValuesFromString(uidInput, 500);
    if (uids.length > 0) {
      validateMutation.mutate(uids);
    }
  };

  const handleAddValidated = () => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      for (const r of validatedUids) {
        if (r.id && r.enrolled) newSet.add(r.uid);
      }
      return newSet;
    });
    setUidInput('');
    validateMutation.reset();
  };

  const handleToggleStudent = (uid: string) => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        newSet.add(uid);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      for (const student of filteredStudents) {
        newSet.add(student.uid);
      }
      return newSet;
    });
  };

  const handleClearSelection = () => {
    setSelectedUids(new Set());
  };

  const handleSave = () => {
    if (!allStudents) return;
    const selected = allStudents
      .filter((s) => selectedUids.has(s.uid))
      .map((s) => ({ enrollmentId: s.id, uid: s.uid, name: s.name }));
    onSave(selected);
    onClose();
  };

  const newValidCount = validatedUids.filter(
    (r) => r.id && r.enrolled && !selectedUids.has(r.uid),
  ).length;

  const selectedCount = selectedUids.size;

  return (
    <div>
      <Tabs className="mb-2" defaultActiveKey="search" fill>
        <Tab eventKey="search" title="Search">
          <Form.Control
            className="mb-2"
            aria-label="Filter students by name or UID"
            placeholder="Filter by name or UID..."
            type="text"
            value={searchQuery}
            onChange={({ currentTarget }) => setSearchQuery(currentTarget.value)}
          />

          {isLoadingStudents ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-muted text-center py-2">
              {allStudents?.length === 0 ? 'No students enrolled' : 'No matching students'}
            </div>
          ) : (
            <>
              <div className="d-flex gap-2 mb-2">
                <Button variant="outline-secondary" size="sm" onClick={handleSelectAll}>
                  Select all
                </Button>
                {selectedCount > 0 && (
                  <Button variant="outline-secondary" size="sm" onClick={handleClearSelection}>
                    Clear
                  </Button>
                )}
              </div>
              <ListGroup style={{ maxHeight: '350px', overflow: 'auto' }}>
                {filteredStudents.map((student) => (
                  <ListGroup.Item
                    key={student.id}
                    className="py-2 d-flex align-items-center"
                    aria-selected={selectedUids.has(student.uid)}
                    action
                    onClick={() => handleToggleStudent(student.uid)}
                  >
                    <Form.Check
                      className="me-2"
                      type="checkbox"
                      checked={selectedUids.has(student.uid)}
                      tabIndex={-1}
                      aria-hidden="true"
                      readOnly
                    />
                    <div className="flex-grow-1">
                      <div>{student.name ?? student.uid}</div>
                      {student.name && <small className="text-muted">{student.uid}</small>}
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </>
          )}
        </Tab>

        <Tab eventKey="paste" title="Paste UIDs">
          <Form.Control
            as="textarea"
            className="mb-2"
            aria-label="Paste UIDs (comma, space, or newline separated)"
            placeholder="Paste UIDs (comma, space, or newline separated)"
            rows={3}
            value={uidInput}
            onChange={({ currentTarget }) => {
              setUidInput(currentTarget.value);
              validateMutation.reset();
            }}
          />

          <div className="d-flex gap-2 mb-2">
            <Button
              disabled={uidInput.trim().length === 0 || validateMutation.isPending}
              size="sm"
              variant="outline-primary"
              onClick={handleValidate}
            >
              {validateMutation.isPending ? 'Validating...' : 'Validate'}
            </Button>
            {validatedUids.length > 0 && (
              <Button
                disabled={newValidCount === 0}
                size="sm"
                variant="primary"
                onClick={handleAddValidated}
              >
                Add {newValidCount} to selection
              </Button>
            )}
          </div>

          {validateMutation.isError && (
            <Alert className="py-2 small" variant="danger">
              {validateMutation.error.message}
            </Alert>
          )}

          {validatedUids.length > 0 && (
            <div style={{ maxHeight: '150px', overflow: 'auto' }}>
              {validatedUids.map((result) => (
                <div
                  key={result.uid}
                  className="d-flex justify-content-between align-items-center py-1 border-bottom"
                >
                  <span className="small">{result.uid}</span>
                  {result.notFound ? (
                    <Badge bg="danger">Not found</Badge>
                  ) : !result.enrolled ? (
                    <Badge bg="warning">Not enrolled</Badge>
                  ) : selectedUids.has(result.uid) ? (
                    <Badge bg="secondary">Already selected</Badge>
                  ) : (
                    <Badge bg="success">Valid</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tab>
      </Tabs>

      <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Done{selectedCount > 0 ? ` (${selectedCount} selected)` : ''}
        </Button>
      </div>
    </div>
  );
}
