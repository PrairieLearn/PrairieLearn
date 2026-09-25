import { Modal } from 'react-bootstrap';

import type { AssessmentInstanceActionTarget } from '../instructorAssessmentInstances.types.js';

import { TimeLimitEditForm } from './TimeLimitEditForm.js';

export function TimeLimitModal({
  target,
  show,
  timezone,
  onHide,
  onSuccess,
}: {
  target: AssessmentInstanceActionTarget;
  show: boolean;
  timezone: string;
  onHide: () => void;
  onSuccess: () => void;
}) {
  const singleRow = target.kind === 'single' ? target.instance : undefined;
  const rows = target.kind === 'single' ? [target.instance] : target.instances;
  const hasClosedInstance = rows.some((row) => !row.assessment_instance.open);
  const hasOpenInstance = rows.some((row) => row.assessment_instance.open);
  const hasTimeLimitInstance = rows.some(
    (row) => row.assessment_instance.open && row.time_remaining_sec != null,
  );

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>
          {target.kind === 'single' && hasClosedInstance ? 'Re-open instance' : 'Change time limit'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {show && (
          <TimeLimitEditForm
            mode={target.kind === 'single' ? 'single' : 'bulk'}
            assessmentInstanceIds={
              target.kind === 'all' ? null : rows.map((row) => row.assessment_instance.id)
            }
            targetDescription={
              target.kind === 'all'
                ? 'All instances'
                : `${rows.length} ${rows.length === 1 ? 'instance' : 'instances'} selected`
            }
            hasOpenInstance={hasOpenInstance}
            hasClosedInstance={hasClosedInstance}
            hasTimeLimitInstance={hasTimeLimitInstance}
            singleRow={
              singleRow
                ? {
                    open: singleRow.assessment_instance.open === true,
                    total_time: singleRow.total_time,
                    total_time_sec: singleRow.total_time_sec,
                    time_remaining: singleRow.time_remaining,
                    time_remaining_sec: singleRow.time_remaining_sec,
                    date:
                      singleRow.assessment_instance.date == null
                        ? ''
                        : new Date(singleRow.assessment_instance.date).toISOString(),
                  }
                : undefined
            }
            timezone={timezone}
            onCancel={onHide}
            onSuccess={onSuccess}
          />
        )}
      </Modal.Body>
    </Modal>
  );
}
