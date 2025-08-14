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
  questions: StaffAssessmentQuestionRow[];
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
}) {
  if (!editMode) {
    return (
      <button class="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
        <i class="fa fa-edit" aria-hidden="true" /> Edit questions
      </button>
    );
  }

  // Serialize questions to zones format
  const zones = serializeQuestionsToZones(questions);

  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      <span class="js-edit-mode-buttons">
        <button class="btn btn-sm btn-light mx-1" type="submit">
          <i class="fa fa-save" aria-hidden="true" /> Save and sync
        </button>
        <button class="btn btn-sm btn-light" type="button" onClick={() => window.location.reload()}>
          Cancel
        </button>
      </span>
    </form>
  );
}

// Function to serialize questions to zones format
function serializeQuestionsToZones(questions: StaffAssessmentQuestionRow[]): any[] {
  const zonesMap = new Map<string, any>();

  questions.forEach((question) => {
    const zoneId = question.zone.id;

    if (!zonesMap.has(zoneId)) {
      zonesMap.set(zoneId, {
        title: question.zone.title,
        maxPoints: question.zone.max_points,
        numberChoose: question.zone.number_choose,
        bestQuestions: question.zone.best_questions,
        advanceScorePerc: question.zone.advance_score_perc,
        gradeRateMinutes: question.zone.json_grade_rate_minutes,
        questions: [],
      });
    }

    const zone = zonesMap.get(zoneId);

    // Helper function to create question object with correct points structure
    const createQuestionObject = (question: StaffAssessmentQuestionRow) => {
      const questionObj: any = {
        id: question.question.qid,
        triesPerVariant: question.assessment_question.tries_per_variant,
        advanceScorePerc: question.assessment_question.advance_score_perc,
        gradeRateMinutes: question.assessment_question.json_grade_rate_minutes,
      };

      // Determine assessment type from the question's assessment
      const assessmentType = question.assessment.type;

      if (assessmentType === 'Homework') {
        // For Homework: use either auto points OR manual points based on grading method
        const isAutoGraded = question.assessment_question.max_manual_points === 0;

        if (isAutoGraded) {
          // Auto grading: use autoPoints and maxAutoPoints
          questionObj.autoPoints = question.assessment_question.init_points;
          questionObj.maxAutoPoints = question.assessment_question.max_auto_points;
          questionObj.manualPoints = 0; // Set to 0 for Homework auto grading
        } else {
          // Manual grading: use manualPoints only
          questionObj.manualPoints = question.assessment_question.max_manual_points;
          questionObj.autoPoints = 0; // Set to 0 for Homework manual grading
          questionObj.maxAutoPoints = 0; // Set to 0 for Homework manual grading
        }
      } else {
        // For Exam: always include both autoPoints and manualPoints
        questionObj.autoPoints =
          question.assessment_question.points_list || question.assessment_question.init_points;
        questionObj.maxAutoPoints = question.assessment_question.max_auto_points;
        questionObj.manualPoints = question.assessment_question.max_manual_points;
      }

      return questionObj;
    };

    // Check if this question starts a new alternative group
    if (question.start_new_alternative_group) {
      // Check if this is a single question or the start of an alternative group
      if (question.alternative_group_size === 1) {
        // Single question - add directly to zone.questions
        zone.questions.push(createQuestionObject(question));
      } else {
        // Start of an alternative group
        const alternativeGroup: any = {
          numberChoose: question.alternative_group.number_choose,
          alternatives: [],
        };

        // Add the current question to this alternative group
        alternativeGroup.alternatives.push(createQuestionObject(question));

        zone.questions.push(alternativeGroup);
      }
    } else {
      // Add to the last alternative group (this should only happen for alternative groups)
      const lastQuestion = zone.questions[zone.questions.length - 1];
      if (lastQuestion && lastQuestion.alternatives) {
        lastQuestion.alternatives.push(createQuestionObject(question));
      }
    }
  });

  return Array.from(zonesMap.values());
}

