import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { OverlayTrigger, useModalState } from '@prairielearn/ui';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import type { EditableCourse, SelectedAssessments } from '../instructorQuestionSettings.types.js';

function CopyQuestionPopover({
  editableCourses,
  courseId,
  csrfToken,
  onCancel,
}: {
  editableCourses: EditableCourse[];
  courseId: string;
  csrfToken: string;
  onCancel: () => void;
}) {
  return (
    <form name="copy-question-form" method="POST">
      <input type="hidden" name="__action" value="copy_question" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <div className="mb-3">
        <label className="form-label" htmlFor="to-course-id-select">
          The copied question will be added to the following course:
        </label>
        <select
          className="form-select"
          id="to-course-id-select"
          name="to_course_id"
          defaultValue={courseId}
          required
        >
          {editableCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short_name}
            </option>
          ))}
        </select>
      </div>
      <div className="text-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary ms-2">
          Submit
        </button>
      </div>
    </form>
  );
}

function DeleteQuestionModal({
  qid,
  assessmentsWithQuestion,
  csrfToken,
  show,
  onHide,
  onExited,
}: {
  qid: string;
  assessmentsWithQuestion: SelectedAssessments[];
  csrfToken: string;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Delete question</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete the question <strong>{qid}</strong>?
        </p>
        {assessmentsWithQuestion.length > 0 && (
          <>
            <p>It is included by these assessments:</p>
            <ul className="list-group my-4">
              {assessmentsWithQuestion.map((aWithQ) => (
                <li key={aWithQ.course_instance_id} className="list-group-item">
                  <div className="h6">
                    {aWithQ.short_name} ({aWithQ.long_name ?? <i>Unknown</i>})
                  </div>
                  {aWithQ.assessments.map((assessment) => (
                    <AssessmentBadge
                      key={assessment.assessment_id}
                      courseInstanceId={aWithQ.course_instance_id}
                      assessment={assessment}
                    />
                  ))}
                </li>
              ))}
            </ul>
            <p>
              So, if you delete it, you will be unable to sync your course content to the database
              until you either remove the question from these assessments or create a new question
              with the same QID.
            </p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <form method="POST">
          <input type="hidden" name="__action" value="delete_question" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary me-2" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger">
            Delete
          </button>
        </form>
      </Modal.Footer>
    </Modal>
  );
}

export function QuestionSettingsCardFooter({
  canEdit,
  canCopy,
  editableCourses,
  courseId,
  qid,
  assessmentsWithQuestion,
  csrfToken,
  questionGHLink,
}: {
  canEdit: boolean;
  canCopy: boolean;
  editableCourses: EditableCourse[];
  courseId: string;
  qid: string;
  assessmentsWithQuestion: SelectedAssessments[];
  csrfToken: string;
  questionGHLink: string | null;
}) {
  const [showCopyPopover, setShowCopyPopover] = useState(false);
  const deleteModalState = useModalState();

  if (!questionGHLink && !canCopy && !canEdit) return null;

  const rows: { key: string; node: React.ReactNode }[] = [];

  if (questionGHLink) {
    rows.push({
      key: 'github',
      node: (
        <>
          <div>
            <div className="fw-semibold">View source on GitHub</div>
            <div className="text-muted small">
              Open this question's source files in the course's repository.
            </div>
          </div>
          <a
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2 ms-3"
            target="_blank"
            rel="noreferrer"
            aria-label="View on GitHub"
            href={questionGHLink}
          >
            <i className="bi bi-github" aria-hidden="true" />
            View on GitHub
          </a>
        </>
      ),
    });
  }

  if (canCopy) {
    rows.push({
      key: 'copy',
      node: (
        <>
          <div>
            <div className="fw-semibold">Make a copy of this question</div>
            <div className="text-muted small">
              Create a duplicate of this question to use as a starting point.
            </div>
          </div>
          <OverlayTrigger
            trigger="click"
            placement="auto"
            show={showCopyPopover}
            popover={{
              props: { id: 'copyQuestionPopover' },
              header: 'Copy this question',
              body: (
                <CopyQuestionPopover
                  editableCourses={editableCourses}
                  courseId={courseId}
                  csrfToken={csrfToken}
                  onCancel={() => setShowCopyPopover(false)}
                />
              ),
            }}
            onToggle={setShowCopyPopover}
          >
            <button
              type="button"
              className="btn btn-sm btn-outline-primary ms-3"
              id="copyQuestionButton"
            >
              <i className="bi bi-copy me-1" aria-hidden="true" /> Make a copy
            </button>
          </OverlayTrigger>
        </>
      ),
    });
  }

  if (canEdit) {
    rows.push({
      key: 'delete',
      node: (
        <>
          <div>
            <div className="fw-semibold">Delete this question</div>
            <div className="text-muted small">Permanently remove this question.</div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger ms-3"
            onClick={() => deleteModalState.showWithData(null)}
          >
            <i className="bi bi-trash me-1" aria-hidden="true" /> Delete
          </button>
        </>
      ),
    });
  }

  return (
    <div className="card">
      <div className="card-body p-0">
        <h2 className="h5 card-title mb-0 px-3 py-3">Manage question</h2>
        {rows.map((row, index) => (
          <div
            key={row.key}
            className={clsx(
              'd-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-3',
              index > 0 && 'border-top',
            )}
          >
            {row.node}
          </div>
        ))}
      </div>
      {canEdit && (
        <DeleteQuestionModal
          qid={qid}
          assessmentsWithQuestion={assessmentsWithQuestion}
          csrfToken={csrfToken}
          show={deleteModalState.show}
          onHide={deleteModalState.hide}
          onExited={deleteModalState.onExited}
        />
      )}
    </div>
  );
}

QuestionSettingsCardFooter.displayName = 'QuestionSettingsCardFooter';
