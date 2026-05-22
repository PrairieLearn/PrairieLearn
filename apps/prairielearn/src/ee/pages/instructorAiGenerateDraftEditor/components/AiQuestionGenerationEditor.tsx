import { QueryClient, useQuery } from '@tanstack/react-query';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Nav, Tab } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { NuqsAdapter } from '@prairielearn/ui';

import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import type { StaffQuestion } from '../../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import type {
  DraftQuestionFileBrowserData,
  SelectedQuestionFile,
  SelectedQuestionFilePreview,
} from '../../../../lib/draft-question-files.js';
import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.js';

import { AiQuestionGenerationChat } from './AiQuestionGenerationChat.js';
import { FinalizeModal } from './FinalizeModal.js';
import {
  type CodeEditorsHandle,
  type NewVariantHandle,
  QuestionAndFilePreview,
} from './QuestionAndFilePreview.js';
import { DRAFT_QID_PREFIX, QuestionTitleAndQid } from './QuestionTitleAndQid.js';
import { TRPCProvider, createAiDraftFilesTrpcClient, useTRPC } from './aiDraftFilesTrpc.js';
import { useDraftQuestionFileMutations } from './useDraftQuestionFileMutations.js';

const AI_DRAFT_EDITOR_TABS = ['preview', 'files', 'all-files', 'rich-text-editor'] as const;

type AiDraftEditorTab = (typeof AI_DRAFT_EDITOR_TABS)[number];

