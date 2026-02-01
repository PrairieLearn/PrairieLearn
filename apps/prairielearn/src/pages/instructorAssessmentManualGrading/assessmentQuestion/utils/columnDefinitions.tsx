import { type Row, type Table, createColumnHelper } from '@tanstack/react-table';
import { useEffect, useRef } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger, numericColumnFilterFn } from '@prairielearn/ui';

import type { StaffAssessment } from '../../../../lib/client/safe-db-types.js';
import { getStudentEnrollmentUrl } from '../../../../lib/client/url.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../../lib/db-types.js';
import { formatPoints } from '../../../../lib/format.js';
import type { JobItemStatus } from '../../../../lib/serverJobProgressSocket.shared.js';
import type { InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from '../assessmentQuestion.types.js';
import { GradingStatusCell } from '../components/GradingStatusCell.js';

import { PointsWithEditButton, ScoreWithEditButton, generateAiGraderName } from './columnUtils.js';

const columnHelper = createColumnHelper<InstanceQuestionRow>();

/**
 * A checkbox component that properly handles the indeterminate state using a ref and useEffect,
 * since React doesn't support indeterminate as a native attribute.
 */
function SelectAllCheckbox({ table }: { table: Table<InstanceQuestionRow> }) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const isIndeterminate = table.getIsSomeRowsSelected();

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      // Prevent browser from autocompleting the checkbox value when you return to the page.
      autoComplete="off"
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  );
}

interface CreateColumnsParams {
  aiGradingMode: boolean;
  instanceQuestionGroups: InstanceQuestionGroup[];
  assessmentQuestion: AssessmentQuestion;
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
  assessment: StaffAssessment;
  courseInstanceId: string;
  createCheckboxProps: (row: Row<InstanceQuestionRow>, table: Table<InstanceQuestionRow>) => any;
  onEditPointsSuccess: () => void;
  onEditPointsConflict: (conflictDetailsUrl: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null> | null;
  displayedStatuses: Record<string, JobItemStatus | undefined>;
}

export type ColumnId =
  | 'select'
  | 'ai_grading_status'
  | 'index'
  | 'instance_question_group_name'
  | 'user_or_group_name'
  | 'uid'
  | 'requires_manual_grading'
  | 'assigned_grader_name'
  | 'auto_points'
  | 'manual_points'
  | 'points'
  | 'score_perc'
  | 'last_grader_name'
  | 'rubric_difference'
  | 'rubric_grading_item_ids';

export function createColumns({
  aiGradingMode,
  instanceQuestionGroups,
  displayedStatuses,
  assessment,
  assessmentQuestion,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
  courseInstanceId,
  createCheckboxProps,
  onEditPointsSuccess,
  onEditPointsConflict,
  scrollRef,
}: CreateColumnsParams) {
  const PointsCell = ({
    row,
    field,
  }: {
    row: InstanceQuestionRow;
    field: 'manual_points' | 'auto_points' | 'points';
  }) => {
    return (
      <PointsWithEditButton
        row={row}
        field={field}
        hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
        urlPrefix={urlPrefix}
        csrfToken={csrfToken}
        scrollRef={scrollRef}
        onSuccess={onEditPointsSuccess}
        onConflict={onEditPointsConflict}
      />
    );
  };

  return [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => <SelectAllCheckbox table={table} />,
      cell: ({ row, table }) => {
        return <input type="checkbox" {...createCheckboxProps(row, table)} />;
      },
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableSorting: false,
      enableHiding: false,
      enablePinning: false,
      enableResizing: false,
    }),

