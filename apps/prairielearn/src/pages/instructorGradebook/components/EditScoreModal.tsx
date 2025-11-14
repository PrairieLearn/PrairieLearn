import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, Button, Form, InputGroup, Modal } from 'react-bootstrap';
import { z } from 'zod';

import { AssessmentInstanceScoreResultSchema } from '../instructorGradebook.types.js';

interface EditScoreModalProps {
  show: boolean;
  onHide: () => void;
  assessmentInstanceId: string;
  currentScore: number;
  otherUsers: string[];
  csrfToken: string;
}

export function EditScoreModal({
  show,
  onHide,
  assessmentInstanceId,
  currentScore,
  otherUsers,
  csrfToken,
}: EditScoreModalProps) {
  const queryClient = useQueryClient();
  const [scoreInput, setScoreInput] = useState(currentScore.toString());

  const editScoreMutation = useMutation({
    mutationKey: ['edit-score', assessmentInstanceId],
    mutationFn: async (scorePerc: string) => {
      const body = new URLSearchParams({
        __action: 'edit_total_score_perc',
        __csrf_token: csrfToken,
        assessment_instance_id: assessmentInstanceId,
        score_perc: scorePerc,
      });

      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
      });

      if (!res.ok) {
        throw new Error('Failed to update score');
      }

      const data = await res.json();
      return z.array(AssessmentInstanceScoreResultSchema).parse(data);
    },
    onSuccess: async () => {
      // Invalidate the gradebook query to refetch the data
      await queryClient.invalidateQueries({ queryKey: ['gradebook'] });
      onHide();
    },
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    editScoreMutation.mutate(scoreInput);
  };

  const handleClose = () => {
    setScoreInput(currentScore.toString());
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Change total percentage score</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Form.Group class="mb-3">
            <InputGroup>
              <Form.Control
                type="text"
                value={scoreInput}
                aria-label="Score percentage"
                disabled={editScoreMutation.isPending}
                onChange={(e) => {
                  if (e.target instanceof HTMLInputElement) {
                    setScoreInput(e.target.value);
                  }
                }}
              />
              <InputGroup.Text>%</InputGroup.Text>
            </InputGroup>
          </Form.Group>

          {otherUsers.length > 0 && (
            <Alert variant="info">
              <small>
                This is a group assessment. Updating this grade will also update grades for:
              </small>
              <ul class="mb-0">
                {otherUsers.map((uid) => (
                  <li key={uid}>
                    <small>{uid}</small>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <p class="text-muted">
            <small>
              This change will be overwritten if further questions are answered by the student.
            </small>
          </p>

          {editScoreMutation.isError && (
            <Alert variant="danger">
              {editScoreMutation.error instanceof Error
                ? editScoreMutation.error.message
                : 'Failed to update score'}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={editScoreMutation.isPending} onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={editScoreMutation.isPending}>
            {editScoreMutation.isPending ? 'Saving...' : 'Change'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
