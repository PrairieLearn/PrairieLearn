import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

import { assertNever } from '@prairielearn/utils';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../../components/AssessmentQuestions.js';
import { HistMini } from '../../../components/HistMini.js';
import { IssueBadge } from '../../../components/IssueBadge.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import { TagBadgeList } from '../../../components/TagBadge.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import { idsEqual } from '../../../lib/id.js';

import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

function Title({
  questionRow,
  hasCoursePermissionPreview,
  urlPrefix,
}: {
  questionRow: StaffAssessmentQuestionRow;
  hasCoursePermissionPreview: boolean;
  urlPrefix: string;
}) {
  const { question, assessment_question, alternative_group, alternative_group_size } = questionRow;
  const title = (
    <>
      <AssessmentQuestionNumber
        alternativeGroupSize={alternative_group_size}
        alternativeGroupNumber={alternative_group.number}
        numberInAlternativeGroup={assessment_question.number_in_alternative_group}
      />
      {question.title}
    </>
  );
  if (hasCoursePermissionPreview) {
    return <a href={`${urlPrefix}/question/${question.id}/`}>{title}</a>;
  }
  return title;
}

export function InstructorAssessmentQuestionsTableLegacy({
  course,
  questionRows,
  urlPrefix,
  assessmentType,
  assessmentSetName,
  assessmentNumber,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  csrfToken,
}: {
  course: StaffCourse;
  questionRows: StaffAssessmentQuestionRow[];
  assessmentType: 'Homework' | 'Exam';
  assessmentSetName: string;
  assessmentNumber: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  csrfToken: string;
}) {
  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = questionRows.some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );

  const nTableCols = showAdvanceScorePercCol ? 12 : 11;

  function maxPointsText({
    max_auto_points,
    max_manual_points,
    points_list,
    init_points,
  }: {
    max_auto_points: number | null;
    max_manual_points: number | null;
    points_list: number[] | null;
    init_points: number | null;
  }) {
    if (max_auto_points || !max_manual_points) {
      switch (assessmentType) {
        case 'Exam':
          return (points_list || [max_manual_points])
            .map((p) => (p ?? 0) - (max_manual_points ?? 0))
            .join(',');
        case 'Homework':
          return `${(init_points ?? 0) - (max_manual_points ?? 0)}/${max_auto_points}`;
        default:
          assertNever(assessmentType);
      }
    } else {
      return '—';
    }
  }

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessmentNumber}: Questions
          </h1>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover" aria-label="Assessment questions">
            <thead>
              <tr>
                <th>
                  <span className="visually-hidden">Name</span>
                </th>
                <th>QID</th>
                <th>Topic</th>
                <th>Tags</th>
                <th>Auto Points</th>
                <th>Manual Points</th>
                {showAdvanceScorePercCol ? <th>Advance Score</th> : ''}
                <th>Mean score</th>
                <th>Num. Submissions Histogram</th>
                <th>Other Assessments</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questionRows.map((questionRow: StaffAssessmentQuestionRow) => {
                const { question, assessment_question, other_assessments } = questionRow;

                return (
                  <Fragment key={question.qid}>
                    <AssessmentQuestionHeaders question={questionRow} nTableCols={nTableCols} />
                    <tr>
                      <td>
                        <Title
                          questionRow={questionRow}
                          hasCoursePermissionPreview={hasCoursePermissionPreview}
                          urlPrefix={urlPrefix}
                        />
                        <IssueBadge
                          urlPrefix={urlPrefix}
                          count={questionRow.open_issue_count}
                          issueQid={question.qid}
                        />
                      </td>
                      <td>
                        {question.sync_errors ? (
                          <SyncProblemButton output={question.sync_errors} type="error" />
                        ) : question.sync_warnings ? (
                          <SyncProblemButton output={question.sync_warnings} type="warning" />
                        ) : (
                          ''
                        )}
                        {idsEqual(course.id, questionRow.course.id)
                          ? question.qid
                          : `@${questionRow.course.sharing_name}/${question.qid}`}
                      </td>
                      <td>
                        <TopicBadge topic={questionRow.topic} />
                      </td>
                      <td>
                        <TagBadgeList tags={questionRow.tags} />
                      </td>
                      <td>
                        {maxPointsText({
                          max_auto_points: assessment_question.max_auto_points,
                          max_manual_points: assessment_question.max_manual_points,
                          points_list: assessment_question.points_list,
                          init_points: assessment_question.init_points,
                        })}
                      </td>
                      <td>{assessment_question.max_manual_points || '—'}</td>
                      {showAdvanceScorePercCol && (
                        <td
                          className={clsx(
                            assessment_question.effective_advance_score_perc === 0 && 'text-muted',
                          )}
                          data-testid="advance-score-perc"
                        >
                          {assessment_question.effective_advance_score_perc}%
                        </td>
                      )}
                      <td>
                        {assessment_question.mean_question_score
                          ? `${assessment_question.mean_question_score.toFixed(3)}%`
                          : ''}
                      </td>
                      <td className="text-center">
                        {assessment_question.number_submissions_hist ? (
                          <HistMini
                            data={assessment_question.number_submissions_hist}
                            options={{ width: 60, height: 20 }}
                          />
                        ) : (
                          ''
                        )}
                      </td>
                      <td>
                        {other_assessments?.map((assessment) => {
                          return (
                            <div
                              key={`${question.qid}-${assessment.assessment_id}`}
                              className="d-inline-block me-1"
                            >
                              <AssessmentBadge
                                urlPrefix={urlPrefix}
                                assessment={{
                                  assessment_id: assessment.assessment_id,
                                  color: assessment.assessment_set_color,
                                  label: `${assessment.assessment_set_abbreviation}${assessment.assessment_number}`,
                                }}
                              />
                            </div>
                          );
                        })}
                      </td>
                      <td className="text-end">
                        <Dropdown>
                          <Dropdown.Toggle
                            variant="secondary"
                            size="sm"
                            id={`question-actions-${question.qid}`}
                          >
                            Action
                          </Dropdown.Toggle>
                          <Dropdown.Menu>
                            {hasCourseInstancePermissionEdit ? (
                              <Dropdown.Item
                                as="button"
                                type="button"
                                onClick={() => handleResetButtonClick(assessment_question.id)}
                              >
                                Reset question variants
                              </Dropdown.Item>
                            ) : (
                              <Dropdown.Item disabled>Must have editor permission</Dropdown.Item>
                            )}
                          </Dropdown.Menu>
                        </Dropdown>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {assessmentType === 'Homework' ? (
        <ResetQuestionVariantsModal
          csrfToken={csrfToken}
          assessmentQuestionId={resetAssessmentQuestionId}
          show={showResetModal}
          onHide={() => setShowResetModal(false)}
        />
      ) : (
        <ExamResetNotSupportedModal show={showResetModal} onHide={() => setShowResetModal(false)} />
      )}
    </>
  );
}

InstructorAssessmentQuestionsTableLegacy.displayName = 'InstructorAssessmentQuestionsTableLegacy';
