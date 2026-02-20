import { rankItem } from '@tanstack/match-sorter-utils';
import { useQuery } from '@tanstack/react-query';
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
import { parseAsArrayOf, parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import {
  TanstackTableCard,
  type TanstackTableCsvCell,
  TanstackTableEmptyState,
  createColumnFiltersChangeHandler,
  extractLeafColumnIds,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '@prairielearn/ui';

import type { PublicCourseInstance } from '../lib/client/safe-db-types.js';
import { getAiQuestionGenerationDraftsUrl } from '../lib/client/url.js';

import type { SafeQuestionsPageData } from './QuestionsTable.shared.js';
import {
  createQuestionsTableColumns,
  createQuestionsTableFilters,
} from './questionsTableColumns.js';

export type { SafeQuestionsPageData } from './QuestionsTable.shared.js';

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: ['qid'], right: [] };

export interface QuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  /** URL for the "Add question" page. If provided, an "Add question" button is shown. */
  addQuestionUrl?: string;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  questionsQueryOptions: {
    queryKey: readonly unknown[];
    queryFn?: (...args: any[]) => SafeQuestionsPageData[] | Promise<SafeQuestionsPageData[]>;
  };
}

export function QuestionsTable({
  questions: initialQuestions,
  courseInstances,
  currentCourseInstanceId,
  addQuestionUrl,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  qidPrefix,
  questionsQueryOptions,
}: QuestionsTableProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  const [topicFilter, setTopicFilter] = useQueryState(
    'topic',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [tagsFilter, setTagsFilter] = useQueryState(
    'tags',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [sharingSetsFilter, setSharingSetsFilter] = useQueryState(
    'sharing',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [versionFilter, setVersionFilter] = useQueryState(
    'version',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [gradingMethodFilter, setGradingMethodFilter] = useQueryState(
    'grading',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [externalGradingImageFilter, setExternalGradingImageFilter] = useQueryState(
    'extImage',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [workspaceImageFilter, setWorkspaceImageFilter] = useQueryState(
    'wsImage',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const courseInstanceIds = useMemo(() => courseInstances.map((ci) => ci.id), [courseInstances]);

  const defaultAssessmentFilterParsers = useMemo(() => {
    return Object.fromEntries(
      courseInstanceIds.map((id) => [`ci_${id}`, parseAsArrayOf(parseAsString).withDefault([])]),
    );
  }, [courseInstanceIds]);

  const [assessmentFilters, setAssessmentFilters] = useQueryStates(defaultAssessmentFilterParsers);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const {
    data: questions = initialQuestions,
    error: questionsError,
    isError: isQuestionsError,
  } = useQuery({
    ...questionsQueryOptions,
    staleTime: Infinity,
    initialData: initialQuestions,
  });

  const columns = useMemo(
    () => createQuestionsTableColumns({ courseInstances, qidPrefix, showSharingSets, urlPrefix }),
    [courseInstances, qidPrefix, showSharingSets, urlPrefix],
  );

  const allColumnIds = extractLeafColumnIds(columns);

  const hasLegacyQuestions = useMemo(() => {
    return initialQuestions.some((q) => q.display_type !== 'v3');
  }, [initialQuestions]);

  const defaultColumnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const id of allColumnIds) {
      if (id === 'sharing_sets') {
        visibility[id] = false;
      } else if (id === 'display_type') {
        visibility[id] = hasLegacyQuestions;
      } else if (id === 'grading_method') {
        visibility[id] = false;
      } else if (id === 'external_grading_image') {
        visibility[id] = false;
      } else if (id === 'workspace_image') {
        visibility[id] = false;
      } else if (id.startsWith('ci_')) {
        const ciId = id.replace(/^ci_/, '');
        visibility[id] = currentCourseInstanceId === ciId;
      } else {
        visibility[id] = true;
      }
    }
    return visibility;
  }, [allColumnIds, currentCourseInstanceId, hasLegacyQuestions]);

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];

    if (topicFilter.length > 0) {
      filters.push({ id: 'topic', value: topicFilter });
    }
    if (tagsFilter.length > 0) {
      filters.push({ id: 'tags', value: tagsFilter });
    }
    if (sharingSetsFilter.length > 0) {
      filters.push({ id: 'sharing_sets', value: sharingSetsFilter });
    }
    if (versionFilter.length > 0) {
      filters.push({ id: 'display_type', value: versionFilter });
    }
    if (gradingMethodFilter.length > 0) {
      filters.push({ id: 'grading_method', value: gradingMethodFilter });
    }
    if (externalGradingImageFilter.length > 0) {
      filters.push({ id: 'external_grading_image', value: externalGradingImageFilter });
    }
    if (workspaceImageFilter.length > 0) {
      filters.push({ id: 'workspace_image', value: workspaceImageFilter });
    }

    for (const [urlKey, values] of Object.entries(assessmentFilters)) {
      if (values.length > 0) {
        filters.push({ id: urlKey, value: values });
      }
    }

    return filters;
  }, [
    topicFilter,
    tagsFilter,
    sharingSetsFilter,
    versionFilter,
    gradingMethodFilter,
    externalGradingImageFilter,
    workspaceImageFilter,
    assessmentFilters,
  ]);

  const columnFilterSetters = useMemo<
    Record<string, ((_columnId: string, value: string[]) => void) | undefined>
  >(() => {
    return {
      qid: undefined,
      title: undefined,
      topic: (_columnId: string, value: string[]) => void setTopicFilter(value),
      tags: (_columnId: string, value: string[]) => void setTagsFilter(value),
      sharing_sets: (_columnId: string, value: string[]) => void setSharingSetsFilter(value),
      display_type: (_columnId: string, value: string[]) => void setVersionFilter(value),
      grading_method: (_columnId: string, value: string[]) => void setGradingMethodFilter(value),
      external_grading_image: (_columnId: string, value: string[]) =>
        void setExternalGradingImageFilter(value),
      workspace_image: (_columnId: string, value: string[]) => void setWorkspaceImageFilter(value),
      ...Object.fromEntries(
        courseInstanceIds.map((id) => [
          `ci_${id}`,
          (_columnId: string, value: string[]) =>
            void setAssessmentFilters({ [`ci_${id}`]: value }),
        ]),
      ),
    };
  }, [
    setTopicFilter,
    setTagsFilter,
    setSharingSetsFilter,
    setVersionFilter,
    setGradingMethodFilter,
    setExternalGradingImageFilter,
    setWorkspaceImageFilter,
    courseInstanceIds,
    setAssessmentFilters,
  ]);

  const handleColumnFiltersChange = useMemo(
    () => createColumnFiltersChangeHandler(columnFilters, columnFilterSetters),
    [columnFilters, columnFilterSetters],
  );

  const filters = useMemo(
    () =>
      createQuestionsTableFilters({
        questions: initialQuestions,
        courseInstances,
        showSharingSets,
      }),
    [initialQuestions, courseInstances, showSharingSets],
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
            { name: 'QID', value: row.qid },
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
          addQuestionUrl ? (
            <>
              <Button variant="light" size="sm" as="a" href={addQuestionUrl}>
                <i className="fa fa-plus me-2" aria-hidden="true" />
                Add question
              </Button>
              {showAiGenerateQuestionButton && (
                <Button variant="light" size="sm" as="a" href={aiGenerateUrl}>
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
                      href="https://prairielearn.readthedocs.io/en/latest/question/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      question documentation
                    </a>
                    .
                  </p>
                </div>
                {addQuestionUrl && (
                  <div className="d-flex gap-2">
                    <Button variant="primary" as="a" href={addQuestionUrl}>
                      <i className="fa fa-plus me-2" aria-hidden="true" />
                      Add question
                    </Button>
                    {showAiGenerateQuestionButton && (
                      <Button variant="outline-primary" as="a" href={aiGenerateUrl}>
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
