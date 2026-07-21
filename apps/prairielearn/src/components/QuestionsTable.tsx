import { type QueryFunction, useQuery } from '@tanstack/react-query';
import {
  type ColumnPinningState,
  type ColumnSizingState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  type Table,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsString, useQueryState } from 'nuqs';
import { type ReactNode, useMemo, useState } from 'react';
import { ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import {
  type ColumnFilterEntry,
  IndeterminateCheckbox,
  type MultiSelectFilterValue,
  TanstackTableCard,
  type TanstackTableCsvCell,
  TanstackTableEmptyState,
  extractLeafColumnIds,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsSortingState,
  useColumnFilters,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { AppErrorAlert, getAppError } from '../lib/client/errors.js';
import type { PublicCourseInstance } from '../lib/client/safe-db-types.js';
import { rankSearchText } from '../lib/client/search.js';
import {
  QUESTION_TABLE_FILTER_URL_KEYS,
  getAiQuestionGenerationDraftsUrl,
  getCourseInstanceBaseUrl,
} from '../lib/client/url.js';
import type { QuestionsError } from '../trpc/course/questions.js';

import type { SafeQuestionsPageData } from './QuestionsTable.shared.js';
import {
  createQuestionsTableColumns,
  createQuestionsTableFilters,
} from './questionsTableColumns.js';

const fuzzyFilter: FilterFn<SafeQuestionsPageData> = (row, columnId, value, addMeta) => {
  const itemRank = rankSearchText(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: ['qid'], right: [] };
const HIDDEN_BY_DEFAULT = new Set([
  'display_type',
  'grading_method',
  'external_grading_image',
  'workspace_image',
  'single_variant',
  'has_preferences',
]);

const EMPTY_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const columnHelper = createColumnHelper<SafeQuestionsPageData>();

function SelectAllCheckbox({ table }: { table: Table<SafeQuestionsPageData> }) {
  return (
    <IndeterminateCheckbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      aria-label="Select all questions"
      onChange={() => table.toggleAllPageRowsSelected()}
    />
  );
}

function displayQid(row: SafeQuestionsPageData, qidPrefix?: string): string {
  return qidPrefix && row.share_publicly ? `${qidPrefix}${row.qid}` : row.qid;
}

interface QuestionsTableProps<TQueryKey extends readonly unknown[] = readonly unknown[]> {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  courseId: string;
  currentCourseInstanceId?: string;
  addQuestionUrl?: string;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  isPublic?: boolean;
  qidPrefix?: string;
  questionsQueryOptions: {
    queryKey: TQueryKey;
    queryFn?: QueryFunction<SafeQuestionsPageData[], TQueryKey>;
  };
  renderSelectionToolbar?: (props: {
    selectedQuestions: SafeQuestionsPageData[];
    clearSelection: () => void;
    trimSelection: (count: number) => void;
  }) => ReactNode;
}

export function QuestionsTable<TQueryKey extends readonly unknown[]>({
  questions: initialQuestions,
  courseInstances,
  courseId,
  currentCourseInstanceId,
  addQuestionUrl,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  isPublic,
  qidPrefix,
  questionsQueryOptions,
  renderSelectionToolbar,
}: QuestionsTableProps<TQueryKey>) {
  const rowSelectionEnabled = renderSelectionToolbar != null;
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const defaultPinning: ColumnPinningState = {
    left: rowSelectionEnabled ? ['select', 'qid'] : DEFAULT_PINNING.left,
    right: DEFAULT_PINNING.right,
  };
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(defaultPinning),
  );

  const filterRegistry = useMemo(() => {
    const registry: Record<string, ColumnFilterEntry<MultiSelectFilterValue>> = {};
    for (const [columnId, urlKey] of Object.entries(QUESTION_TABLE_FILTER_URL_KEYS)) {
      registry[columnId] = {
        urlKey,
        parser: parseAsMultiSelectFilter(),
        defaultValue: EMPTY_FILTER,
        enabled: columnId === 'sharing_sets' ? showSharingSets : true,
      };
    }
    for (const ci of courseInstances) {
      registry[`ci_${ci.id}`] = {
        parser: parseAsMultiSelectFilter(),
        defaultValue: EMPTY_FILTER,
      };
    }
    return registry;
  }, [courseInstances, showSharingSets]);

  const { columnFilters, activeColumnFilterIds, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { createCheckboxProps } = useShiftClickCheckbox<SafeQuestionsPageData>();

  const { data: questions = initialQuestions, error: questionsError } = useQuery({
    ...questionsQueryOptions,
    // Provide a no-op queryFn if none was given (e.g. public questions page
    // where data is embedded in the initial HTML and never refetched).
    queryFn: questionsQueryOptions.queryFn ?? (() => Promise.resolve(initialQuestions)),
    staleTime: Infinity,
    initialData: initialQuestions,
  });

  const columns = useMemo(() => {
    const questionColumns = createQuestionsTableColumns({
      courseInstances,
      qidPrefix,
      showSharingSets,
      courseId,
      courseInstanceId: currentCourseInstanceId,
      isPublic,
    });
    if (!rowSelectionEnabled) {
      return questionColumns;
    }
    const selectionColumn = columnHelper.display({
      id: 'select',
      header: ({ table }) => <SelectAllCheckbox table={table} />,
      cell: ({ row, table }) => (
        <input
          type="checkbox"
          aria-label={`Select ${displayQid(row.original, qidPrefix)}`}
          {...createCheckboxProps(row, table)}
        />
      ),
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableSorting: false,
      enableHiding: false,
      enablePinning: true,
    });
    return [selectionColumn, ...questionColumns];
  }, [
    courseInstances,
    qidPrefix,
    showSharingSets,
    courseId,
    currentCourseInstanceId,
    isPublic,
    rowSelectionEnabled,
    createCheckboxProps,
  ]);

  const allColumnIds = useMemo(() => extractLeafColumnIds(columns), [columns]);

  const defaultColumnVisibility = useMemo(
    () =>
      run(() => {
        const visibility: Record<string, boolean> = {};
        for (const id of allColumnIds) {
          if (HIDDEN_BY_DEFAULT.has(id)) {
            visibility[id] = false;
          } else if (id.startsWith('ci_')) {
            const ciId = id.replace(/^ci_/, '');
            visibility[id] = currentCourseInstanceId === ciId;
          } else {
            visibility[id] = true;
          }
        }
        return visibility;
      }),
    [allColumnIds, currentCourseInstanceId],
  );
  const columnVisibilityParser = useMemo(
    () =>
      parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
    [allColumnIds, defaultColumnVisibility],
  );

  const [columnVisibility, setColumnVisibility] = useQueryState('columns', columnVisibilityParser);

  const filters = useMemo(
    () =>
      createQuestionsTableFilters({
        questions,
        courseInstances,
      }),
    [questions, courseInstances],
  );

  const table = useReactTable({
    data: questions,
    columns,
    columnResizeMode: 'onChange',
    globalFilterFn: fuzzyFilter,
    enableRowSelection: rowSelectionEnabled,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
      rowSelection,
    },
    initialState: {
      columnPinning: defaultPinning,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 80,
      size: 150,
      maxSize: 500,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  const aiGenerateUrl = getAiQuestionGenerationDraftsUrl({ urlPrefix });
  const importQuestionsUrl =
    addQuestionUrl && courseInstances.length > 0
      ? `${getCourseInstanceBaseUrl(currentCourseInstanceId ?? courseInstances[0].id)}/instructor/instance_admin/qti_import?return_to=questions`
      : undefined;

  const selectedQuestions = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const displayedCount = table.getRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;
  const selectedCount = selectedQuestions.length;
  const isFiltered = displayedCount !== totalCount;

  const statusContent =
    rowSelectionEnabled && selectedCount > 0 ? (
      <>
        Selected {selectedCount} of {displayedCount}{' '}
        {displayedCount === 1 ? 'question' : 'questions'}
        {isFiltered && ' (filtered)'}
      </>
    ) : undefined;

  const selectionToolbar =
    rowSelectionEnabled && selectedQuestions.length > 0
      ? renderSelectionToolbar({
          selectedQuestions,
          clearSelection: () => setRowSelection({}),
          trimSelection: (count) => {
            const kept = table.getFilteredSelectedRowModel().rows.slice(0, count);
            setRowSelection(Object.fromEntries(kept.map((row) => [row.id, true])));
          },
        })
      : null;

  const addQuestionButtons = run(() => {
    if (!addQuestionUrl && !importQuestionsUrl && !showAiGenerateQuestionButton) {
      return null;
    }

    return (
      <DropdownButton as={ButtonGroup} title="Add questions" size="sm" variant="light">
        {addQuestionUrl && (
          <Dropdown.Item as="a" href={addQuestionUrl}>
            <i className="bi bi-plus-lg me-2" aria-hidden="true" />
            Create new question
          </Dropdown.Item>
        )}
        {showAiGenerateQuestionButton && (
          <Dropdown.Item as="a" href={aiGenerateUrl}>
            <i className="bi bi-stars me-2" aria-hidden="true" />
            Generate question with AI
          </Dropdown.Item>
        )}
        {importQuestionsUrl && (
          <>
            {(addQuestionUrl || showAiGenerateQuestionButton) && <Dropdown.Divider />}
            <Dropdown.Item as="a" href={importQuestionsUrl}>
              <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
              Import questions
            </Dropdown.Item>
          </>
        )}
      </DropdownButton>
    );
  });

  const headerButtons =
    selectionToolbar || addQuestionButtons ? (
      <>
        {selectionToolbar}
        {addQuestionButtons}
      </>
    ) : undefined;

  const appError = getAppError<QuestionsError['List']>(questionsError);

  return (
    <>
      <AppErrorAlert
        error={appError}
        className="mb-3"
        render={{ UNKNOWN: ({ message }) => <>Error loading questions: {message}</> }}
      />
      <TanstackTableCard
        table={table}
        title="Questions"
        className={appError ? undefined : 'h-100'}
        singularLabel="question"
        pluralLabel="questions"
        downloadButtonOptions={{
          filenameBase: 'questions',
          hasSelection: rowSelectionEnabled,
          mapRowToData: (row: SafeQuestionsPageData): TanstackTableCsvCell[] => [
            {
              name: 'QID',
              value: displayQid(row, qidPrefix),
            },
            { name: 'Title', value: row.title },
            { name: 'Topic', value: row.topic.name },
            { name: 'Tags', value: row.tags?.map((t) => t.name).join(', ') ?? null },
            { name: 'Type', value: row.display_type },
            { name: 'Grading method', value: row.grading_method },
            {
              name: 'External grading image',
              value: row.external_grading_image,
            },
            { name: 'Workspace image', value: row.workspace_image },
            { name: 'Single variant', value: row.single_variant ? 'Yes' : 'No' },
            { name: 'Has preferences', value: row.has_preferences ? 'Yes' : 'No' },
          ],
          mapRowToJsonData: (row: SafeQuestionsPageData) => ({
            qid: displayQid(row, qidPrefix),
            title: row.title,
            topic: row.topic.name,
            tags: row.tags?.map((tag) => tag.name) ?? [],
            type: row.display_type,
            grading_method: row.grading_method,
            external_grading_image: row.external_grading_image,
            workspace_image: row.workspace_image,
            single_variant: row.single_variant,
            has_preferences: row.has_preferences,
          }),
        }}
        headerButtons={headerButtons}
        globalFilter={{
          placeholder: 'Search by QID, title...',
        }}
        tableOptions={{
          filters,
          emptyState: (
            <TanstackTableEmptyState iconName="bi-file-earmark-code">
              <div className="d-flex flex-column align-items-center gap-3">
                <div className="text-center">
                  <h5 className="mb-2">No questions found</h5>
                  <p className="text-muted mb-0" style={{ textWrap: 'balance' }}>
                    A question is a problem or task that tests a student's understanding of a
                    specific concept.
                  </p>
                  <p className="text-muted">
                    Learn more in the{' '}
                    <a
                      href="https://docs.prairielearn.com/question/overview/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      question documentation
                    </a>
                    .
                  </p>
                </div>
                {(addQuestionUrl || importQuestionsUrl || showAiGenerateQuestionButton) && (
                  <div className="d-flex gap-2">
                    {importQuestionsUrl && (
                      <a className="btn btn-primary" href={importQuestionsUrl}>
                        <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
                        Import questions
                      </a>
                    )}
                    {addQuestionUrl && (
                      <a
                        className={
                          importQuestionsUrl ? 'btn btn-outline-primary' : 'btn btn-primary'
                        }
                        href={addQuestionUrl}
                      >
                        <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                        Add question
                      </a>
                    )}
                    {showAiGenerateQuestionButton && (
                      <a className="btn btn-outline-primary" href={aiGenerateUrl}>
                        <i className="bi bi-stars me-2" aria-hidden="true" />
                        Generate with AI
                      </a>
                    )}
                  </div>
                )}
              </div>
            </TanstackTableEmptyState>
          ),
          noResultsState: (
            <TanstackTableEmptyState iconName="bi-search">
              No questions found matching your search criteria.
            </TanstackTableEmptyState>
          ),
        }}
        statusContent={statusContent}
        activeColumnFilterIds={activeColumnFilterIds}
        onResetColumnFilters={onResetColumnFilters}
      />
    </>
  );
}

QuestionsTable.displayName = 'QuestionsTable';