interface AiQuestionGenerationEditorProps {
  chatCsrfToken: string;
  trpcCsrfToken: string;
  trpcUrl: string;
  uploadCsrfToken: string;
  question: StaffQuestion;
  initialMessages: QuestionGenerationUIMessage[];
  questionFiles: Record<string, string>;
  fileBrowser: DraftQuestionFileBrowserData | null;
  selectedFile: SelectedQuestionFile | null;
  selectedFilePreview: SelectedQuestionFilePreview | null;
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
  questionFiles: initialQuestionFiles,
  fileBrowser,
  selectedFile,
  selectedFilePreview,
  richTextEditorEnabled,
  urlPrefix,
  csrfToken,
  uploadCsrfToken,
  questionContainerHtml,
  showJobLogsLink,
  variantUrl,
  variantCsrfToken,
  search,
}: AiQuestionGenerationEditorProps) {
  const trpc = useTRPC();
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(question.title);
  const [currentQid, setCurrentQid] = useState(question.qid);
  const newVariantRef = useRef<NewVariantHandle>(null);
  const codeEditorsRef = useRef<CodeEditorsHandle>(null);
  const [selectedFilePath, setSelectedFilePath] = useQueryState('file', parseAsString);
  const [selectedDirectory, setSelectedDirectory] = useQueryState('dir', parseAsString);
  const initialFileQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      file: params.get('file'),
      dir: params.get('dir'),
    };
  }, [search]);
  const initialQuestionFilesData = useMemo(
    () => ({
      files: initialQuestionFiles,
      fileBrowser,
      selectedFile,
      selectedFilePreview,
    }),
    [fileBrowser, initialQuestionFiles, selectedFile, selectedFilePreview],
  );
  const selectedFilesMatchInitialQuery =
    selectedFilePath === initialFileQuery.file && selectedDirectory === initialFileQuery.dir;

  const {
    data: questionFilesData,
    error: filesError,
    refetch: refetchFiles,
  } = useQuery({
    ...trpc.aiDraftFiles.list.queryOptions(
      {
        questionId: question.id,
        selectedFilePath,
        selectedDirectory,
      },
      {
        staleTime: Infinity,
        initialData: selectedFilesMatchInitialQuery ? initialQuestionFilesData : undefined,
        placeholderData: (previousData) => previousData ?? initialQuestionFilesData,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
      },
    ),
  });

  const {
    files: questionFiles,
    fileBrowser: currentFileBrowser,
    selectedFile: currentSelectedFile,
    selectedFilePreview: currentSelectedFilePreview,
  } = questionFilesData ?? initialQuestionFilesData;

  const handleTitleAndQidSaved = useCallback(
    (update: { qid: string | null; title: string | null }) => {
      setCurrentQid(update.qid);
      setCurrentTitle(update.title);
      void refetchFiles();
    },
    [refetchFiles],
  );

  const handleFilesMutated = useCallback(async () => {
    await refetchFiles();
    newVariantRef.current?.newVariant();
  }, [refetchFiles]);

  const fileBrowserActions = useDraftQuestionFileMutations({
    questionId: question.id,
    uploadUrl: `${urlPrefix}/ai_generate_editor/${question.id}/files`,
    uploadCsrfToken,
    onMutated: handleFilesMutated,
  });
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(AI_DRAFT_EDITOR_TABS)
      .withDefault(
        currentSelectedFile == null && currentSelectedFilePreview == null ? 'preview' : 'all-files',
      )
      .withOptions({ clearOnDefault: false }),
  );
  const activeTabKey =
    activeTab === 'rich-text-editor' && !richTextEditorEnabled ? 'preview' : activeTab;
  const allFilesHref = useMemo(() => {
    const params = new URLSearchParams(search);
    params.delete('file');
    params.set('tab', 'all-files');
    if (selectedDirectory == null) {
      params.delete('dir');
    } else {
      params.set('dir', selectedDirectory);
    }

    return `?${params.toString()}`;
  }, [search, selectedDirectory]);

  const handleSelectTab = useCallback(
    (tab: string | null) => {
      if (tab && AI_DRAFT_EDITOR_TABS.includes(tab as AiDraftEditorTab)) {
        void setActiveTab(tab as AiDraftEditorTab);
      }
    },
    [setActiveTab],
  );

  const handleSelectFile = useCallback(
    async (filePath: string) => {
      await setSelectedFilePath(filePath);
      await setActiveTab('all-files', { clearOnDefault: false });
    },
    [setActiveTab, setSelectedFilePath],
  );

  const handleClearSelectedFile = useCallback(async () => {
    await setActiveTab('all-files', { clearOnDefault: false });
    await setSelectedFilePath(null);
  }, [setActiveTab, setSelectedFilePath]);

  const handleSelectDirectory = useCallback(
    async (directory: string | null) => {
      await setSelectedFilePath(null);
      await setSelectedDirectory(directory);
      await setActiveTab('all-files', { clearOnDefault: false });
    },
    [setActiveTab, setSelectedDirectory, setSelectedFilePath],
  );

  const isQuestionEmpty = useMemo(
    () => b64DecodeUnicode(questionFiles['question.html'] ?? '').trim() === '',
    [questionFiles],
  );

  return (
    <Tab.Container activeKey={activeTabKey} onSelect={handleSelectTab}>
      <div className="app-content">
        <AiQuestionGenerationChat
          chatCsrfToken={chatCsrfToken}
          initialMessages={initialMessages}
          questionId={question.id}
          showJobLogsLink={showJobLogsLink}
          urlPrefix={urlPrefix}
          refreshQuestionPreview={() => newVariantRef.current?.newVariant()}
          getHasUnsavedChanges={() => codeEditorsRef.current?.getHasUnsavedChanges() ?? false}
          discardUnsavedChanges={() => codeEditorsRef.current?.discardChanges()}
          isQuestionEmpty={isQuestionEmpty}
          onGeneratingChange={setIsGenerating}
          onGenerationComplete={() => refetchFiles()}
        />

        <div className="app-preview-tabs z-1">
          <QuestionTitleAndQid
            currentQid={currentQid}
            currentTitle={currentTitle}
            csrfToken={csrfToken}
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
          <QuestionAndFilePreview
            questionFiles={questionFiles}
            fileBrowser={currentFileBrowser}
            selectedFile={currentSelectedFile}
            selectedFilePreview={currentSelectedFilePreview}
            allFilesHref={allFilesHref}
            richTextEditorEnabled={richTextEditorEnabled}
            questionContainerHtml={questionContainerHtml}
            csrfToken={csrfToken}
            questionId={question.id}
            qid={currentQid}
            variantUrl={variantUrl}
            variantCsrfToken={variantCsrfToken}
            newVariantRef={newVariantRef}
            codeEditorsRef={codeEditorsRef}
            isGenerating={isGenerating}
            filesError={filesError}
            fileBrowserActions={fileBrowserActions}
            onRetryFiles={() => refetchFiles()}
            onSelectTab={(tab) => void setActiveTab(tab)}
            onSelectFile={(filePath) => void handleSelectFile(filePath)}
            onSelectDirectory={(directory) => void handleSelectDirectory(directory)}
            onClearSelectedFile={() => void handleClearSelectedFile()}
            onSelectedFileSaved={handleFilesMutated}
          />
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
  );
}

export function AiQuestionGenerationEditor(props: AiQuestionGenerationEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAiDraftFilesTrpcClient({ csrfToken: props.trpcCsrfToken, trpcUrl: props.trpcUrl }),
  );

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
