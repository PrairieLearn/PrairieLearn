import { useMemo, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import { downloadAsCSV } from '@prairielearn/browser-utils';
import { ExpandableCheckboxGroup, Radio, RadioGroup } from '@prairielearn/ui';

import {
  CANVAS_CSV_FIXED_HEADERS,
  CANVAS_CSV_POINTS_POSSIBLE_NAME,
  canvasPointsPossibleValue,
} from '../../../lib/canvas-csv.js';
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
  const allSelected = group.assessments.every((a) => selectedIds.has(a.assessment_id.toString()));
  const someSelected =
    !allSelected && group.assessments.some((a) => selectedIds.has(a.assessment_id.toString()));

  return (
    <ExpandableCheckboxGroup
      label={group.heading}
      checked={allSelected}
      indeterminate={someSelected}
      aria-label={`Toggle all assessments in '${group.heading}'`}
      onToggle={() => onToggleGroup(group.setId, !allSelected)}
    >
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
    </ExpandableCheckboxGroup>
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
      ...CANVAS_CSV_FIXED_HEADERS,
      ...selectedAssessments.map((a) => `${a.assessment_set_name} ${a.assessment_number}`),
    ];

    const canvasFormat = scoreFormat === 'percentage' ? 'percentage' : 'points';
    const pointsPossibleRow = [
      CANVAS_CSV_POINTS_POSSIBLE_NAME,
      null,
      null,
      null,
      null,
      ...selectedAssessments.map((a) => {
        if (scoreFormat === 'percentage') return canvasPointsPossibleValue(canvasFormat, null);

        if (a.max_points != null) return canvasPointsPossibleValue(canvasFormat, a.max_points);
        // The assessment-level max_points is null for assessments whose
        // max points are computed dynamically (e.g., Exams with randomized
        // zones). Fall back to the instance-level max_points from the
        // first student who has a score for this assessment.

        const scoreWithMax = validRows.find(
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          (r) => r.scores[a.assessment_id]?.max_points != null,
        );

        return canvasPointsPossibleValue(
          canvasFormat,
          scoreWithMax?.scores[a.assessment_id]?.max_points ?? null,
        );
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
        <p className="text-muted small">Only users with the Student role are included.</p>
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
        <RadioGroup value={scoreFormat} onChange={setScoreFormat}>
          <Radio value="percentage">Percentage score (0–100)</Radio>
          <Radio value="points_original">Original point values</Radio>
        </RadioGroup>
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
