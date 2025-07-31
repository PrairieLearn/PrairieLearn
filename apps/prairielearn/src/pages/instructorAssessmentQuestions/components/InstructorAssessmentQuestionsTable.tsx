import clsx from 'clsx';
import { useState } from 'preact/hooks';
import { Fragment } from 'preact/jsx-runtime';
import { Dropdown } from 'react-bootstrap';

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
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type { StaffAssessmentQuestionRow } from '../../../models/assessment-question.js';

import { EditQuestionModal } from './EditQuestionModal.js';
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
        assessmentQuestion={assessment_question}
        alternativeGroup={alternative_group}
        alternativeGroupSize={alternative_group_size}
      />
      {question.title}
    </>
  );
  if (hasCoursePermissionPreview) {
    return <a href={`${urlPrefix}/question/${question.id}/`}>{title}</a>;
  }
  return title;
}

function EditModeButtons({
  csrfToken,
  origHash,
  questions,
  editMode,
  setEditMode,
}: {
  csrfToken: string;
  origHash: string;
  questions: Record<string, any>;
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
}) {
  if (!editMode) {
    return (
      <button class="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
        <i class="fa fa-edit" aria-hidden="true"></i> Edit questions
      </button>
    );
  }
  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_topics" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="topics" value={JSON.stringify(questions)} />
      <span class="js-edit-mode-buttons">
        <button class="btn btn-sm btn-light mx-1" type="submit">
          <i class="fa fa-save" aria-hidden="true"></i> Save and sync
        </button>
        <button class="btn btn-sm btn-light" type="button" onClick={() => window.location.reload()}>
          Cancel
        </button>
      </span>
    </form>
  );
}

const emptyQuestion: StaffAssessmentQuestionRow = {
  qid: '',
  course_id: '',
  course_sharing_name: '',
  question_id: '',
  title: '',
  topic: {
    number: null,
    id: '',
    json_comment: '',
    course_id: '',
    color: '',
    description: '',
    implicit: false,
    name: '',
  },
  tags: [],
  max_auto_points: null,
  max_manual_points: null,
  points_list: null,
  init_points: null,
  assessment_question_advance_score_perc: 0,
  mean_question_score: null,
  number_submissions_hist: null,
};

