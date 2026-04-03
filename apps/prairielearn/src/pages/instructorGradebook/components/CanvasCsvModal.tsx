import { useEffect, useMemo, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';

import { downloadAsCSV } from '@prairielearn/browser-utils';

import type { CourseAssessmentRow, GradebookRow } from '../instructorGradebook.types.js';

type ScoreFormat = 'percentage' | 'points_original';

interface AssessmentGroup {
  setId: string;
  heading: string;
  assessments: CourseAssessmentRow[];
}

function AssessmentGroupCheckbox({
  group,
  selectedIds,
  onToggleGroup,
  onToggleAssessment,
}: {
  group: AssessmentGroup;
  selectedIds: Set<string>;
  onToggleGroup: (setId: string, selected: boolean) => void;
  onToggleAssessment: (assessmentId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const allSelected = group.assessments.every((a) => selectedIds.has(a.assessment_id.toString()));
  const someSelected =
    !allSelected && group.assessments.some((a) => selectedIds.has(a.assessment_id.toString()));

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div className="d-flex flex-column">
      <div className="px-2 py-1 d-flex align-items-center">
        <input
          ref={checkboxRef}
          type="checkbox"
          className="form-check-input flex-shrink-0"
          checked={allSelected}
          aria-label={`Toggle all assessments in '${group.heading}'`}
          onChange={() => onToggleGroup(group.setId, !allSelected)}
        />
        <button
          type="button"
          className="btn btn-link text-decoration-none text-reset w-100 text-start d-flex align-items-center justify-content-between ps-2 py-0 pe-0"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="fw-bold text-truncate">{group.heading}</span>
          <i
            className={`bi ms-2 text-muted ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {isExpanded && (
        <div className="ps-3 border-start ms-3 mb-1">
          {group.assessments.map((assessment) => {
            const id = assessment.assessment_id.toString();
            return (
              <div key={id} className="px-2 py-1">
                <label className="form-check d-flex align-items-stretch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selectedIds.has(id)}
                    aria-label={`Include '${assessment.label}' in export`}
                    onChange={() => onToggleAssessment(id)}
                  />
                  <span className="form-check-label ms-2">{assessment.label}</span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CanvasCsvModalProps {
  show: boolean;
  onHide: () => void;
  courseAssessments: CourseAssessmentRow[];
  rows: GradebookRow[];
  filename: string;
}

export function CanvasCsvModal({ show, ...rest }: CanvasCsvModalProps) {
  return (
    <Modal show={show} size="lg" onHide={rest.onHide}>
      {show && <CanvasCsvModalContent {...rest} />}
    </Modal>
  );
}

function CanvasCsvModalContent({
  onHide,
  courseAssessments,
  rows,
  filename,
}: Omit<CanvasCsvModalProps, 'show'>) {
  const allAssessmentIds = useMemo(
    () => new Set(courseAssessments.map((a) => a.assessment_id.toString())),
    [courseAssessments],
  );

  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<Set<string>>(
    () => new Set(allAssessmentIds),
  );
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>('percentage');

  const assessmentGroups = useMemo(() => {
    const groups = new Map<string, AssessmentGroup>();
    for (const assessment of courseAssessments) {
      const setId = assessment.assessment_set_id.toString();
      const existing = groups.get(setId);
      if (existing) {
        existing.assessments.push(assessment);
      } else {
        groups.set(setId, {
          setId,
          heading: assessment.assessment_set_heading,
          assessments: [assessment],
        });
      }
    }
    return Array.from(groups.values());
  }, [courseAssessments]);

  const handleToggleGroup = (setId: string, selected: boolean) => {
    setSelectedAssessmentIds((prev) => {
      const next = new Set(prev);
      const group = assessmentGroups.find((g) => g.setId === setId);
      if (!group) return prev;
      for (const a of group.assessments) {
        const id = a.assessment_id.toString();
        if (selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const handleToggleAssessment = (assessmentId: string) => {
    setSelectedAssessmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(assessmentId)) {
        next.delete(assessmentId);
      } else {
        next.add(assessmentId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedAssessmentIds(new Set(allAssessmentIds));
  };

  const handleSelectNone = () => {
    setSelectedAssessmentIds(new Set());
  };

  const selectedAssessments = useMemo(
    () => courseAssessments.filter((a) => selectedAssessmentIds.has(a.assessment_id.toString())),
    [courseAssessments, selectedAssessmentIds],
  );

  const handleDownload = () => {
    const validRows = rows.filter((row) => row.role === 'Student' && row.user_name != null);
    const header = [
      'Student',
      'ID',
      'SIS User ID',
      'SIS Login ID',
      'Section',
      ...selectedAssessments.map(
        (a) => `${a.assessment_set_heading} ${a.assessment_number}`,
      ),
    ];

    const pointsPossibleRow = [
      '    Points Possible',
      null,
      null,
      null,
      null,
      ...selectedAssessments.map((a) => {
        switch (scoreFormat) {
          case 'percentage':
            return 100;
          case 'points_original':
            return a.max_points;
        }
      }),
    ];

    const data = [
      pointsPossibleRow,
      ...validRows.map((row) => [
        row.user_name,
        null,
        null,
        row.uid,
        null,
        ...selectedAssessments.map((a) => {
          const scoreData = row.scores[a.assessment_id];
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!scoreData) return null;

          switch (scoreFormat) {
            case 'percentage':
              return scoreData.score_perc ?? null;
            case 'points_original':
              return scoreData.points ?? null;
          }
        }),
      ]),
    ];

    downloadAsCSV(header, data, filename);
    onHide();
  };

  return (
    <>
      <Modal.Header closeButton>
        <Modal.Title>Export Canvas CSV</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h6>Assessments to include</h6>
        <div className="mb-2 d-flex gap-2">
          <Button variant="link" size="sm" className="p-0" onClick={handleSelectAll}>
            Select all
          </Button>
          <Button variant="link" size="sm" className="p-0" onClick={handleSelectNone}>
            Select none
          </Button>
        </div>
        <div className="border rounded mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {assessmentGroups.map((group) => (
            <AssessmentGroupCheckbox
              key={group.setId}
              group={group}
              selectedIds={selectedAssessmentIds}
              onToggleGroup={handleToggleGroup}
              onToggleAssessment={handleToggleAssessment}
            />
          ))}
        </div>

        <h6>Score format</h6>
        <Form.Check
          type="radio"
          id="score-format-percentage"
          name="scoreFormat"
          label="Percentage score (0–100)"
          checked={scoreFormat === 'percentage'}
          onChange={() => setScoreFormat('percentage')}
        />
        <Form.Check
          type="radio"
          id="score-format-points-original"
          name="scoreFormat"
          label="Original point values"
          checked={scoreFormat === 'points_original'}
          onChange={() => setScoreFormat('points_original')}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={selectedAssessmentIds.size === 0}
          onClick={handleDownload}
        >
          Download CSV
        </Button>
      </Modal.Footer>
    </>
  );
}