    columnHelper.accessor((row, index) => index, {
      id: 'index',
      header: 'Instance',
      cell: (info) => {
        const row = info.row.original;
        const rowId = row.instance_question.id;
        return (
          <div className="d-flex align-items-center gap-2">
            <a
              href={`${urlPrefix}/assessment/${assessment.id}/manual_grading/instance_question/${row.instance_question.id}`}
            >
              Instance {info.getValue() + 1}
            </a>
            {row.open_issue_count ? (
              <OverlayTrigger
                tooltip={{
                  props: { id: `instance-${rowId}-issue-tooltip` },
                  body: (
                    <>
                      Instance question has {row.open_issue_count} open{' '}
                      {row.open_issue_count > 1 ? 'issues' : 'issue'}
                    </>
                  ),
                }}
              >
                <button className="btn btn-danger badge rounded-pill">
                  {row.open_issue_count}
                </button>
              </OverlayTrigger>
            ) : null}
            {row.assessment_open ? (
              <OverlayTrigger
                tooltip={{
                  body: 'Assessment instance is still open',
                  props: { id: `assessment-instance-${rowId}-open-tooltip` },
                }}
              >
                <button
                  // This is a tricky case: we need an interactive element to trigger the tooltip
                  // for keyboard users, but we don't want it to be announced as a button by screen
                  // readers. So we give it role="status" to indicate that it's just a status indicator.
                  // It's possible there are better ways to handle this?
                  // eslint-disable-next-line jsx-a11y-x/no-interactive-element-to-noninteractive-role
                  role="status"
                  className="btn btn-xs btn-ghost"
                  aria-label="Assessment instance is still open"
                >
                  <i
                    className="fas fa-exclamation-triangle fa-width-auto text-warning"
                    aria-hidden="true"
                  />
                </button>
              </OverlayTrigger>
            ) : null}
          </div>
        );
      },
      enableColumnFilter: false,
    }),

    columnHelper.accessor((row) => row.instance_question.instance_question_group_name, {
      id: 'instance_question_group_name',
      header: 'Submission group',
      cell: (info) => {
        const value = info.getValue();
        if (!value) {
          return <span className="text-secondary">No Group</span>;
        }
        const group = instanceQuestionGroups.find((g) => g.instance_question_group_name === value);
        const rowId = info.row.original.instance_question.id;
        return (
          <span className="d-flex align-items-center gap-2">
            {value}
            {group && (
              <OverlayTrigger
                tooltip={{
                  body: group.instance_question_group_description,
                  props: { id: `submission-group-${rowId}-description-tooltip` },
                }}
              >
                <button className="btn btn-xs btn-ghost" aria-label="Group description">
                  <i
                    className="fas fa-circle-info fa-width-auto text-secondary"
                    aria-hidden="true"
                  />
                </button>
              </OverlayTrigger>
            )}
          </span>
        );
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        // We have to do this cast because columnId is a string.
        // See https://github.com/TanStack/table/issues/4142#issuecomment-3518670925.
        const current =
          row.getValue<InstanceQuestionRow['instance_question']['instance_question_group_name']>(
            columnId,
          );
        if (!current) {
          return filterValues.includes('No Group');
        }
        return filterValues.includes(current);
      },
      enableHiding: aiGradingMode && instanceQuestionGroups.length > 0,
    }),

    columnHelper.accessor('user_or_group_name', {
      id: 'user_or_group_name',
      header: assessment.team_work ? 'Group name' : 'Name',
      cell: (info) => info.getValue() || '—',
    }),

    columnHelper.accessor('uid', {
      id: 'uid',
      header: assessment.team_work ? 'UIDs' : 'UID',
      cell: (info) => {
        const uid = info.getValue();
        const enrollmentId = info.row.original.enrollment_id;
        if (!uid) return '—';
        if (enrollmentId) {
          return <a href={getStudentEnrollmentUrl(courseInstanceId, enrollmentId)}>{uid}</a>;
        }
        return uid;
      },
    }),

