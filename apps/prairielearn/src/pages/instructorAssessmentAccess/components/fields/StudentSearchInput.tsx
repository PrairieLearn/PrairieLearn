import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, ListGroup, Spinner, Tab, Tabs } from 'react-bootstrap';

import { useTRPCClient } from '../../utils/trpc-context.js';
import type { IndividualTarget } from '../types.js';

interface StudentSearchInputProps {
  excludedUids: Set<string>;
  onSelect: (students: IndividualTarget[]) => void;
  onClose: () => void;
}

export function StudentSearchInput({ excludedUids, onSelect, onClose }: StudentSearchInputProps) {
  const trpcClient = useTRPCClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [uidInput, setUidInput] = useState('');
  const [validatedUids, setValidatedUids] = useState<
    { id: string | null; uid: string; name: string | null; enrolled: boolean; notFound: boolean }[]
  >([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(() => new Set());

  const { data: allStudents, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['all-students'],
    queryFn: () => trpcClient.students.query(),
  });

  const validateMutation = useMutation({
    mutationFn: (uids: string[]) => trpcClient.validateUids.query({ uids }),
    onSuccess: (results) => {
      setValidatedUids(results);
    },
  });

  const filteredStudents = useMemo(() => {
    if (!allStudents) return [];
    return allStudents.filter((student) => {
      if (excludedUids.has(student.uid)) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        student.uid.toLowerCase().includes(query) ||
        (student.name?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [allStudents, excludedUids, searchQuery]);

  const parseUids = useCallback((input: string) => {
    return input
      .split(/[,\s\n]+/)
      .map((uid) => uid.trim())
      .filter((uid) => uid.length > 0);
  }, []);

  const handleValidate = () => {
    const uids = parseUids(uidInput);
    if (uids.length > 0) {
      validateMutation.mutate(uids);
    }
  };

  const handleAddValidated = () => {
    const validStudents = validatedUids
      .filter((r) => r.id && r.enrolled && !excludedUids.has(r.uid))
      .map((r) => ({
        enrollmentId: r.id ?? undefined,
        uid: r.uid,
        name: r.name,
      }));
    if (validStudents.length > 0) {
      onSelect(validStudents);
      setUidInput('');
      setValidatedUids([]);
      onClose();
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedStudents((prev) => {
      const newSet = new Set(prev);
      for (const student of filteredStudents) {
        newSet.add(student.id);
      }
      return newSet;
    });
  };

  const handleClearSelection = () => {
    setSelectedStudents(new Set());
  };

  const handleAddSelected = () => {
    if (!allStudents) return;
    const studentsToAdd = allStudents
      .filter((s) => selectedStudents.has(s.id) && !excludedUids.has(s.uid))
      .map((s) => ({
        enrollmentId: s.id,
        uid: s.uid,
        name: s.name,
      }));
    if (studentsToAdd.length > 0) {
      onSelect(studentsToAdd);
      setSelectedStudents(new Set());
      onClose();
    }
  };

  const validCount = validatedUids.filter(
    (r) => r.id && r.enrolled && !excludedUids.has(r.uid),
  ).length;

  const selectedCount = allStudents
    ? allStudents.filter((s) => selectedStudents.has(s.id) && !excludedUids.has(s.uid)).length
    : 0;

  return (
    <div style={{ width: '350px' }}>
      <Tabs className="mb-2" defaultActiveKey="search" fill>
        <Tab eventKey="search" title="Search">
          <Form.Control
            className="mb-2"
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
                  <>
                    <Button variant="outline-secondary" size="sm" onClick={handleClearSelection}>
                      Clear
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleAddSelected}>
                      Add {selectedCount} student{selectedCount !== 1 ? 's' : ''}
                    </Button>
                  </>
                )}
              </div>
              <ListGroup style={{ maxHeight: '200px', overflow: 'auto' }}>
                {filteredStudents.map((student) => (
                  <ListGroup.Item
                    key={student.id}
                    className="py-2 d-flex align-items-center"
                    action
                    onClick={() => handleToggleStudent(student.id)}
                  >
                    <Form.Check
                      className="me-2"
                      type="checkbox"
                      checked={selectedStudents.has(student.id)}
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
            placeholder="Paste UIDs (comma, space, or newline separated)"
            rows={3}
            value={uidInput}
            onChange={({ currentTarget }) => {
              setUidInput(currentTarget.value);
              setValidatedUids([]);
            }}
          />

          <div className="d-flex gap-2 mb-2">
            <Button
              disabled={parseUids(uidInput).length === 0 || validateMutation.isPending}
              size="sm"
              variant="outline-primary"
              onClick={handleValidate}
            >
              {validateMutation.isPending ? 'Validating...' : 'Validate'}
            </Button>
            {validatedUids.length > 0 && (
              <Button
                disabled={validCount === 0}
                size="sm"
                variant="primary"
                onClick={handleAddValidated}
              >
                Add {validCount} student{validCount !== 1 ? 's' : ''}
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
                  ) : excludedUids.has(result.uid) ? (
                    <Badge bg="secondary">Already added</Badge>
                  ) : (
                    <Badge bg="success">Valid</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tab>
      </Tabs>
    </div>
  );
}