function createEmptyQuestionTemplate(
  zone: StaffAssessmentQuestionRow['zone'],
  course: StaffCourse,
  assessmentType: 'Homework' | 'Exam',
): StaffAssessmentQuestionRow {
  // Generate a unique temporary ID for the new question
  const tempId = Date.now() + Math.random();

  const template = {
    start_new_zone: false,
    start_new_alternative_group: true,
    alternative_group_size: 1,
    assessment_question: {
      advance_score_perc: null,
      ai_grading_mode: false,
      alternative_group_id: null,
      assessment_id: '',
      average_average_submission_score: null,
      average_first_submission_score: null,
      average_last_submission_score: null,
      average_max_submission_score: null,
      average_number_submissions: null,
      average_submission_score_hist: null,
      average_submission_score_variance: null,
      deleted_at: null,
      discrimination: null,
      effective_advance_score_perc: 0,
      first_submission_score_hist: null,
      first_submission_score_variance: null,
      force_max_points: null,
      grade_rate_minutes: null,
      id: tempId,
      incremental_submission_points_array_averages: null,
      incremental_submission_points_array_variances: null,
      incremental_submission_score_array_averages: null,
      incremental_submission_score_array_variances: null,
      init_points: assessmentType === 'Homework' ? 1 : 0,
      json_comment: null,
      json_grade_rate_minutes: null,
      last_submission_score_hist: null,
      last_submission_score_variance: null,
      manual_rubric_id: null,
      max_auto_points: assessmentType === 'Homework' ? 1 : 1,
      max_manual_points: 0,
      max_points: assessmentType === 'Homework' ? 1 : 1,
      max_submission_score_hist: null,
      max_submission_score_variance: null,
      mean_question_score: null,
      median_question_score: null,
      number: 1,
      number_in_alternative_group: 1,
      number_submissions_hist: null,
      number_submissions_variance: null,
      points_list: assessmentType === 'Exam' ? [1] : null,
      question_id: '',
      question_score_variance: null,
      quintile_question_scores: null,
      some_nonzero_submission_perc: null,
      some_perfect_submission_perc: null,
      some_submission_perc: null,
      submission_score_array_averages: null,
      submission_score_array_variances: null,
      tries_per_variant: 3,
    },
    question: {
      id: tempId,
      qid: '',
      title: '',
      type: '',
      client_files: [],
      topic_id: null,
      grading_method: 'Internal',
      single_variant: true,
      template_directory: null,
      options: {},
      client_files_hash: null,
      course_id: course.id,
      deleted_at: null,
      sync_errors: null,
      sync_warnings: null,
      uuid: '',
    },
    topic: {
      id: '',
      name: '',
      color: '',
      description: null,
      number: 1,
    },
    alternative_group: {
      id: tempId,
      number: 1,
      number_choose: null,
      assessment_id: '',
    },
    zone,
    assessment: {
      id: '',
      tid: '',
      number: '',
      title: '',
      type: assessmentType,
      multiple_instance: false,
      shuffle_questions: false,
      allow_issue_reporting: false,
      allow_real_time_grading: false,
      require_honor_code: false,
      auto_close: false,
      course_instance_id: '',
      deleted_at: null,
      uuid: '',
    },
    course_instance: {
      id: '',
      long_name: '',
      short_name: '',
      display_timezone: '',
      hide_in_enroll_page: false,
      display_name: '',
      course_id: '',
      deleted_at: null,
      uuid: '',
    },
    course,
    open_issue_count: 0,
    tags: [],
    other_assessments: [],
  } as unknown as StaffAssessmentQuestionRow;

  return template;
}

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
  const [selectedQuestion, setSelectedQuestion] = useState<StaffAssessmentQuestionRow | null>(null);
  const [questionState, setQuestionState] = useState<StaffAssessmentQuestionRow[]>(questionRows);
  const [addQuestion, setAddQuestion] = useState(false);

  const handleResetButtonClick = (questionId: string) => {
    setResetAssessmentQuestionId(questionId);
    setShowResetModal(true);
  };

  const handleEditQuestion = (question) => {
    setSelectedQuestion(question);
    setAddQuestion(false);
    setShowEditModal(true);
  };

  const handleAddQuestion = (zone: StaffAssessmentQuestionRow['zone']) => {
    const emptyQuestion = createEmptyQuestionTemplate(zone, course, assessmentType);
    setSelectedQuestion(emptyQuestion);
    setAddQuestion(true);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setAddQuestion(false);
  };

  // Function to renumber questions after adding/removing questions
  const renumberQuestions = (
    questions: StaffAssessmentQuestionRow[],
  ): StaffAssessmentQuestionRow[] => {
    // Count questions in each alternative group
    const groupCounts: Record<string, number> = {};
    for (const question of questions) {
      const groupId = question.alternative_group.id;
      groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
    }

    let prevZoneId: string | null = null;
    let prevAltGroupId: string | null = null;
    let currentAltGroupNumber = 0;

    return questions.map((question) => {
      const start_new_zone = question.zone.id !== prevZoneId;
      const start_new_alternative_group = question.alternative_group.id !== prevAltGroupId;

      // If this is a new alternative group, increment the group number
      if (start_new_alternative_group) {
        currentAltGroupNumber++;
      }

      // Update alternative group size
      const alternative_group_size = groupCounts[question.alternative_group.id];

      // Update the alternative group number
      const updatedAlternativeGroup = {
        ...question.alternative_group,
        number: currentAltGroupNumber,
      };

      // Update the assessment question number within the alternative group
      const questionsInSameGroup = questions.filter(
        (q) => q.alternative_group.id === question.alternative_group.id,
      );
      const questionIndexInGroup = questionsInSameGroup.findIndex(
        (q) => q.question.id === question.question.id,
      );
      const number_in_alternative_group = questionIndexInGroup + 1;

      const updatedAssessmentQuestion = {
        ...question.assessment_question,
        number: currentAltGroupNumber,
        number_in_alternative_group,
      };

      prevZoneId = question.zone.id;
      prevAltGroupId = question.alternative_group.id;

      return {
        ...question,
        start_new_zone,
        start_new_alternative_group,
        alternative_group_size,
        alternative_group: updatedAlternativeGroup,
        assessment_question: updatedAssessmentQuestion,
      };
    });
  };

  const handleUpdateQuestion = (
    updatedQuestion: StaffAssessmentQuestionRow,
    gradingMethod?: 'auto' | 'manual',
  ) => {
    // For Homework assessments, ensure points are correctly set based on grading method
    if (assessmentType === 'Homework' && gradingMethod) {
      if (gradingMethod === 'auto') {
        // Auto grading: ensure manual points are 0
        updatedQuestion.assessment_question.max_manual_points = 0;
      } else {
        // Manual grading: ensure auto points are 0
        updatedQuestion.assessment_question.init_points = 0;
        updatedQuestion.assessment_question.max_auto_points = 0;
      }
    }

    if (addQuestion) {
      // Add new question to the state in the correct zone position and renumber
      setQuestionState((prevState) => {
        // Find the correct position to insert the new question within its zone
        const targetZoneId = updatedQuestion.zone.id;
        let insertIndex = prevState.length; // Default to end if zone not found

        // Find the last question in the target zone
        for (let i = prevState.length - 1; i >= 0; i--) {
          if (prevState[i].zone.id === targetZoneId) {
            insertIndex = i + 1; // Insert after the last question in this zone
            break;
          }
        }

        // Insert the new question at the correct position
        const newState = [
          ...prevState.slice(0, insertIndex),
          updatedQuestion,
          ...prevState.slice(insertIndex),
        ];

        return renumberQuestions(newState);
      });
    } else {
      // Update existing question
      setQuestionState((prevState) =>
        prevState.map((q) =>
          q.question.qid === updatedQuestion.question.qid ? updatedQuestion : q,
        ),
      );
    }
    handleCloseEditModal();
  };

  const handleDeleteQuestion = ({ qid }: { qid: string | null }) => {
    setQuestionState((prevState) => {
      const filteredState = prevState.filter((q) => q.question.qid !== qid);
      return renumberQuestions(filteredState);
    });
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

  function questionDisplayName(question: StaffAssessmentQuestionRow) {
    if (idsEqual(course.id, question.question.course_id)) {
      return question.question.qid || '';
    }
    return `@${course.sharing_name}/${question.question.qid || ''}`;
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
              {questionState.map((question, index) => {
                const isLastInZone =
                  index === questionState.length - 1 || questionState[index + 1]?.start_new_zone;

                return (
                  <Fragment key={question.question.qid}>
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
                              <i class="fa fa-edit" aria-hidden="true" />
                            </button>
                          </td>
                          <td class="align-content-center">
                            <button
                              class="btn btn-sm btn-danger"
                              type="button"
                              onClick={() =>
                                handleDeleteQuestion({
                                  qid: question.question.qid,
                                })
                              }
                            >
                              <i class="fa fa-trash" aria-hidden="true" />
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
                          issueQid={question.question.qid}
                        />
                      </td>
                      <td>
                        {question.question.sync_errors ? (
                          <SyncProblemButton output={question.question.sync_errors} type="error" />
                        ) : question.question.sync_warnings ? (
                          <SyncProblemButton
                            output={question.question.sync_warnings}
                            type="warning"
                          />
                        ) : (
                          ''
                        )}
                        {questionDisplayName(question)}
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
                              key={`${question.question.qid}-${assessment.assessment_id}`}
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
                            id={`question-actions-${question.question.qid}`}
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
                    {/* Add "Add question" button at the end of each zone */}
                    {editMode && isLastInZone && (
                      <tr>
                        <td colspan={nTableCols + 1}>
                          <button
                            class="btn btn-sm"
                            type="button"
                            onClick={() => handleAddQuestion(question.zone)}
                          >
                            <i class="fa fa-add" aria-hidden="true" /> Add Question to Zone
                          </button>
                        </td>
                      </tr>
                    )}
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
      {editMode && selectedQuestion ? (
        <EditQuestionModal
          question={selectedQuestion}
          showEditModal={showEditModal}
          assessmentType={assessmentType}
          questionDisplayName={questionDisplayName}
          addQuestion={addQuestion}
          handleUpdateQuestion={handleUpdateQuestion}
          onHide={handleCloseEditModal}
        />
      ) : null}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
