import { describe, expect, it } from 'vitest';

import { getUpcomingStudentAssessments, type StudentAssessmentRow } from './student-assessments.js';

function makeAssessmentRow({
  assessmentId,
  deadline,
  instanceId,
}: {
  assessmentId: string;
  deadline: Date;
  instanceId: string | null;
}): StudentAssessmentRow {
  return {
    assessment_id: assessmentId,
    multiple_instance_header: false,
    assessment_number: '1',
    title: `Assessment ${assessmentId}`,
    team_work: false,
    modern_access_control: true,
    assessment_set_name: 'Homework',
    assessment_set_color: 'green1',
    label: `HW${assessmentId}`,
    assessment_instance_id: instanceId,
    assessment_instance_score_perc: null,
    assessment_instance_open: instanceId == null ? null : true,
    assessment_instance_date_limit: null,
    link:
      instanceId == null ? `/assessment/${assessmentId}/` : `/assessment_instance/${instanceId}/`,
    assessment_group_id: '1',
    assessment_group_heading: 'Homework',
    authz_result: {
      access_rules: [],
      access_timeline: [],
      active: true,
      authorized: true,
      credit: 100,
      credit_end_date: deadline,
      credit_date_string: '100%',
      exam_access_end: null,
      mode: null,
      next_active_time: null,
      password: null,
      show_before_release: false,
      show_closed_assessment: true,
      show_closed_assessment_score: true,
      time_limit_min: null,
    },
  };
}

describe('getUpcomingStudentAssessments', () => {
  it('includes started and unstarted assessments ending today or tomorrow', () => {
    const reqDate = new Date('2025-03-15T12:00:00Z');
    const rows = [
      makeAssessmentRow({
        assessmentId: '1',
        deadline: new Date('2025-03-15T22:00:00Z'),
        instanceId: null,
      }),
      makeAssessmentRow({
        assessmentId: '2',
        deadline: new Date('2025-03-16T22:00:00Z'),
        instanceId: '20',
      }),
      makeAssessmentRow({
        assessmentId: '3',
        deadline: new Date('2025-03-17T22:00:00Z'),
        instanceId: null,
      }),
    ];

    const upcoming = getUpcomingStudentAssessments(rows, reqDate, 'America/Chicago');

    expect(upcoming.map(({ assessment_id, status }) => ({ assessment_id, status }))).toEqual([
      { assessment_id: '1', status: 'Not started' },
      { assessment_id: '2', status: 'In progress' },
    ]);
  });
});
