import { QueryClient, useQuery } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import { Nav, Tab } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { NuqsAdapter } from '@prairielearn/ui';

import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import { getAppError } from '../../../../lib/client/errors.js';
import type { StaffQuestion } from '../../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import type {
  DraftQuestionBrowseData,
  DraftQuestionFileContents,
} from '../../../../lib/draft-question-files/browser.js';
import { CODE_EDITOR_TAB_FILES } from '../../../../lib/draft-question-files/paths.shared.js';
import {
  parseSelectionQueryParam,
  selectionParser,
} from '../../../../lib/draft-question-files/selection.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { createCourseTrpcClient } from '../../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../../trpc/course/context.js';
import type { CourseRouter } from '../../../../trpc/course/trpc.js';
import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { AiQuestionGenerationChat } from './AiQuestionGenerationChat.js';
import { AllQuestionFiles } from './AllQuestionFiles.js';
import { FinalizeModal } from './FinalizeModal.js';
import { QuestionCodeEditors } from './QuestionCodeEditors.js';
import { QuestionPreviewPane } from './QuestionPreviewPane.js';
import { DRAFT_QID_PREFIX, QuestionTitleAndQid } from './QuestionTitleAndQid.js';
import {
  DraftFilesContext,
  type DraftFilesContextValue,
  useDraftEditorRegistry,
} from './draftFilesContext.js';
import {
  AI_DRAFT_EDITOR_TABS,
  type AiDraftEditorTab,
  tabParser,
} from './useDraftFileNavigation.js';
import { useQuestionGenerationChat } from './useQuestionGenerationChat.js';
import { useQuestionHtml } from './useQuestionHtml.js';
import { useRefetchDraftFiles } from './useRefetchDraftFiles.js';

interface AiQuestionGenerationEditorProps {
  chatCsrfToken: string;
  trpcCsrfToken: string;
  courseId: string;
  question: StaffQuestion;
  initialMessages: QuestionGenerationUIMessage[];
  fileContents: DraftQuestionFileContents;
  browseData: DraftQuestionBrowseData;
  currentUserName: string | null;
  richTextEditorEnabled: boolean;
  urlPrefix: string;
  csrfToken: string;
  questionContainerHtml: string;
  showJobLogsLink: boolean;
  variantUrl: string;
  variantCsrfToken: string;
  search: string;
}

