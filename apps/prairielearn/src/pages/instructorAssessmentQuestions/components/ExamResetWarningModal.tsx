import { Modal } from 'react-bootstrap';

export function ExamResetWarningModal({
  show,
  onHide,
}: {
  show: boolean;
  onHide: () => void;
}) {
  return (
    <Modal show={show} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Reset Question Variants Not Supported</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="alert alert-warning" role="alert">
          <strong>This feature is not currently supported for Exam assessments.</strong>
        </div>
        <p>
          Resetting question variants on Exam assessments can cause problems:
        </p>
        <ul>
          <li>
            <strong>Instance questions may become unopenable:</strong> If students have already 
            exhausted all their attempts, they may encounter "instance question is not open" 
            errors when trying to view the question.
          </li>
          <li>
            <strong>Inconsistent attempt counts:</strong> Students may face new variants but 
            with fewer attempts than expected, since attempt counts are tied to instance 
            questions rather than individual variants.
          </li>
          <li>
            <strong>Confusing score history:</strong> The relationship between scores and 
            attempt history may become unclear to both students and instructors.
          </li>
        </ul>
        <p>
          If you need to address issues with question variants in an Exam assessment, 
          please consider alternative approaches or contact support for guidance.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-primary" onClick={onHide}>
          Understood
        </button>
      </Modal.Footer>
    </Modal>
  );
}