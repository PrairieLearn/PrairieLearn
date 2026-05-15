import { rankItem } from '@tanstack/match-sorter-utils';
import { type QueryFunction, useQuery } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type FilterFn,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import {
  type MultiSelectFilterValue,
  TanstackTableCard,
  type TanstackTableCsvCell,
  TanstackTableEmptyState,
  createColumnFiltersChangeHandler,
  extractLeafColumnIds,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsSortingState,
} from '@prairielearn/ui';

import type { PublicCourseInstance } from '../lib/client/safe-db-types.js';
import { getAiQuestionGenerationDraftsUrl } from '../lib/client/url.js';

import type { SafeQuestionsPageData } from './QuestionsTable.shared.js';
import {
  createQuestionsTableColumns,
  createQuestionsTableFilters,
} from './questionsTableColumns.js';

const fuzzyFilter: FilterFn<SafeQuestionsPageData> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: ['qid'], right: [] };
const HIDDEN_BY_DEFAULT = new Set([
  'sharing_sets',
  'grading_method',
  'external_grading_image',
  'workspace_image',
]);

const FILTER_COLUMN_URL_KEYS: Record<string, string> = {
  topic: 'topic',
  tags: 'tags',
  sharing_sets: 'sharing',
  display_type: 'version',
  grading_method: 'grading',
  external_grading_image: 'extImage',
  workspace_image: 'wsImage',
};
const EMPTY_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };

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
}: QuestionsTableProps<TQueryKey>) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  const filterParsers = useMemo(
    () =>
      Object.fromEntries([
        ...Object.values(FILTER_COLUMN_URL_KEYS).map((urlKey) => [
          urlKey,
          parseAsMultiSelectFilter().withDefault(EMPTY_FILTER),
        ]),
        ...courseInstances.map((ci) => [
          `ci_${ci.id}`,
          parseAsMultiSelectFilter().withDefault(EMPTY_FILTER),
        ]),
      ]),
    [courseInstances],
  );

  const [filterValues, setFilterValues] = useQueryStates(filterParsers);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const {
    data: questions = initialQuestions,
    error: questionsError,
    isError: isQuestionsError,
  } = useQuery({
    ...questionsQueryOptions,
    // Provide a no-op queryFn if none was given (e.g. public questions page
    // where data is embedded in the initial HTML and never refetched).
    queryFn: questionsQueryOptions.queryFn ?? (() => Promise.resolve(initialQuestions)),
    staleTime: Infinity,
    initialData: initialQuestions,
  });

  const columns = useMemo(
    () =>
      createQuestionsTableColumns({
        courseInstances,
        qidPrefix,
        showSharingSets,
        courseId,
        courseInstanceId: currentCourseInstanceId,
        isPublic,
      }),
    [courseInstances, qidPrefix, showSharingSets, courseId, currentCourseInstanceId, isPublic],
  );

  const allColumnIds = useMemo(() => extractLeafColumnIds(columns), [columns]);

  const hasLegacyQuestions = questions.some((q) => q.display_type !== 'v3');

  const defaultColumnVisibility = useMemo(
    () =>
      run(() => {
        const visibility: Record<string, boolean> = {};
        for (const id of allColumnIds) {
          if (HIDDEN_BY_DEFAULT.has(id)) {
            visibility[id] = false;
          } else if (id === 'display_type') {
            visibility[id] = hasLegacyQuestions;
          } else if (id.startsWith('ci_')) {
            const ciId = id.replace(/^ci_/, '');
            visibility[id] = currentCourseInstanceId === ciId;
          } else {
            visibility[id] = true;
          }
        }
        return visibility;
      }),
    [allColumnIds, hasLegacyQuestions, currentCourseInstanceId],
  );
  const defaultColumnVisibilityRef = useMemo(
    () => ({ current: defaultColumnVisibility }),
    [defaultColumnVisibility],
  );

  const columnVisibilityParser = useMemo(
    () =>
      parseAsColumnVisibilityStateWithColumns(allColumnIds, defaultColumnVisibilityRef).withDefault(
        defaultColumnVisibility,
      ),
    [allColumnIds, defaultColumnVisibility, defaultColumnVisibilityRef],
  );

  const [columnVisibility, setColumnVisibility] = useQueryState('columns', columnVisibilityParser);

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    for (const [columnId, urlKey] of Object.entries(FILTER_COLUMN_URL_KEYS)) {
      const filterValue = filterValues[urlKey] ?? EMPTY_FILTER;
      if (filterValue.values.length > 0) {
        filters.push({ id: columnId, value: filterValue });
      }
    }
    for (const ci of courseInstances) {
      const filterValue = filterValues[`ci_${ci.id}`] ?? EMPTY_FILTER;
      if (filterValue.values.length > 0) {
        filters.push({ id: `ci_${ci.id}`, value: filterValue });
      }
    }
    return filters;
  }, [filterValues, courseInstances]);

  const columnFilterSetters = useMemo<
    Record<string, ((_columnId: string, value: MultiSelectFilterValue | null) => void) | undefined>
  >(
    () => ({
      ...Object.fromEntries(
        Object.entries(FILTER_COLUMN_URL_KEYS).map(([columnId, urlKey]) => [
          columnId,
          (_: string, value: MultiSelectFilterValue | null) =>
            void setFilterValues({ [urlKey]: value }),
        ]),
      ),
      ...Object.fromEntries(
        courseInstances.map((ci) => [
          `ci_${ci.id}`,
          (_: string, value: MultiSelectFilterValue | null) =>
            void setFilterValues({ [`ci_${ci.id}`]: value }),
        ]),
      ),
    }),
    [courseInstances, setFilterValues],
  );

  const handleColumnFiltersChange = useMemo(
    () => createColumnFiltersChangeHandler(columnFilters, columnFilterSetters),
    [columnFilters, columnFilterSetters],
  );

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
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
    },
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
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

  return (
    <>
      {isQuestionsError && (
        <Alert variant="danger" className="mb-3">
          <strong>Error loading questions:</strong> {questionsError.message}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Questions"
        className={isQuestionsError ? undefined : 'h-100'}
        singularLabel="question"
        pluralLabel="questions"
        downloadButtonOptions={{
          filenameBase: 'questions',
          hasSelection: false,
          mapRowToData: (row: SafeQuestionsPageData): TanstackTableCsvCell[] => [
            {
              name: 'QID',
              value: qidPrefix && row.share_publicly ? `${qidPrefix}${row.qid}` : row.qid,
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
          ],
        }}
        headerButtons={
          addQuestionUrl || showAiGenerateQuestionButton ? (
            <>
              {addQuestionUrl && (
                <Button variant="light" size="sm" href={addQuestionUrl}>
                  <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                  Add question
                </Button>
              )}
              {showAiGenerateQuestionButton && (
                <Button variant="light" size="sm" href={aiGenerateUrl}>
                  <i className="bi bi-stars me-2" aria-hidden="true" />
                  Generate with AI
                </Button>
              )}
            </>
          ) : undefined
        }
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
                {(addQuestionUrl || showAiGenerateQuestionButton) && (
                  <div className="d-flex gap-2">
                    {addQuestionUrl && (
                      <Button variant="primary" href={addQuestionUrl}>
                        <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                        Add question
                      </Button>
                    )}
                    {showAiGenerateQuestionButton && (
                      <Button variant="outline-primary" href={aiGenerateUrl}>
                        <i className="bi bi-stars me-2" aria-hidden="true" />
                        Generate with AI
                      </Button>
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
      />
    </>
  );
}

QuestionsTable.displayName = 'QuestionsTable';
