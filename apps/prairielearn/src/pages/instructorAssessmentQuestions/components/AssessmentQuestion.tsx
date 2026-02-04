import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';
import { type CSSProperties } from 'react';
import { Dropdown } from 'react-bootstrap';

import { CommentPopover } from '../../../components/CommentPopover.js';
import { HistMini } from '../../../components/HistMini.js';
import { IssueBadge } from '../../../components/IssueBadge.js';
import { OtherAssessmentsBadges } from '../../../components/OtherAssessmentsBadges.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import { TagBadgeList } from '../../../components/TagBadge.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type {
  AssessmentState,
  HandleDeleteQuestion,
  HandleEditQuestion,
  QuestionAlternativeForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import { QuestionNumberTitleCell } from './QuestionNumberTitleCell.js';

/**
 * Renders text for the points on a question.
 */
function MaxPointsText({
  maxAutoPoints,
  maxManualPoints,
  autoPoints,
  assessmentType,
}: {
  maxAutoPoints: number | number[] | null;
  maxManualPoints: number | null;
  autoPoints: number | number[] | null;
  assessmentType: EnumAssessmentType;
}) {
  if (autoPoints != null || maxManualPoints != null) {
    if (assessmentType === 'Exam') {
      const pointsArray = Array.isArray(autoPoints) ? autoPoints : [autoPoints ?? maxManualPoints];
      return pointsArray.map((p) => (p ?? 0) - (maxManualPoints ?? 0)).join(', ');
    }
    if (assessmentType === 'Homework') {
      const initPointsValue = Array.isArray(autoPoints) ? autoPoints[0] : autoPoints;
      const maxAutoPointsValue = Array.isArray(maxAutoPoints) ? maxAutoPoints[0] : maxAutoPoints;
      return `${(initPointsValue ?? 0) - (maxManualPoints ?? 0)}/${maxAutoPointsValue ?? 0}`;
    }
  }

  return '—';
}

interface AssessmentQuestionBaseProps {
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  assessmentState: AssessmentState;
}

interface AssessmentQuestionAlternativeRow extends AssessmentQuestionBaseProps {
  alternative: QuestionAlternativeForm;
  alternativeIndex: number;
  zoneQuestionBlockAutoPoints: number | number[] | null;

  sortableRef?: never;
  sortableStyle?: never;
  sortableAttributes?: never;
  sortableListeners?: never;
}

interface AssessmentQuestionIndividualRow extends AssessmentQuestionBaseProps {
  alternative?: never;
  alternativeIndex?: never;
  zoneQuestionBlockAutoPoints?: never;

  sortableRef: (node: HTMLElement | null) => void;
  sortableStyle: CSSProperties;
  sortableAttributes: DraggableAttributes;
  sortableListeners: DraggableSyntheticListeners;
}
/**
 * An individual question row.
 *
 * Can be for a question, or an alternative question.
 */
export function AssessmentQuestion({
  alternative,
  zoneQuestionBlock,
  alternativeIndex,
  assessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  zoneQuestionBlockAutoPoints,
  sortableRef,
  sortableStyle,
  sortableAttributes,
  sortableListeners,
}: AssessmentQuestionIndividualRow | AssessmentQuestionAlternativeRow) {
  const question = alternative ?? zoneQuestionBlock;
  const questionId = question.id;
  const {
    questionMetadata,
    editMode,
    urlPrefix,
    hasCoursePermissionPreview,
    canEdit,
    showAdvanceScorePercCol,
    assessmentType,
  } = assessmentState;

  // This should never happen, we should never be rendering a zone question block that has no ID
  if (questionId == null) throw new Error('Zone question block has no ID');

  const questionData = questionMetadata[questionId];

  let maxAutoPoints: number | number[] | null = null;
  if (assessmentType === 'Exam') {
    maxAutoPoints = question.points ?? question.autoPoints ?? null;
  } else {
    maxAutoPoints =
      question.maxPoints ??
      question.maxAutoPoints ??
      zoneQuestionBlock.maxPoints ??
      zoneQuestionBlock.maxAutoPoints ??
      null;
  }

  const questionColumns = [
    editMode && (
      <td key="grab-handle" className="align-content-center">
        {sortableListeners ? (
          <span
            {...sortableAttributes}
            {...sortableListeners}
            style={{ cursor: 'grab', touchAction: 'none' }}
            aria-label="Drag to reorder"
          >
            <i className="fa fa-grip-vertical text-muted" aria-hidden="true" />
          </span>
        ) : null}
      </td>
    ),
    editMode && (
      <td key="edit-button" className="align-content-center">
        <button
          className="btn btn-sm btn-outline-secondary border-0"
          type="button"
          title="Edit question"
          onClick={() => {
            handleEditQuestion({
              question,
              zoneQuestionBlock: alternative ? zoneQuestionBlock : undefined,
              questionTrackingId: zoneQuestionBlock.trackingId,
              alternativeTrackingId: alternative?.trackingId,
            });
          }}
        >
          <i className="fa fa-edit" aria-hidden="true" />
        </button>
      </td>
    ),
    editMode && (
      <td key="delete-button" className="align-content-center">
        <button
          className="btn btn-sm btn-outline-secondary border-0"
          type="button"
          title="Delete question"
          onClick={() =>
            handleDeleteQuestion(zoneQuestionBlock.trackingId, questionId, alternative?.trackingId)
          }
        >
          <i className="fa fa-trash text-danger" aria-hidden="true" />
        </button>
      </td>
    ),
    <td key="title" style={{ whiteSpace: 'nowrap' }}>
      <QuestionNumberTitleCell
        questionNumber={questionNumber}
        alternativeNumber={
          questionData.alternative_group_size > 1
            ? alternativeIndex !== undefined
              ? alternativeIndex + 1
              : 1
            : null
        }
        titleContent={
          hasCoursePermissionPreview ? (
            <a href={`${urlPrefix}/question/${questionData.question.id}/`}>
              {questionData.question.title}
            </a>
          ) : (
            questionData.question.title
          )
        }
        qidContent={
          <>
            {questionData.question.sync_errors ? (
              <SyncProblemButton output={questionData.question.sync_errors} type="error" />
            ) : questionData.question.sync_warnings ? (
              <SyncProblemButton output={questionData.question.sync_warnings} type="warning" />
            ) : null}
            <code>{questionId}</code>
          </>
        }
        badges={
          <>
            <IssueBadge
              urlPrefix={urlPrefix}
              count={questionData.open_issue_count}
              issueQid={questionData.question.qid}
            />
            <CommentPopover comment={question.comment} />
          </>
        }
      />
    </td>,
    <td key="topic">
      <TopicBadge topic={questionData.topic} />
    </td>,
    <td key="tags">
      <TagBadgeList tags={questionData.tags} />
    </td>,
    <td key="max-points">
      <MaxPointsText
        maxAutoPoints={maxAutoPoints ?? zoneQuestionBlock.maxAutoPoints ?? null}
        maxManualPoints={question.manualPoints ?? zoneQuestionBlock.manualPoints ?? null}
        autoPoints={question.points ?? question.autoPoints ?? zoneQuestionBlockAutoPoints ?? null}
        assessmentType={assessmentType}
      />
    </td>,
    <td key="manual-points">{question.manualPoints ?? zoneQuestionBlock.manualPoints ?? '—'}</td>,
    showAdvanceScorePercCol ? (
      <td
        key="advance-score-perc"
        className={clsx({
          'text-muted': questionData.assessment_question.effective_advance_score_perc === 0,
        })}
        data-testid="advance-score-perc"
      >
        {questionData.assessment_question.effective_advance_score_perc}%
      </td>
    ) : null,
    <td key="mean-score">
      {questionData.assessment_question.mean_question_score != null
        ? `${questionData.assessment_question.mean_question_score.toFixed(3)} %`
        : null}
    </td>,
    <td key="histogram" className="text-center">
      {questionData.assessment_question.number_submissions_hist && (
        <HistMini
          data={questionData.assessment_question.number_submissions_hist}
          options={{ width: 60, height: 20 }}
        />
      )}
    </td>,
    <td key="other-assessments">
      <OtherAssessmentsBadges
        assessments={questionData.other_assessments ?? []}
        urlPrefix={urlPrefix}
      />
    </td>,
    !editMode && (
      <td key="actions" className="text-end">
        <Dropdown>
          <Dropdown.Toggle
            as="button"
            type="button"
            variant="secondary"
            className="btn btn-secondary btn-xs"
            id={`question-actions-${questionData.question.qid}`}
          >
            Action
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {canEdit ? (
              <Dropdown.Item
                as="button"
                type="button"
                onClick={() => handleResetButtonClick(questionData.assessment_question.id)}
              >
                Reset question variants
              </Dropdown.Item>
            ) : (
              <Dropdown.Item disabled>Must have editor permission</Dropdown.Item>
            )}
          </Dropdown.Menu>
        </Dropdown>
      </td>
    ),
  ];

  return (
    <tr ref={sortableRef} style={sortableStyle}>
      {questionColumns}
    </tr>
  );
}