function AiQuestionGenerationEditorInner({
  chatCsrfToken,
  question,
  initialMessages,
  currentUserName,
  richTextEditorEnabled,
  urlPrefix,
  csrfToken,
  questionContainerHtml,
  showJobLogsLink,
  variantUrl,
  variantCsrfToken,
}: AiQuestionGenerationEditorProps) {
  const trpc = useTRPC();
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(question.title);
  const [currentQid, setCurrentQid] = useState(question.qid);
  const refetchDraftFiles = useRefetchDraftFiles();
  const [selection] = useQueryState('selection', selectionParser);

  const { registerEditor, getHasUnsavedChanges, discardUnsavedChanges } = useDraftEditorRegistry();

  const {
    wrapperRef: previewWrapperRef,
    newVariant,
    previewError,
    dismissPreviewError,
  } = useQuestionHtml({ variantUrl, variantCsrfToken });

  const chat = useQuestionGenerationChat({
    chatCsrfToken,
    questionId: question.id,
    urlPrefix,
    currentUserName,
    initialMessages,
    refreshQuestionPreview: newVariant,
    onFilesChanged: () => void refetchDraftFiles(),
  });
  const isGenerating = chat.isGenerating;

  // After a file mutation: refresh the file data, then reload the preview.
  const handleFileMutated = useCallback(async () => {
    await refetchDraftFiles();
    newVariant();
  }, [refetchDraftFiles, newVariant]);

  const { data: fileContents, error: rawContentsError } = useQuery(
    trpc.aiDraftFiles.contents.queryOptions(
      { questionId: question.id },
      {
        staleTime: Infinity,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
      },
    ),
  );
  const contentsError = getAppError<AiDraftFilesError['Contents']>(rawContentsError);
  // Memoized for referential stability: `files` feeds the `htmlContents` memo
  // below and child props.
  const files = useMemo(() => fileContents?.files ?? {}, [fileContents]);

  const handleTitleAndQidSaved = useCallback(
    (update: { qid: string | null; title: string | null }) => {
      setCurrentQid(update.qid);
      setCurrentTitle(update.title);
      void refetchDraftFiles();
    },
    [refetchDraftFiles],
  );

  // The `tab` param has no parser-level default: when absent, fall back based
  // on the URL selection (a file selection opens the "All files" tab).
  const [tabParam, setActiveTab] = useQueryState('tab', tabParser);
  const defaultTab =
    selection.kind === 'file' && !CODE_EDITOR_TAB_FILES.has(selection.path)
      ? 'all-files'
      : 'preview';
  const activeTab = tabParam ?? defaultTab;
  const activeTabKey =
    activeTab === 'rich-text-editor' && !richTextEditorEnabled ? 'preview' : activeTab;

  const handleSelectTab = useCallback(
    (tab: string | null) => {
      if (tab && AI_DRAFT_EDITOR_TABS.includes(tab as AiDraftEditorTab)) {
        void setActiveTab(tab as AiDraftEditorTab);
      }
    },
    [setActiveTab],
  );

  const htmlContents = useMemo(
    () => b64DecodeUnicode(files['question.html']?.encodedContents ?? ''),
    [files],
  );
  const isQuestionEmpty = htmlContents.trim() === '';

  const draftFilesContextValue = useMemo<DraftFilesContextValue>(
    () => ({
      questionId: question.id,
      urlPrefix,
      isGenerating,
      registerEditor,
      onFileMutated: handleFileMutated,
      getHasUnsavedChanges,
      discardUnsavedChanges,
    }),
    [
      question.id,
      urlPrefix,
      isGenerating,
      registerEditor,
      handleFileMutated,
      getHasUnsavedChanges,
      discardUnsavedChanges,
    ],
  );

  return (
    <DraftFilesContext value={draftFilesContextValue}>
      <Tab.Container activeKey={activeTabKey} onSelect={handleSelectTab}>
        <div className="app-content">
          <AiQuestionGenerationChat
            chat={chat}
            chatCsrfToken={chatCsrfToken}
            questionId={question.id}
            showJobLogsLink={showJobLogsLink}
            urlPrefix={urlPrefix}
            isQuestionEmpty={isQuestionEmpty}
          />

          <div className="app-preview-tabs z-1">
            <QuestionTitleAndQid
              currentQid={currentQid}
              currentTitle={currentTitle}
              onSaved={handleTitleAndQidSaved}
            />
            <div className="d-flex flex-row align-items-stretch bg-light">
              <Nav variant="tabs" className="me-auto ps-2 pt-2">
                <Nav.Item>
                  <Nav.Link eventKey="preview">Preview</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="files">Files</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="all-files">All files</Nav.Link>
                </Nav.Item>
                {richTextEditorEnabled ? (
                  <Nav.Item>
                    <Nav.Link eventKey="rich-text-editor">Rich text editor</Nav.Link>
                  </Nav.Item>
                ) : null}
              </Nav>
              <div className="d-flex align-items-center justify-content-end flex-grow-1 border-bottom pe-2">
                {!isQuestionEmpty && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    data-bs-toggle="tooltip"
                    data-bs-title="Finalize a question to use it on assessments and make manual edits"
                    disabled={isGenerating}
                    onClick={() => setShowFinalizeModal(true)}
                  >
                    <i className="fa fa-check" aria-hidden="true" />
                    Finalize question
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="app-preview">
            <Tab.Content className="h-100">
              <Tab.Pane eventKey="preview" className="h-100">
                <QuestionPreviewPane
                  questionContainerHtml={questionContainerHtml}
                  previewWrapperRef={previewWrapperRef}
                  previewError={previewError}
                  isQuestionEmpty={isQuestionEmpty}
                  onDismissPreviewError={dismissPreviewError}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="files" className="h-100">
                <QuestionCodeEditors
                  htmlFile={files['question.html'] ?? null}
                  pythonFile={files['server.py'] ?? null}
                  filesError={contentsError}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="all-files" className="h-100">
                <AllQuestionFiles />
              </Tab.Pane>
              <Tab.Pane eventKey="rich-text-editor" className="h-100">
                {richTextEditorEnabled && (
                  <RichTextEditor
                    htmlContents={htmlContents}
                    csrfToken={csrfToken}
                    isGenerating={isGenerating}
                  />
                )}
              </Tab.Pane>
            </Tab.Content>
          </div>
          <FinalizeModal
            // Key on the current values so the uncontrolled inputs reset when the
            // user edits the title/QID inline and reopens the modal.
            key={`${currentTitle ?? ''}::${currentQid ?? ''}`}
            csrfToken={csrfToken}
            show={showFinalizeModal}
            // Don't pre-fill auto-generated placeholder values like "draft #3" or
            // "draft_3" — these are system defaults that users almost certainly
            // want to replace when finalizing, so showing them would just force
            // the user to clear the field before typing a real value.
            defaultTitle={
              currentTitle && !/^draft #\d+$/i.test(currentTitle) ? currentTitle : undefined
            }
            defaultQid={run(() => {
              const suffix = currentQid?.startsWith(DRAFT_QID_PREFIX)
                ? currentQid.slice(DRAFT_QID_PREFIX.length)
                : (currentQid ?? undefined);
              if (suffix && /^draft_\d+$/.test(suffix)) return undefined;
              return suffix;
            })}
            onHide={() => setShowFinalizeModal(false)}
          />
        </div>
      </Tab.Container>
    </DraftFilesContext>
  );
}

export function AiQuestionGenerationEditor(props: AiQuestionGenerationEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => {
    const trpcClient = createCourseTrpcClient({
      csrfToken: props.trpcCsrfToken,
      courseId: props.courseId,
    });

    // Seed the cache with the server-rendered data so the initial render
    // doesn't refetch. The `browse` entry is keyed by the selection the server
    // rendered (the page URL's), which is also the selection the hydrated
    // client starts from; navigating to other selections fetches fresh data.
    const trpc = createTRPCOptionsProxy<CourseRouter>({ client: trpcClient, queryClient });
    const initialSelection = parseSelectionQueryParam(
      new URLSearchParams(props.search).get('selection'),
    );
    queryClient.setQueryData(
      trpc.aiDraftFiles.contents.queryKey({ questionId: props.question.id }),
      props.fileContents,
    );
    queryClient.setQueryData(
      trpc.aiDraftFiles.browse.queryKey({
        questionId: props.question.id,
        selection: initialSelection,
      }),
      props.browseData,
    );

    return trpcClient;
  });

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <NuqsAdapter search={props.search}>
          <AiQuestionGenerationEditorInner {...props} />
        </NuqsAdapter>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AiQuestionGenerationEditor.displayName = 'AiQuestionGenerationEditor';
