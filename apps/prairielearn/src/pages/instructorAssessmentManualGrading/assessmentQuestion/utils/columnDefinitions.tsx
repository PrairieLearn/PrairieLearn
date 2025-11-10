import { type Table, createColumnHelper } from '@tanstack/react-table';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

import { numericColumnFilterFn } from '@prairielearn/ui';

import { getStudentEnrollmentUrl } from '../../../../lib/client/url.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../../lib/db-types.js';
import { formatPoints } from '../../../../lib/format.js';
import type { InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from '../assessmentQuestion.types.js';

import { formatPointsWithEdit, formatScoreWithEdit, generateAiGraderName } from './columnUtils.js';

const columnHelper = createColumnHelper<InstanceQuestionRow>();

interface CreateColumnsParams {
  aiGradingMode: boolean;
  instanceQuestionGroups: InstanceQuestionGroup[];
  groupWork: boolean;
  assessmentQuestion: AssessmentQuestion;
  authzDataHasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
  assessmentId: string;
  createCheckboxProps: (row: any, table: Table<InstanceQuestionRow>) => any;
}

export function createColumns({
  aiGradingMode,
  instanceQuestionGroups,
  groupWork,
  assessmentQuestion,
  authzDataHasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
  assessmentId,
  createCheckboxProps,
}: CreateColumnsParams) {
  return [
    // Checkbox column for batch selection
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
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

    // Instance number column
    columnHelper.accessor((row, index) => index, {
      id: 'index',
      header: 'Instance',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div>
            <a
              href={`${urlPrefix}/assessment/${assessmentId}/manual_grading/instance_question/${row.id}`}
            >
              Instance {info.getValue() + 1}
            </a>
            {row.open_issue_count ? (
              <OverlayTrigger
                overlay={
                  <Tooltip>
                    Instance question has {row.open_issue_count} open{' '}
                    {row.open_issue_count > 1 ? 'issues' : 'issue'}
                  </Tooltip>
                }
              >
                <span class="badge rounded-pill text-bg-danger ms-2">{row.open_issue_count}</span>
              </OverlayTrigger>
            ) : null}
            {row.assessment_open ? (
              <OverlayTrigger overlay={<Tooltip>Assessment instance is still open</Tooltip>}>
                <i class="fas fa-exclamation-triangle text-warning ms-2" />
              </OverlayTrigger>
            ) : null}
          </div>
        );
      },
      enableColumnFilter: false,
    }),

    // Submission group column (AI grading mode only)
    ...(aiGradingMode && instanceQuestionGroups.length > 0
      ? [
          columnHelper.accessor('instance_question_group_name', {
            id: 'instance_question_group_name',
            header: 'Submission Group',
            cell: (info) => {
              const value = info.getValue();
              if (!value) {
                return <span class="text-secondary">No Group</span>;
              }
              const group = instanceQuestionGroups.find(
                (g) => g.instance_question_group_name === value,
              );
              return (
                <span class="d-flex align-items-center gap-2">
                  {value}
                  {group && (
                    <OverlayTrigger
                      overlay={<Tooltip>{group.instance_question_group_description}</Tooltip>}
                    >
                      <span>
                        <i class="fas fa-circle-info text-secondary" />
                      </span>
                    </OverlayTrigger>
                  )}
                </span>
              );
            },
            filterFn: (row, columnId, filterValues: string[]) => {
              if (filterValues.length === 0) return true;
              const current =
                row.getValue<InstanceQuestionRow['instance_question_group_name']>(columnId);
              if (!current) {
                return filterValues.includes('No Group');
              }
              return filterValues.includes(current);
            },
          }),
        ]
      : []),

    // User/Group name column (hidden by default)
    columnHelper.accessor('user_or_group_name', {
      id: 'user_or_group_name',
      header: groupWork ? 'Group Name' : 'Name',
      cell: (info) => info.getValue() || '—',
      enableHiding: true,
    }),

    // UID column (hidden by default)
    columnHelper.accessor('uid', {
      id: 'uid',
      header: groupWork ? 'UIDs' : 'UID',
      cell: (info) => {
        const uid = info.getValue();
        const enrollmentId = info.row.original.enrollment_id;
        if (!uid) return '—';
        if (enrollmentId) {
          return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{uid}</a>;
        }
        return uid;
      },
      enableHiding: true,
    }),

    // Grading status column
    columnHelper.accessor('requires_manual_grading', {
      id: 'requires_manual_grading',
      header: 'Grading status',
      cell: (info) => (info.getValue() ? 'Requires grading' : 'Graded'),
      filterFn: ({ getValue }, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const requiresGrading = getValue(columnId);
        const status = requiresGrading ? 'Requires grading' : 'Graded';
        return filterValues.includes(status);
      },
    }),

    // Assigned grader column
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
    }),

    // Auto points column (only if assessment has auto points)
    ...(assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0
      ? [
          columnHelper.accessor('auto_points', {
            id: 'auto_points',
            header: 'Auto points',
            cell: (info) =>
              formatPointsWithEdit({
                row: info.row.original,
                field: 'auto_points',
                hasCourseInstancePermissionEdit: authzDataHasCourseInstancePermissionEdit,
                urlPrefix,
                csrfToken,
              }),
            filterFn: numericColumnFilterFn,
          }),
        ]
      : []),

    // Manual points column
    columnHelper.accessor('manual_points', {
      id: 'manual_points',
      header: 'Manual points',
      cell: (info) =>
        formatPointsWithEdit({
          row: info.row.original,
          field: 'manual_points',
          hasCourseInstancePermissionEdit: authzDataHasCourseInstancePermissionEdit,
          urlPrefix,
          csrfToken,
        }),
      filterFn: numericColumnFilterFn,
    }),

    // Total points column (hidden by default)
    columnHelper.accessor('points', {
      id: 'points',
      header: 'Total points',
      cell: (info) =>
        formatPointsWithEdit({
          row: info.row.original,
          field: 'points',
          hasCourseInstancePermissionEdit: authzDataHasCourseInstancePermissionEdit,
          urlPrefix,
          csrfToken,
        }),
      filterFn: numericColumnFilterFn,
      enableHiding: true,
    }),

    // Score percentage column (not in AI grading mode)
    ...(!aiGradingMode
      ? [
          columnHelper.accessor('score_perc', {
            id: 'score_perc',
            header: 'Percentage score',
            cell: (info) =>
              formatScoreWithEdit({
                row: info.row.original,
                hasCourseInstancePermissionEdit: authzDataHasCourseInstancePermissionEdit,
                urlPrefix,
                csrfToken,
              }),
            filterFn: numericColumnFilterFn,
          }),
        ]
      : []),

    // Graded by column
    columnHelper.accessor('last_grader_name', {
      id: 'last_grader_name',
      header: 'Graded by',
      cell: (info) => {
        const row = info.row.original;
        if (aiGradingMode) {
          const showPlus = row.ai_grading_status !== 'None' && row.last_human_grader;
          return (
            <span>
              {row.ai_grading_status !== 'None' && (
                <span
                  class={`badge rounded-pill text-bg-light border ${
                    row.ai_grading_status === 'Graded' || row.ai_grading_status === 'LatestRubric'
                      ? ''
                      : 'text-muted'
                  }`}
                >
                  {generateAiGraderName(row.ai_grading_status)}
                </span>
              )}
              {showPlus && ' + '}
              {row.last_human_grader && <span>{row.last_human_grader}</span>}
            </span>
          );
        } else {
          if (!info.getValue()) return 'Unassigned';
          if (row.is_ai_graded) {
            return (
              <span class="badge rounded-pill text-bg-light border">{generateAiGraderName()}</span>
            );
          }
          return info.getValue();
        }
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const current = row.getValue<InstanceQuestionRow['last_grader_name']>(columnId);
        if (!current) return filterValues.includes('Unassigned');
        const rowData = row.original;

        // Check AI grader
        if (rowData.ai_grading_status !== 'None') {
          const aiGraderName = generateAiGraderName(rowData.ai_grading_status);
          if (filterValues.includes(aiGraderName)) return true;
        }

        // Check human grader
        return filterValues.includes(current);
      },
    }),

    // AI agreement column (AI grading mode only)
    ...(aiGradingMode
      ? [
          columnHelper.accessor('rubric_difference', {
            id: 'rubric_difference',
            header: 'AI agreement',
            size: 300,
            minSize: 200,
            maxSize: 600,
            meta: {
              wrapText: true,
            },
            cell: (info) => {
              const row = info.row.original;
              if (row.point_difference === null) {
                return '—';
              }

              if (row.rubric_difference === null) {
                if (!row.point_difference) {
                  return <i class="bi bi-check-square-fill text-success" />;
                } else {
                  const prefix = row.point_difference < 0 ? '' : '+';
                  return (
                    <span class="text-danger">
                      <i class="bi bi-x-square-fill" /> {prefix}
                      {formatPoints(row.point_difference)}
                    </span>
                  );
                }
              }

              if (row.rubric_difference.length === 0) {
                return <i class="bi bi-check-square-fill text-success" />;
              }

              return (
                <div>
                  {row.rubric_difference.map((item) => (
                    <div key={item.description}>
                      {item.false_positive ? (
                        <OverlayTrigger
                          overlay={<Tooltip>Selected by AI but not by human</Tooltip>}
                        >
                          <i class="bi bi-plus-square-fill text-danger" />
                        </OverlayTrigger>
                      ) : (
                        <OverlayTrigger
                          overlay={<Tooltip>Selected by human but not by AI</Tooltip>}
                        >
                          <i class="bi bi-dash-square-fill text-danger" />
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
              const rubricDiff = row.original.rubric_difference;
              if (!rubricDiff || !Array.isArray(rubricDiff)) return false;
              // Check if ALL of the selected items are in the disagreement
              return filterValues.every((description) =>
                rubricDiff.some((item) => item.description === description),
              );
            },
            sortingFn: (rowA, rowB) => {
              const aDiff = rowA.original.point_difference;
              const bDiff = rowB.original.point_difference;

              if (aDiff === null && bDiff === null) return 0;
              if (aDiff === null) return 1;
              if (bDiff === null) return -1;

              const aRubricDiff = rowA.original.rubric_difference?.length ?? 0;
              const bRubricDiff = rowB.original.rubric_difference?.length ?? 0;

              if (aRubricDiff !== bRubricDiff) {
                return aRubricDiff - bRubricDiff;
              }

              return Math.abs(aDiff) - Math.abs(bDiff);
            },
          }),
        ]
      : []),

    // Hidden column for filtering by rubric items
    columnHelper.accessor('rubric_grading_item_ids', {
      id: 'rubric_grading_item_ids',
      header: 'Rubric Items',
      enableHiding: false,
      enableSorting: false,
      cell: () => null,
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const rubricItemIds = row.original.rubric_grading_item_ids;
        // Check if ALL of the selected rubric item IDs are in the row's rubric_grading_item_ids
        return filterValues.every((itemId) => rubricItemIds.includes(itemId));
      },
    }),
  ];
}
