import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { OverlayTrigger, useModalState } from '@prairielearn/ui';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import type { EditableCourse, SelectedAssessments } from '../instructorQuestionSettings.shared.js';

export interface QuestionSettingsCardFooterProps {
  canEdit: boolean;
  canCopy: boolean;
  editableCourses: EditableCourse[];
  courseId: string;
  qid: string;
  assessmentsWithQuestion: SelectedAssessments[];
  csrfToken: string;
}

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

interface DeleteQuestionModalData {
  qid: string;
  assessmentsWithQuestion: SelectedAssessments[];
}

function DeleteQuestionModal({
  data,
  csrfToken,
  show,
  onHide,
  onExited,
}: {
  data: DeleteQuestionModalData | null;
  csrfToken: string;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>Delete question</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {data && (
            <>
              <p>
                Are you sure you want to delete the question <strong>{data.qid}</strong>?
              </p>
              {data.assessmentsWithQuestion.length > 0 && (
                <>
                  <p>It is included by these assessments:</p>
                  <ul className="list-group my-4">
                    {data.assessmentsWithQuestion.map((aWithQ) => (
                      <li key={aWithQ.course_instance_id} className="list-group-item">
                        <div className="h6">
                          {aWithQ.short_name ?? <i>Unknown</i>} (
                          {aWithQ.long_name ?? <i>Unknown</i>})
                        </div>
                        {aWithQ.assessments.map((assessment) => (
                          <AssessmentBadge
                            key={assessment.assessment_id}
                            courseInstanceId={aWithQ.course_instance_id}
                            assessment={assessment}
                            className="btn"
                          />
                        ))}
                      </li>
                    ))}
                  </ul>
                  <p>
                    So, if you delete it, you will be unable to sync your course content to the
                    database until you either remove the question from these assessments or create a
                    new question with the same QID.
                  </p>
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="delete_question" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger">
            Delete
          </button>
        </Modal.Footer>
      </form>
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
}: QuestionSettingsCardFooterProps) {
  const [showCopyPopover, setShowCopyPopover] = useState(false);
  const deleteModalState = useModalState<DeleteQuestionModalData>(null);

  const handleCancelCopy = () => {
    setShowCopyPopover(false);
  };

  return (
    <div className="card-footer d-flex flex-wrap gap-2">
      {canCopy && (
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
                onCancel={handleCancelCopy}
              />
            ),
          }}
          onToggle={(nextShow) => setShowCopyPopover(nextShow)}
        >
          <button type="button" className="btn btn-sm btn-primary" id="copyQuestionButton">
            <i className="fa fa-clone" />
            <span> Make a copy of this question</span>
          </button>
        </OverlayTrigger>
      )}
      {canEdit && (
        <>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => deleteModalState.showWithData({ qid, assessmentsWithQuestion })}
          >
            <i className="fa fa-times" aria-hidden="true" /> Delete this question
          </button>
          <DeleteQuestionModal {...deleteModalState} csrfToken={csrfToken} />
        </>
      )}
    </div>
  );
}

QuestionSettingsCardFooter.displayName = 'QuestionSettingsCardFooter';
