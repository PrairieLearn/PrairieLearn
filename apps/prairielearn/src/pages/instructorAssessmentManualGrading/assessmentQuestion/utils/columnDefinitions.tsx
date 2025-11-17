import { type Row, type Table, createColumnHelper } from '@tanstack/react-table';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { numericColumnFilterFn } from '@prairielearn/ui';

import type { StaffAssessment } from '../../../../lib/client/safe-db-types.js';
import { getStudentEnrollmentUrl } from '../../../../lib/client/url.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../../lib/db-types.js';
import { formatPoints } from '../../../../lib/format.js';
import type { InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from '../assessmentQuestion.types.js';

import { PointsWithEditButton, ScoreWithEditButton, generateAiGraderName } from './columnUtils.js';

const columnHelper = createColumnHelper<InstanceQuestionRow>();

interface CreateColumnsParams {
  aiGradingMode: boolean;
  instanceQuestionGroups: InstanceQuestionGroup[];
  assessmentQuestion: AssessmentQuestion;
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
  assessment: StaffAssessment;
  createCheckboxProps: (row: Row<InstanceQuestionRow>, table: Table<InstanceQuestionRow>) => any;
  onEditPointsSuccess: () => void;
  onEditPointsConflict: (conflictDetailsUrl: string) => void;
  scrollRef: React.RefObject<HTMLDivElement> | null;
}

export function createColumns({
  aiGradingMode,
  instanceQuestionGroups,
  assessment,
  assessmentQuestion,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
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
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          // Prevent browser from autocompleting the checkbox value when you return to the page.
          autocomplete="off"
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

    columnHelper.accessor((row, index) => index, {
      id: 'index',
      header: 'Instance',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div>
            <a
              href={`${urlPrefix}/assessment/${assessment.id}/manual_grading/instance_question/${row.instance_question.id}`}
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
                <button type="button" class="btn btn-xs btn-ghost ms-2">
                  <i class="fas fa-exclamation-triangle text-warning" />
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
          return <span class="text-secondary">No Group</span>;
        }
        const group = instanceQuestionGroups.find((g) => g.instance_question_group_name === value);
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
      header: assessment.group_work ? 'Group name' : 'Name',
      cell: (info) => info.getValue() || '—',
    }),

    columnHelper.accessor('uid', {
      id: 'uid',
      header: assessment.group_work ? 'UIDs' : 'UID',
      cell: (info) => {
        const uid = info.getValue();
        const enrollmentId = info.row.original.enrollment_id;
        if (!uid) return '—';
        if (enrollmentId) {
          return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{uid}</a>;
        }
        return uid;
      },
    }),

    columnHelper.accessor((row) => row.instance_question.requires_manual_grading, {
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
                  class={`badge rounded-pill text-bg-light border ${
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

        if (rowData.instance_question.ai_grading_status !== 'None') {
          const aiGraderName = generateAiGraderName(rowData.instance_question.ai_grading_status);
          if (filterValues.includes(aiGraderName)) return true;
        }

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
      size: 300,
      minSize: 200,
      maxSize: 600,
      meta: {
        wrapText: true,
      },
      cell: (info) => {
        const row = info.row.original;
        if (row.instance_question.point_difference === null) {
          return '—';
        }

        if (row.instance_question.rubric_difference === null) {
          if (!row.instance_question.point_difference) {
            return <i class="bi bi-check-square-fill text-success" />;
          } else {
            const prefix = row.instance_question.point_difference < 0 ? '' : '+';
            return (
              <span class="text-danger">
                <i class="bi bi-x-square-fill" /> {prefix}
                {formatPoints(row.instance_question.point_difference)}
              </span>
            );
          }
        }

        if (row.instance_question.rubric_difference.length === 0) {
          return (
            <OverlayTrigger overlay={<Tooltip>AI and human grading are in agreement</Tooltip>}>
              <i class="bi bi-check-square-fill text-success" />
            </OverlayTrigger>
          );
        }

        return (
          <div>
            {row.instance_question.rubric_difference.map((item) => (
              <div key={item.description}>
                {item.false_positive ? (
                  <OverlayTrigger overlay={<Tooltip>Selected by AI but not by human</Tooltip>}>
                    <i class="bi bi-plus-square-fill text-danger" />
                  </OverlayTrigger>
                ) : (
                  <OverlayTrigger overlay={<Tooltip>Selected by human but not by AI</Tooltip>}>
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
