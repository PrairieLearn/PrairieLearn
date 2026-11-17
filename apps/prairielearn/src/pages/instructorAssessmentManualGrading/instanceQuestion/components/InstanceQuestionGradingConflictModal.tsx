import { useState } from 'react';
import { Alert, Card, Col, Modal, Row } from 'react-bootstrap';

import { InstanceQuestionGradingPanel } from './InstanceQuestionGradingPanel.js';
import type { InstanceQuestionGradingPanelProps } from './InstanceQuestionGradingPanel.types.js';

interface ConflictGrade {
  gradedAt: string | null;
  graderName: string;
  gradingPanelData: InstanceQuestionGradingPanelProps;
}

export interface InstanceQuestionGradingConflictModalProps {
  conflictingGrade: ConflictGrade;
  existingGrade: ConflictGrade;
}

function GradeMetadata({ gradedAt, graderName }: Pick<ConflictGrade, 'gradedAt' | 'graderName'>) {
  return (
    <div className="mb-2">
      {gradedAt ? `${gradedAt}, ` : ''}by {graderName}
    </div>
  );
}

export function InstanceQuestionGradingConflictModal({
  conflictingGrade,
  existingGrade,
}: InstanceQuestionGradingConflictModalProps) {
  // Open the modal immediately when the component is mounted (i.e. when the page loads).
  const [show, setShow] = useState(true);

  return (
    <Modal
      show={show}
      size="xl"
      aria-labelledby="grading-conflict-modal-title"
      onHide={() => setShow(false)}
    >
      <Modal.Header className="bg-danger text-light" closeVariant="white" closeButton>
        <Modal.Title id="grading-conflict-modal-title">Grading conflict identified</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="danger">
          The submission you have just graded has already been graded by {existingGrade.graderName}.
          Your score and feedback have not been applied. Please review the feedback below and select
          how you would like to proceed.
        </Alert>
        <Row className="mb-2">
          <Col xs={12} lg={6}>
            <div>
              <strong>Existing score and feedback</strong>
            </div>
            <GradeMetadata
              gradedAt={existingGrade.gradedAt}
              graderName={existingGrade.graderName}
            />
            <Card>
              <InstanceQuestionGradingPanel data={existingGrade.gradingPanelData} />
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <div>
              <strong>Conflicting score and feedback</strong>
            </div>
            <GradeMetadata
              gradedAt={conflictingGrade.gradedAt}
              graderName={conflictingGrade.graderName}
            />
            <Card>
              <InstanceQuestionGradingPanel data={conflictingGrade.gradingPanelData} />
            </Card>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>
  );
}

InstanceQuestionGradingConflictModal.displayName = 'InstanceQuestionGradingConflictModal';
