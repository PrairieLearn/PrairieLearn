import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, Button, Form, InputGroup, Modal } from 'react-bootstrap';
import { z } from 'zod';

import { AssessmentInstanceScoreResultSchema } from '../instructorGradebook.types.js';

interface EditScoreButtonProps {
  assessmentInstanceId: string;
  currentScore: number;
  otherUsers: string[];
  csrfToken: string;
}

export function EditScoreButton({
  assessmentInstanceId,
  currentScore,
  otherUsers,
  csrfToken,
}: EditScoreButtonProps) {
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
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
      await queryClient.invalidateQueries({ queryKey: ['gradebook'] });
      setScoreInput(currentScore.toString());
      setShow(false);
    },
  });

  const handleOpen = () => {
    setScoreInput(currentScore.toString());
    setShow(true);
  };

  const handleClose = () => {
    setScoreInput(currentScore.toString());
    setShow(false);
  };

  return (
    <>
      <button
        type="button"
        class="btn btn-xs btn-ghost edit-score ms-1"
        aria-label="Edit score"
        onClick={handleOpen}
      >
        <i class="bi-pencil-square" aria-hidden="true" />
      </button>
      {show && (
        <Modal show={true} onHide={handleClose}>
          <Modal.Header closeButton>
            <Modal.Title>Change total percentage score</Modal.Title>
          </Modal.Header>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              editScoreMutation.mutate(scoreInput);
            }}
          >
            <Modal.Body>
              <Form.Group class="mb-3">
                <InputGroup>
                  <Form.Control
                    type="text"
                    value={scoreInput}
                    aria-label="Score percentage"
                    disabled={editScoreMutation.isPending}
                    onChange={(e) => setScoreInput(e.currentTarget.value)}
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
                <Alert
                  variant="danger"
                  class="mb-2"
                  dismissible
                  onClose={() => editScoreMutation.reset()}
                >
                  {editScoreMutation.error.message}
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                disabled={editScoreMutation.isPending}
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editScoreMutation.isPending}>
                {editScoreMutation.isPending ? 'Saving...' : 'Change'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      )}
    </>
  );
}