    columnHelper.accessor((row) => row.instance_question.requires_manual_grading, {
      id: 'requires_manual_grading',
      header: 'Grading status',
      cell: (info) => {
        return (
          <GradingStatusCell
            aiGradingMode={aiGradingMode}
            instanceQuestionId={info.row.original.instance_question.id}
            requiresGrading={info.getValue()}
            displayedStatuses={displayedStatuses}
          />
        );
      },
      filterFn: ({ getValue }, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const requiresGrading = getValue(columnId);
        const status = requiresGrading ? 'Requires grading' : 'Graded';
        return filterValues.includes(status);
      },
      meta: {
        autoSize: true,
      },
    }),

    columnHelper.accessor('assigned_grader_name', {
      id: 'assigned_grader_name',
      header: 'Assigned grader',
      cell: (info) => info.getValue() || 'Unassigned',
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const current = row.getValue<InstanceQuestionRow['assigned_grader_name']>(columnId);
        if (!current) return filterValues.includes('Unassigned');
        return filterValues.includes(current);
      },
      meta: {
        autoSize: true,
      },
    }),

    columnHelper.accessor((row) => row.instance_question.auto_points, {
      id: 'auto_points',
      header: 'Auto points',
      cell: (info) => <PointsCell row={info.row.original} field="auto_points" />,
      filterFn: numericColumnFilterFn,
      enableHiding: (assessmentQuestion.max_auto_points ?? 0) > 0,
    }),

    columnHelper.accessor((row) => row.instance_question.manual_points, {
      id: 'manual_points',
      header: 'Manual points',
      cell: (info) => <PointsCell row={info.row.original} field="manual_points" />,
      filterFn: numericColumnFilterFn,
      meta: {
        autoSize: true,
      },
    }),

    columnHelper.accessor((row) => row.instance_question.points, {
      id: 'points',
      header: 'Total points',
      cell: (info) => <PointsCell row={info.row.original} field="points" />,
      filterFn: numericColumnFilterFn,
    }),

    columnHelper.accessor((row) => row.instance_question.score_perc, {
      id: 'score_perc',
      header: 'Percentage score',
      cell: (info) => (
        <ScoreWithEditButton
          row={info.row.original}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          urlPrefix={urlPrefix}
          csrfToken={csrfToken}
          scrollRef={scrollRef}
          onSuccess={onEditPointsSuccess}
          onConflict={onEditPointsConflict}
        />
      ),
      filterFn: numericColumnFilterFn,
      minSize: 160,
      size: 200,
    }),

    columnHelper.accessor('last_grader_name', {
      id: 'last_grader_name',
      header: 'Graded by',
      cell: (info) => {
        const row = info.row.original;
        if (aiGradingMode) {
          const showPlus =
            row.instance_question.ai_grading_status !== 'None' &&
            row.instance_question.last_human_grader;
          return (
            <span>
              {row.instance_question.ai_grading_status !== 'None' && (
                <span
                  className={`badge rounded-pill text-bg-light border ${
                    row.instance_question.ai_grading_status === 'Graded' ||
                    row.instance_question.ai_grading_status === 'LatestRubric'
                      ? ''
                      : 'text-muted'
                  }`}
                >
                  {generateAiGraderName(row.instance_question.ai_grading_status)}
                </span>
              )}
              {showPlus && ' + '}
              {row.instance_question.last_human_grader && (
                <span>{row.instance_question.last_human_grader}</span>
              )}
            </span>
          );
        } else {
          if (!info.getValue()) return 'Unassigned';
          if (row.instance_question.is_ai_graded) {
            return (
              <span className="badge rounded-pill text-bg-light border">
                {generateAiGraderName()}
              </span>
            );
          }
          return info.getValue();
        }
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const current = row.getValue<InstanceQuestionRow['last_grader_name']>(columnId);
        const rowData = row.original;

        if (rowData.instance_question.ai_grading_status !== 'None') {
          const aiGraderName = generateAiGraderName(rowData.instance_question.ai_grading_status);
          if (filterValues.includes(aiGraderName)) return true;
        }

        if (!current) return filterValues.includes('Unassigned');

        return filterValues.includes(current);
      },
      sortingFn: (rowA, rowB) => {
        const aAiGradingStatus = rowA.original.instance_question.ai_grading_status;
        const bAiGradingStatus = rowB.original.instance_question.ai_grading_status;

        const aiGradingStatusOrder = {
          None: 0,
          Graded: 1,
          LatestRubric: 2,
          OutdatedRubric: 3,
        };

        if (aAiGradingStatus !== bAiGradingStatus) {
          return aiGradingStatusOrder[aAiGradingStatus] - aiGradingStatusOrder[bAiGradingStatus];
        }

        const aLastHumanGrader = rowA.original.instance_question.last_human_grader ?? '';
        const bLastHumanGrader = rowB.original.instance_question.last_human_grader ?? '';
        return aLastHumanGrader.localeCompare(bLastHumanGrader);
      },
    }),

    // AI agreement column
    columnHelper.accessor((row) => row.instance_question.rubric_difference, {
      id: 'rubric_difference',
      header: 'AI agreement',
      size: 400,
      minSize: 200,
      maxSize: 600,
      meta: {
        wrapText: true,
      },
      cell: (info) => {
        const row = info.row.original;
        const rowId = row.instance_question.id;
        if (row.instance_question.point_difference === null) {
          return '—';
        }

        if (row.instance_question.rubric_difference === null) {
          if (!row.instance_question.point_difference) {
            return <i className="bi bi-check-square-fill text-success" />;
          } else {
            const prefix = row.instance_question.point_difference < 0 ? '' : '+';
            return (
              <span className="text-danger">
                <i className="bi bi-x-square-fill" /> {prefix}
                {formatPoints(row.instance_question.point_difference)}
              </span>
            );
          }
        }

        if (row.instance_question.rubric_difference.length === 0) {
          return (
            <OverlayTrigger
              tooltip={{
                body: 'AI and human grading are in agreement',
                props: { id: `ai-agreement-${rowId}-agreement-tooltip` },
              }}
            >
              <i className="bi bi-check-square-fill text-success" />
            </OverlayTrigger>
          );
        }

        return (
          <div>
            {row.instance_question.rubric_difference.map((item) => (
              <div key={item.description}>
                {item.false_positive ? (
                  <OverlayTrigger
                    tooltip={{
                      body: 'Selected by AI but not by human',
                      props: { id: `ai-agreement-${rowId}-false-positive-tooltip` },
                    }}
                  >
                    <i className="bi bi-plus-square-fill text-danger" />
                  </OverlayTrigger>
                ) : (
                  <OverlayTrigger
                    tooltip={{
                      body: 'Selected by human but not by AI',
                      props: { id: `ai-agreement-${rowId}-false-negative-tooltip` },
                    }}
                  >
                    <i className="bi bi-dash-square-fill text-danger" />
                  </OverlayTrigger>
                )}{' '}
                <span>{item.description}</span>
              </div>
            ))}
          </div>
        );
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const rubricDiff = row.original.instance_question.rubric_difference;
        if (!rubricDiff || !Array.isArray(rubricDiff)) return false;

        return filterValues.every((description) =>
          rubricDiff.some((item) => item.description === description),
        );
      },
      sortingFn: (rowA, rowB) => {
        const aDiff = run(() => {
          if (rowA.original.instance_question.rubric_difference == null) return -1;
          return rowA.original.instance_question.rubric_difference.length;
        });
        const bDiff = run(() => {
          if (rowB.original.instance_question.rubric_difference == null) return -1;
          return rowB.original.instance_question.rubric_difference.length;
        });

        return aDiff - bDiff;
      },
      enableHiding: aiGradingMode,
    }),

    columnHelper.accessor('rubric_grading_item_ids', {
      id: 'rubric_grading_item_ids',
      header: 'Rubric Items',
      enableHiding: false,
      enableSorting: false,
      cell: () => null,
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const rubricItemIds = row.original.rubric_grading_item_ids;
        return filterValues.every((itemId) => rubricItemIds.includes(itemId));
      },
    }),
  ];
}