export function InstructorAssessmentQuestionsTable({
  course,
  questionRows,
  urlPrefix,
  assessmentType,
  assessmentSetName,
  assessmentNumber,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  csrfToken,
  origHash,
  editorEnabled,
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
  origHash: string;
  editorEnabled: boolean;
}) {
  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedQuestion, setSelectedQuestion] =
    useState<StaffAssessmentQuestionRow>(emptyQuestion);
  const [questionState, setQuestionState] = useState<StaffAssessmentQuestionRow[]>(questionRows);

  const handleResetButtonClick = (questionId: string) => {
    setResetAssessmentQuestionId(questionId);
    setShowResetModal(true);
  };

  const handleEditQuestion = (question) => {
    setSelectedQuestion(question);
    console.log(selectedQuestion);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
  };

  const handleUpdateQuestion = (updatedQuestion: StaffAssessmentQuestionRow) => {
    console.log(updatedQuestion);
    setQuestionState((prevState) =>
      prevState.map((q) => (q.qid === updatedQuestion.qid ? updatedQuestion : q)),
    );
    handleCloseEditModal();
  };

  const handleDeleteQuestion = ({ qid }: { qid: string | null }) => {
    setQuestionState((prevState) => prevState.filter((q) => q.qid !== qid));
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol =
    questionRows.filter((q) => q.assessment_question.effective_advance_score_perc !== 0).length >=
    1;

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
      if (assessmentType === 'Exam') {
        return (points_list || [max_manual_points])
          .map((p) => (p ?? 0) - (max_manual_points ?? 0))
          .join(',');
      }
      if (assessmentType === 'Homework') {
        return `${(init_points ?? 0) - (max_manual_points ?? 0)}/${max_auto_points}`;
      }
    } else {
      return '—';
    }
  }

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessmentNumber}: Questions
          </h1>
          <div class="ms-auto">
            {editorEnabled && hasCourseInstancePermissionEdit && origHash ? (
              <EditModeButtons
                csrfToken={csrfToken}
                origHash={origHash}
                questions={questionState}
                editMode={editMode}
                setEditMode={setEditMode}
              />
            ) : (
              ''
            )}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Assessment questions">
            <thead>
              <tr>
                {editMode ? (
                  <>
                    <th>
                      <span class="visually-hidden">Edit</span>
                    </th>
                    <th>
                      <span class="visually-hidden">Delete</span>
                    </th>
                  </>
                ) : (
                  ''
                )}
                <th>
                  <span class="visually-hidden">Name</span>
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
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questionState.map((question) => {
                return (
                  <Fragment key={question.qid}>
                    <AssessmentQuestionHeaders question={question} nTableCols={nTableCols} />
                    <tr>
                      {editMode ? (
                        <>
                          <td class="align-content-center">
                            <button
                              class="btn btn-sm btn-secondary"
                              type="button"
                              onClick={() => handleEditQuestion(question)}
                            >
                              <i class="fa fa-edit" aria-hidden="true"></i>
                            </button>
                          </td>
                          <td class="align-content-center">
                            <button
                              class="btn btn-sm btn-danger"
                              type="button"
                              onClick={() =>
                                handleDeleteQuestion({
                                  qid: question.qid,
                                })
                              }
                            >
                              <i class="fa fa-trash" aria-hidden="true"></i>
                            </button>
                          </td>
                        </>
                      ) : (
                        ''
                      )}
                      <td>
                        <Title
                          questionRow={question}
                          hasCoursePermissionPreview={hasCoursePermissionPreview}
                          urlPrefix={urlPrefix}
                        />
                        <IssueBadge
                          urlPrefix={urlPrefix}
                          count={question.open_issue_count ?? 0}
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
                        {idsEqual(course.id, question.course_id)
                          ? question.qid
                          : `@${course.sharing_name}/${question.qid}`}
                      </td>
                      <td>
                        <TopicBadge topic={question.topic} />
                      </td>
                      <td>
                        <TagBadgeList tags={question.tags} />
                      </td>
                      <td>
                        {maxPointsText({
                          max_auto_points: question.assessment_question.max_auto_points,
                          max_manual_points: question.assessment_question.max_manual_points,
                          points_list: question.assessment_question.points_list,
                          init_points: question.assessment_question.init_points,
                        })}
                      </td>
                      <td>{question.assessment_question.max_manual_points || '—'}</td>
                      {showAdvanceScorePercCol ? (
                        <td
                          class={clsx(
                            question.assessment_question.effective_advance_score_perc === 0
                              ? 'text-muted'
                              : '',
                          )}
                          data-testid="advance-score-perc"
                        >
                          {question.assessment_question.effective_advance_score_perc}%
                        </td>
                      ) : (
                        ''
                      )}
                      <td>
                        {question.assessment_question.mean_question_score
                          ? `${question.assessment_question.mean_question_score.toFixed(3)} %`
                          : ''}
                      </td>
                      <td class="text-center">
                        {question.assessment_question.number_submissions_hist ? (
                          <HistMini
                            data={question.assessment_question.number_submissions_hist}
                            options={{ width: 60, height: 20 }}
                          />
                        ) : (
                          ''
                        )}
                      </td>
                      <td>
                        {question.other_assessments?.map((assessment) => {
                          return (
                            <div
                              key={`${question.qid}-${assessment.assessment_id}`}
                              class="d-inline-block me-1"
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
                      <td class="text-end">
                        <Dropdown>
                          <Dropdown.Toggle
                            variant="secondary"
                            class="dropdown-toggle btn-xs"
                            id={`question-actions-${question.qid}`}
                          >
                            Action
                          </Dropdown.Toggle>
                          <Dropdown.Menu>
                            {hasCourseInstancePermissionEdit ? (
                              <Dropdown.Item
                                as="button"
                                type="button"
                                onClick={() =>
                                  handleResetButtonClick(question.assessment_question.id)
                                }
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
      <ResetQuestionVariantsModal
        csrfToken={csrfToken}
        assessmentQuestionId={resetAssessmentQuestionId}
        show={showResetModal}
        onHide={() => setShowResetModal(false)}
      />
      {editMode ? (
        <EditQuestionModal
          question={selectedQuestion}
          showEditModal={showEditModal}
          onHide={handleCloseEditModal}
          handleUpdateQuestion={handleUpdateQuestion}
          assessmentType={assessmentType}
        />
      ) : null}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
